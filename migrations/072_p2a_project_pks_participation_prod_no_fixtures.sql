-- Migration 072: P2-A Project-scoped PKS participation overlay and PM edit boundary.
-- Target: Neon UAT only. Production requires separate owner release approval.
BEGIN;

CREATE OR REPLACE FUNCTION public.pke_is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND u.role = 'admin' AND u.is_active = true
  )
$function$;
REVOKE ALL ON FUNCTION public.pke_is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_is_platform_admin() TO app_runtime_secure;

INSERT INTO public.permissions (name, code, description, is_active)
VALUES
 ('View Project PKS Sites','pks.site.view','View Project-scoped facility participation and non-sensitive facility identity.',true),
 ('Manage Project PKS Participation','pks.participation.manage','Manage Project-specific facility participation, operational capacity, delivery windows and notes; not global legal identity.',true),
 ('View Project Suppliers','supplier.view','View supplier organizations and Project participation.',true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
VALUES ('pm','pks.site.view'),('pm','pks.participation.manage'),('pm','supplier.view')
ON CONFLICT (role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id,granted_by)
SELECT pr.project_id,pr.id,perm.id,NULL
FROM public.project_roles pr
JOIN public.permissions perm ON perm.code IN ('pks.site.view','pks.participation.manage','supplier.view')
WHERE pr.role_code='pm' AND pr.is_active=true AND perm.is_active=true
ON CONFLICT (project_role_id,permission_id) DO NOTHING;

CREATE TABLE public.project_pks_site_participation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 pks_site_id uuid NOT NULL REFERENCES public.pks_sites(id) ON DELETE RESTRICT,
 vendor_id uuid NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
 operational_contact_name text NULL,
 operational_contact_email text NULL,
 operational_contact_phone text NULL,
 contracted_capacity_mt_month numeric(15,2) NULL CHECK(contracted_capacity_mt_month IS NULL OR contracted_capacity_mt_month>=0),
 allocated_capacity_mt_month numeric(15,2) NULL CHECK(allocated_capacity_mt_month IS NULL OR allocated_capacity_mt_month>=0),
 delivery_window jsonb NOT NULL DEFAULT '{}'::jsonb,
 project_terms text NULL,
 notes text NULL,
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','active','suspended','closed')),
 effective_from date NULL,
 effective_to date NULL,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 source_type text NOT NULL DEFAULT 'manual' CHECK(source_type IN ('manual','synthetic_seed','public_candidate','partner_verified')),
 source_reference text NULL,
 is_seed_data boolean NOT NULL DEFAULT false,
 seed_batch_id text NULL,
 created_by uuid NULL REFERENCES public.users(id),
 updated_by uuid NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT project_pks_site_participation_unique UNIQUE(project_id,pks_site_id),
 CONSTRAINT project_pks_site_participation_dates CHECK(effective_to IS NULL OR effective_from IS NULL OR effective_to>=effective_from),
 CONSTRAINT project_pks_site_participation_capacity CHECK(allocated_capacity_mt_month IS NULL OR contracted_capacity_mt_month IS NULL OR allocated_capacity_mt_month<=contracted_capacity_mt_month),
 CONSTRAINT project_pks_site_participation_seed CHECK((is_seed_data=false AND seed_batch_id IS NULL) OR (is_seed_data=true AND seed_batch_id IS NOT NULL AND source_type='synthetic_seed'))
);

COMMENT ON TABLE public.project_pks_site_participation IS
'Project-scoped operational overlay. PM/Admin may edit this overlay; global organization/facility identity remains independently governed. Seed records are explicitly marked by seed_batch_id.';

CREATE INDEX project_pks_site_participation_project_status_idx
 ON public.project_pks_site_participation(project_id,status,updated_at DESC);
CREATE INDEX project_pks_site_participation_site_idx
 ON public.project_pks_site_participation(pks_site_id);

CREATE POLICY p2a_pks_sites_platform_admin_read ON public.pks_sites
 FOR SELECT TO app_runtime_secure USING (public.pke_is_platform_admin());

ALTER TABLE public.project_pks_site_participation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_pks_site_participation FORCE ROW LEVEL SECURITY;

CREATE POLICY p2a_project_pks_participation_select ON public.project_pks_site_participation
 FOR SELECT TO app_runtime_secure
 USING(public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pks.site.view') OR public.pke_has_project_permission(project_id,'pks.participation.manage'));

CREATE POLICY p2a_project_pks_participation_insert ON public.project_pks_site_participation
 FOR INSERT TO app_runtime_secure
 WITH CHECK(public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pks.participation.manage'));

CREATE POLICY p2a_project_pks_participation_update ON public.project_pks_site_participation
 FOR UPDATE TO app_runtime_secure
 USING(public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pks.participation.manage'))
 WITH CHECK(public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pks.participation.manage'));

GRANT SELECT,INSERT,UPDATE ON public.project_pks_site_participation TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.pke_audit_project_pks_site_participation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_user_id uuid; v_role text;
BEGIN
 v_user_id:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 v_role:=NULLIF(current_setting('app.current_role',true),'');
 IF TG_OP='UPDATE' THEN NEW.updated_at:=now(); END IF;
 INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,source,reason,before_snapshot,after_snapshot,metadata,outcome)
 VALUES(
  v_user_id,CASE WHEN v_user_id IS NULL THEN 'system' ELSE 'user' END,v_role,
  'pks.participation.manage',
  CASE WHEN TG_OP='INSERT' THEN 'project_pks_participation.created' ELSE 'project_pks_participation.updated' END,
  'project_pks_site_participation',NEW.id,NEW.project_id,'p2a_pks_overlay',
  CASE WHEN NEW.is_seed_data THEN 'Synthetic P2-A starter fixture' ELSE 'Project PKS participation maintained' END,
  CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),
  jsonb_build_object('is_seed_data',NEW.is_seed_data,'seed_batch_id',NEW.seed_batch_id,'source_type',NEW.source_type),'success'
 );
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_audit_project_pks_site_participation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_audit_project_pks_site_participation() TO app_runtime_secure;
CREATE TRIGGER p2a_project_pks_participation_audit
BEFORE INSERT OR UPDATE ON public.project_pks_site_participation
FOR EACH ROW EXECUTE FUNCTION public.pke_audit_project_pks_site_participation();

-- Production-safe adaptation: intentionally omit all synthetic UAT fixtures.

COMMIT;
