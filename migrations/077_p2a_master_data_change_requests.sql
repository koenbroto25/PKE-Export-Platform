-- Migration 077: P15 canonical master-data change request and independent approval workflow.
-- Target: existing Neon UAT branch only. No Production apply is authorized by this migration.
BEGIN;

INSERT INTO public.permissions(name,code,description,is_active)
VALUES
 ('View Master Data Change Requests','pks.master_data.change_request.view','View Project-scoped supplier/facility identity change requests.',true),
 ('Manage Master Data Change Requests','pks.master_data.change_request.manage','Create and edit own draft master-data change requests; submit for Platform Admin review.',true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
VALUES ('pm','pks.master_data.change_request.view'),('pm','pks.master_data.change_request.manage')
ON CONFLICT (role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id,granted_by)
SELECT pr.project_id,pr.id,perm.id,NULL
FROM public.project_roles pr
JOIN public.permissions perm ON perm.code IN
 ('pks.master_data.change_request.view','pks.master_data.change_request.manage')
WHERE pr.role_code='pm' AND pr.is_active=true AND perm.is_active=true
ON CONFLICT (project_role_id,permission_id) DO NOTHING;

CREATE TABLE public.p2a_master_data_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 entity_type text NOT NULL CHECK (entity_type IN ('organization','facility')),
 operation text NOT NULL CHECK (operation IN ('create','update')),
 target_id uuid NULL,
 proposed_data jsonb NOT NULL CHECK (jsonb_typeof(proposed_data)='object' AND proposed_data <> '{}'::jsonb),
 base_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(base_snapshot)='object'),
 status text NOT NULL DEFAULT 'draft'
   CHECK (status IN ('draft','submitted','approved','rejected')),
 request_reason text NOT NULL CHECK (length(btrim(request_reason)) BETWEEN 10 AND 2000),
 source_type text NOT NULL DEFAULT 'manual'
   CHECK (source_type IN ('manual','public_reference','official_document','buyer_confirmed')),
 source_reference text NOT NULL CHECK (length(btrim(source_reference)) BETWEEN 2 AND 500),
 source_url text NULL CHECK (source_url IS NULL OR source_url ~* '^https?://'),
 source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_snapshot)='object'),
 decision_note text NULL,
 requested_by uuid NOT NULL REFERENCES public.users(id),
 reviewed_by uuid NULL REFERENCES public.users(id),
 reviewed_at timestamptz NULL,
 applied_target_id uuid NULL,
 applied_at timestamptz NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT p2a_master_change_target CHECK (
   (operation='create' AND target_id IS NULL AND base_snapshot='{}'::jsonb)
   OR (operation='update' AND target_id IS NOT NULL)
 ),
 CONSTRAINT p2a_master_change_decision CHECK (
   (status IN ('draft','submitted') AND reviewed_by IS NULL AND reviewed_at IS NULL AND applied_at IS NULL)
   OR (status='rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND applied_at IS NULL)
   OR (status='approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND applied_at IS NOT NULL AND applied_target_id IS NOT NULL)
 )
);

CREATE INDEX p2a_master_change_project_status_idx
 ON public.p2a_master_data_change_requests(project_id,status,created_at DESC);
CREATE INDEX p2a_master_change_target_idx
 ON public.p2a_master_data_change_requests(entity_type,target_id,created_at DESC);

ALTER TABLE public.p2a_master_data_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p2a_master_data_change_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY p2a_master_change_select ON public.p2a_master_data_change_requests
 FOR SELECT TO app_runtime_secure
 USING (
   public.pke_is_platform_admin()
   OR public.pke_has_project_permission(project_id,'pks.master_data.change_request.view')
 );

CREATE POLICY p2a_master_change_insert ON public.p2a_master_data_change_requests
 FOR INSERT TO app_runtime_secure
 WITH CHECK (
   (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pks.master_data.change_request.manage'))
   AND requested_by=NULLIF(current_setting('app.current_user_id',true),'')::uuid
 );

CREATE POLICY p2a_master_change_update ON public.p2a_master_data_change_requests
 FOR UPDATE TO app_runtime_secure
 USING (
   public.pke_is_platform_admin()
   OR (
     requested_by=NULLIF(current_setting('app.current_user_id',true),'')::uuid
     AND public.pke_has_project_permission(project_id,'pks.master_data.change_request.manage')
   )
 )
 WITH CHECK (
   public.pke_is_platform_admin()
   OR (
     requested_by=NULLIF(current_setting('app.current_user_id',true),'')::uuid
     AND public.pke_has_project_permission(project_id,'pks.master_data.change_request.manage')
   )
 );

GRANT SELECT,INSERT,UPDATE ON public.p2a_master_data_change_requests TO app_runtime_secure;

-- Canonical identities remain non-editable to PM. Platform Admin may write only
-- through RLS-protected admin policies; there is deliberately no runtime DELETE policy.
CREATE POLICY p2a_partner_org_admin_insert ON public.partner_organizations
 FOR INSERT TO app_runtime_secure
 WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY p2a_partner_org_admin_update ON public.partner_organizations
 FOR UPDATE TO app_runtime_secure
 USING (public.pke_is_platform_admin())
 WITH CHECK (public.pke_is_platform_admin());

CREATE POLICY p2a_pks_sites_admin_insert ON public.pks_sites
 FOR INSERT TO app_runtime_secure
 WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY p2a_pks_sites_admin_update ON public.pks_sites
 FOR UPDATE TO app_runtime_secure
 USING (public.pke_is_platform_admin())
 WITH CHECK (public.pke_is_platform_admin());

CREATE OR REPLACE FUNCTION public.pke_apply_p2a_master_data_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_user_id uuid;
 v_admin boolean;
 v_current jsonb;
 v_target uuid;
 v_keys text[];
 v_allowed text[];
 v_org_type text;
 v_facility_type text;
 v_country text;
BEGIN
 v_user_id:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 v_admin:=public.pke_is_platform_admin();

 IF TG_OP='INSERT' THEN
   NEW.requested_by:=COALESCE(NEW.requested_by,v_user_id);
   IF NEW.requested_by IS DISTINCT FROM v_user_id THEN
     RAISE EXCEPTION 'Requester identity must match authenticated user' USING ERRCODE='42501';
   END IF;
   IF NEW.status<>'draft' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL
      OR NEW.applied_at IS NOT NULL OR NEW.applied_target_id IS NOT NULL THEN
     RAISE EXCEPTION 'New master-data requests must start as draft' USING ERRCODE='42501';
   END IF;
   IF NOT v_admin AND NOT public.pke_has_project_permission(NEW.project_id,'pks.master_data.change_request.manage') THEN
     RAISE EXCEPTION 'Master-data change request permission required' USING ERRCODE='42501';
   END IF;
   IF NEW.operation='update' THEN
     IF NEW.entity_type='organization' THEN
       SELECT jsonb_build_object(
         'legal_name',legal_name,'trading_name',trading_name,'organization_type',organization_type,
         'country_code',country_code,'registration_type',registration_type,'registration_number',registration_number,
         'registered_address',registered_address,'website',website,'email',email,'phone',phone
       ) INTO v_current FROM public.partner_organizations WHERE id=NEW.target_id FOR UPDATE;
     ELSE
       SELECT jsonb_build_object(
         'name',name,'location',location,'code',code,'address',address,'city',city,'province',province,
         'country_code',country_code,'latitude',latitude,'longitude',longitude,'organization_id',organization_id,
         'facility_type',facility_type,'operating_status',operating_status,
         'location_accuracy_m',location_accuracy_m,'access_constraints',access_constraints
       ) INTO v_current FROM public.pks_sites WHERE id=NEW.target_id FOR UPDATE;
     END IF;
     IF v_current IS NULL THEN RAISE EXCEPTION 'Canonical master record not found' USING ERRCODE='P0002'; END IF;
     NEW.base_snapshot:=v_current;
   ELSE
     NEW.base_snapshot:='{}'::jsonb;
   END IF;
   NEW.updated_at:=now();
   INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,
     source,reason,after_snapshot,metadata,outcome)
   VALUES(v_user_id,'user',NULLIF(current_setting('app.current_role',true),''),'pks.master_data.change_request.manage',
     'p2a.master_data_change_request.created','p2a_master_data_change_requests',NEW.id,NEW.project_id,
     'p2a_master_data_change_request',NEW.request_reason,to_jsonb(NEW),
     jsonb_build_object('entity_type',NEW.entity_type,'operation',NEW.operation,'source_type',NEW.source_type,'source_reference',NEW.source_reference),'success');
   RETURN NEW;
 END IF;

 -- Request payload, target and provenance are immutable after submission. The
 -- requester may edit only their own draft. Only Admin may make a decision.
 IF OLD.status='draft' AND NOT v_admin THEN
   IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR OLD.requested_by IS DISTINCT FROM v_user_id
      OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
      OR NEW.operation IS DISTINCT FROM OLD.operation
      OR NEW.target_id IS DISTINCT FROM OLD.target_id
      OR NEW.base_snapshot IS DISTINCT FROM OLD.base_snapshot
      OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
      OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.applied_target_id IS DISTINCT FROM OLD.applied_target_id
      OR NEW.applied_at IS DISTINCT FROM OLD.applied_at
      OR NEW.status NOT IN ('draft','submitted') THEN
     RAISE EXCEPTION 'Requester may only edit or submit own draft request' USING ERRCODE='42501';
   END IF;
 ELSIF v_admin THEN
   IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
      OR NEW.operation IS DISTINCT FROM OLD.operation
      OR NEW.target_id IS DISTINCT FROM OLD.target_id
      OR NEW.proposed_data IS DISTINCT FROM OLD.proposed_data
      OR NEW.base_snapshot IS DISTINCT FROM OLD.base_snapshot
      OR NEW.request_reason IS DISTINCT FROM OLD.request_reason
      OR NEW.source_type IS DISTINCT FROM OLD.source_type
      OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
      OR NEW.source_url IS DISTINCT FROM OLD.source_url
      OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
      OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
      OR NEW.applied_target_id IS DISTINCT FROM OLD.applied_target_id
      OR NEW.applied_at IS DISTINCT FROM OLD.applied_at THEN
     RAISE EXCEPTION 'Admin may decide a request but may not rewrite its submitted proposal' USING ERRCODE='42501';
   END IF;
 ELSE
   RAISE EXCEPTION 'Submitted master-data request is immutable to requester' USING ERRCODE='42501';
 END IF;

 IF NEW.status IS DISTINCT FROM OLD.status THEN
   IF OLD.status='draft' AND NEW.status='submitted' THEN
     IF v_admin OR OLD.requested_by IS DISTINCT FROM v_user_id THEN
       RAISE EXCEPTION 'Only the requester may submit a draft' USING ERRCODE='42501';
     END IF;
   ELSIF OLD.status='submitted' AND NEW.status IN ('approved','rejected') THEN
     IF NOT v_admin THEN RAISE EXCEPTION 'Only Platform Admin may approve or reject' USING ERRCODE='42501'; END IF;
     IF OLD.requested_by=v_user_id THEN RAISE EXCEPTION 'Requester cannot approve their own change request' USING ERRCODE='42501'; END IF;
     IF NEW.status='rejected' AND length(btrim(COALESCE(NEW.decision_note,'')))<5 THEN
       RAISE EXCEPTION 'A rejection decision note of at least 5 characters is required' USING ERRCODE='23514';
     END IF;
     NEW.reviewed_by:=v_user_id;
     NEW.reviewed_at:=now();

     IF NEW.status='approved' THEN
       IF NEW.entity_type='organization' THEN
         v_allowed:=ARRAY['legal_name','trading_name','organization_type','country_code','registration_type','registration_number','registered_address','website','email','phone'];
         v_keys:=ARRAY(SELECT jsonb_object_keys(NEW.proposed_data));
         IF EXISTS(SELECT 1 FROM unnest(v_keys) k WHERE NOT (k=ANY(v_allowed))) THEN
           RAISE EXCEPTION 'Organization proposal contains protected or unsupported fields' USING ERRCODE='23514';
         END IF;
         IF NEW.operation='create' THEN
           IF NOT (NEW.proposed_data ? 'legal_name' AND NEW.proposed_data ? 'organization_type' AND NEW.proposed_data ? 'country_code')
              OR length(btrim(COALESCE(NEW.proposed_data->>'legal_name','')))<2
              OR length(COALESCE(NEW.proposed_data->>'country_code',''))<>2 THEN
             RAISE EXCEPTION 'New organization requires legal_name (at least 2 characters), organization_type and two-letter country_code' USING ERRCODE='23514';
           END IF;
           v_org_type:=NEW.proposed_data->>'organization_type';
           IF v_org_type NOT IN ('buyer','supplier','processor','transporter','warehouse_operator','port_operator','shipping_agent','surveyor','funder','other') THEN
             RAISE EXCEPTION 'Invalid organization_type' USING ERRCODE='23514';
           END IF;
           INSERT INTO public.partner_organizations(legal_name,trading_name,organization_type,country_code,registration_type,
             registration_number,registered_address,website,email,phone,verification_status,source_type,source_reference,created_by)
           VALUES(NEW.proposed_data->>'legal_name',NEW.proposed_data->>'trading_name',v_org_type,
             upper(NEW.proposed_data->>'country_code'),NEW.proposed_data->>'registration_type',NEW.proposed_data->>'registration_number',
             CASE WHEN NEW.proposed_data ? 'registered_address' THEN NEW.proposed_data->'registered_address' END,
             NEW.proposed_data->>'website',NEW.proposed_data->>'email',NEW.proposed_data->>'phone',
             'unverified','manual',NEW.source_reference,NEW.requested_by)
           RETURNING id INTO v_target;
         ELSE
           SELECT jsonb_build_object(
             'legal_name',legal_name,'trading_name',trading_name,'organization_type',organization_type,
             'country_code',country_code,'registration_type',registration_type,'registration_number',registration_number,
             'registered_address',registered_address,'website',website,'email',email,'phone',phone
           ) INTO v_current FROM public.partner_organizations WHERE id=NEW.target_id FOR UPDATE;
           IF v_current IS DISTINCT FROM NEW.base_snapshot THEN RAISE EXCEPTION 'Organization changed after request submission; resubmit against current values' USING ERRCODE='40001'; END IF;
           UPDATE public.partner_organizations SET
             legal_name=CASE WHEN NEW.proposed_data ? 'legal_name' THEN NEW.proposed_data->>'legal_name' ELSE legal_name END,
             trading_name=CASE WHEN NEW.proposed_data ? 'trading_name' THEN NEW.proposed_data->>'trading_name' ELSE trading_name END,
             organization_type=CASE WHEN NEW.proposed_data ? 'organization_type' THEN NEW.proposed_data->>'organization_type' ELSE organization_type END,
             country_code=CASE WHEN NEW.proposed_data ? 'country_code' THEN upper(NEW.proposed_data->>'country_code') ELSE country_code END,
             registration_type=CASE WHEN NEW.proposed_data ? 'registration_type' THEN NEW.proposed_data->>'registration_type' ELSE registration_type END,
             registration_number=CASE WHEN NEW.proposed_data ? 'registration_number' THEN NEW.proposed_data->>'registration_number' ELSE registration_number END,
             registered_address=CASE WHEN NEW.proposed_data ? 'registered_address' THEN NEW.proposed_data->'registered_address' ELSE registered_address END,
             website=CASE WHEN NEW.proposed_data ? 'website' THEN NEW.proposed_data->>'website' ELSE website END,
             email=CASE WHEN NEW.proposed_data ? 'email' THEN NEW.proposed_data->>'email' ELSE email END,
             phone=CASE WHEN NEW.proposed_data ? 'phone' THEN NEW.proposed_data->>'phone' ELSE phone END,
             verification_status=CASE WHEN NEW.proposed_data ?| ARRAY['legal_name','country_code','registration_number','registered_address']
               THEN 'unverified' ELSE verification_status END,
             verified_by=CASE WHEN NEW.proposed_data ?| ARRAY['legal_name','country_code','registration_number','registered_address']
               THEN NULL ELSE verified_by END,
             verified_at=CASE WHEN NEW.proposed_data ?| ARRAY['legal_name','country_code','registration_number','registered_address']
               THEN NULL ELSE verified_at END,
             source_reference=NEW.source_reference,updated_at=now()
           WHERE id=NEW.target_id RETURNING id INTO v_target;
         END IF;
       ELSE
         v_allowed:=ARRAY['name','location','code','address','city','province','country_code','latitude','longitude','organization_id','facility_type','operating_status','location_accuracy_m','access_constraints'];
         v_keys:=ARRAY(SELECT jsonb_object_keys(NEW.proposed_data));
         IF EXISTS(SELECT 1 FROM unnest(v_keys) k WHERE NOT (k=ANY(v_allowed))) THEN
           RAISE EXCEPTION 'Facility proposal contains protected or unsupported fields' USING ERRCODE='23514';
         END IF;
         IF NEW.operation='create' THEN
           IF NOT (NEW.proposed_data ? 'name' AND NEW.proposed_data ? 'facility_type' AND NEW.proposed_data ? 'country_code')
              OR length(btrim(COALESCE(NEW.proposed_data->>'name','')))<2
              OR length(COALESCE(NEW.proposed_data->>'country_code',''))<>2 THEN
             RAISE EXCEPTION 'New facility requires name (at least 2 characters), facility_type and two-letter country_code' USING ERRCODE='23514';
           END IF;
           v_facility_type:=NEW.proposed_data->>'facility_type';
           IF v_facility_type NOT IN ('palm_oil_mill','kernel_crushing_plant','integrated_mill_kcp','warehouse','port_terminal','collection_point','other') THEN
             RAISE EXCEPTION 'Invalid facility_type' USING ERRCODE='23514';
           END IF;
           INSERT INTO public.pks_sites(name,location,code,address,city,province,country_code,latitude,longitude,organization_id,
             facility_type,operating_status,location_accuracy_m,access_constraints,verification_status,source_type,source_reference)
           VALUES(NEW.proposed_data->>'name',NEW.proposed_data->>'location',NEW.proposed_data->>'code',
             NEW.proposed_data->>'address',NEW.proposed_data->>'city',NEW.proposed_data->>'province',
             upper(NEW.proposed_data->>'country_code'),NULLIF(NEW.proposed_data->>'latitude','')::numeric,
             NULLIF(NEW.proposed_data->>'longitude','')::numeric,NULLIF(NEW.proposed_data->>'organization_id','')::uuid,
             v_facility_type,COALESCE(NEW.proposed_data->>'operating_status','planned'),
             NULLIF(NEW.proposed_data->>'location_accuracy_m','')::numeric,
             COALESCE(NEW.proposed_data->'access_constraints','{}'::jsonb),
             'unverified','manual',NEW.source_reference)
           RETURNING id INTO v_target;
         ELSE
           SELECT jsonb_build_object(
             'name',name,'location',location,'code',code,'address',address,'city',city,'province',province,
             'country_code',country_code,'latitude',latitude,'longitude',longitude,'organization_id',organization_id,
             'facility_type',facility_type,'operating_status',operating_status,
             'location_accuracy_m',location_accuracy_m,'access_constraints',access_constraints
           ) INTO v_current FROM public.pks_sites WHERE id=NEW.target_id FOR UPDATE;
           IF v_current IS DISTINCT FROM NEW.base_snapshot THEN RAISE EXCEPTION 'Facility changed after request submission; resubmit against current values' USING ERRCODE='40001'; END IF;
           UPDATE public.pks_sites SET
             name=CASE WHEN NEW.proposed_data ? 'name' THEN NEW.proposed_data->>'name' ELSE name END,
             location=CASE WHEN NEW.proposed_data ? 'location' THEN NEW.proposed_data->>'location' ELSE location END,
             code=CASE WHEN NEW.proposed_data ? 'code' THEN NEW.proposed_data->>'code' ELSE code END,
             address=CASE WHEN NEW.proposed_data ? 'address' THEN NEW.proposed_data->>'address' ELSE address END,
             city=CASE WHEN NEW.proposed_data ? 'city' THEN NEW.proposed_data->>'city' ELSE city END,
             province=CASE WHEN NEW.proposed_data ? 'province' THEN NEW.proposed_data->>'province' ELSE province END,
             country_code=CASE WHEN NEW.proposed_data ? 'country_code' THEN upper(NEW.proposed_data->>'country_code') ELSE country_code END,
             latitude=CASE WHEN NEW.proposed_data ? 'latitude' THEN NULLIF(NEW.proposed_data->>'latitude','')::numeric ELSE latitude END,
             longitude=CASE WHEN NEW.proposed_data ? 'longitude' THEN NULLIF(NEW.proposed_data->>'longitude','')::numeric ELSE longitude END,
             organization_id=CASE WHEN NEW.proposed_data ? 'organization_id' THEN NULLIF(NEW.proposed_data->>'organization_id','')::uuid ELSE organization_id END,
             facility_type=CASE WHEN NEW.proposed_data ? 'facility_type' THEN NEW.proposed_data->>'facility_type' ELSE facility_type END,
             operating_status=CASE WHEN NEW.proposed_data ? 'operating_status' THEN NEW.proposed_data->>'operating_status' ELSE operating_status END,
             location_accuracy_m=CASE WHEN NEW.proposed_data ? 'location_accuracy_m' THEN NULLIF(NEW.proposed_data->>'location_accuracy_m','')::numeric ELSE location_accuracy_m END,
             access_constraints=CASE WHEN NEW.proposed_data ? 'access_constraints' THEN NEW.proposed_data->'access_constraints' ELSE access_constraints END,
             verification_status=CASE WHEN NEW.proposed_data ?| ARRAY['name','address','city','province','country_code','latitude','longitude','organization_id','facility_type']
               THEN 'unverified' ELSE verification_status END,
             verified_by=CASE WHEN NEW.proposed_data ?| ARRAY['name','address','city','province','country_code','latitude','longitude','organization_id','facility_type']
               THEN NULL ELSE verified_by END,
             verified_at=CASE WHEN NEW.proposed_data ?| ARRAY['name','address','city','province','country_code','latitude','longitude','organization_id','facility_type']
               THEN NULL ELSE verified_at END,
             source_reference=NEW.source_reference,updated_at=now()
           WHERE id=NEW.target_id RETURNING id INTO v_target;
         END IF;
       END IF;

       NEW.applied_target_id:=v_target;
       NEW.applied_at:=now();
       INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,
         source,reason,before_snapshot,after_snapshot,metadata,outcome)
       VALUES(v_user_id,'user',NULLIF(current_setting('app.current_role',true),''),'pks.master_data.change_request.manage',
         'p2a.canonical_master_data.applied',CASE WHEN NEW.entity_type='organization' THEN 'partner_organizations' ELSE 'pks_sites' END,
         v_target,NEW.project_id,'p2a_master_data_change_request',NEW.request_reason,
         CASE WHEN NEW.operation='create' THEN NULL ELSE NEW.base_snapshot END,NEW.proposed_data,
         jsonb_build_object('request_id',NEW.id,'operation',NEW.operation,'source_reference',NEW.source_reference),'success');
     END IF;
   ELSE
     IF NEW.status IS DISTINCT FROM OLD.status THEN
       RAISE EXCEPTION 'Invalid master-data request status transition' USING ERRCODE='23514';
     END IF;
     IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.applied_target_id IS DISTINCT FROM OLD.applied_target_id OR NEW.applied_at IS DISTINCT FROM OLD.applied_at THEN
       RAISE EXCEPTION 'Review and apply stamps are system-controlled' USING ERRCODE='42501';
     END IF;
   END IF;
 END IF;

 NEW.updated_at:=now();
 INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,
   source,reason,before_snapshot,after_snapshot,metadata,outcome)
 VALUES(v_user_id,'user',NULLIF(current_setting('app.current_role',true),''),'pks.master_data.change_request.manage',
   'p2a.master_data_change_request.updated','p2a_master_data_change_requests',NEW.id,NEW.project_id,
   'p2a_master_data_change_request',COALESCE(NEW.decision_note,NEW.request_reason),to_jsonb(OLD),to_jsonb(NEW),
   jsonb_build_object('status',NEW.status,'reviewed_by',NEW.reviewed_by,'reviewed_at',NEW.reviewed_at,
     'applied_target_id',NEW.applied_target_id,'applied_at',NEW.applied_at),'success');
 RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.pke_apply_p2a_master_data_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_apply_p2a_master_data_change() TO app_runtime_secure;

CREATE TRIGGER p2a_master_data_change_guard_apply
BEFORE INSERT OR UPDATE ON public.p2a_master_data_change_requests
FOR EACH ROW EXECUTE FUNCTION public.pke_apply_p2a_master_data_change();

COMMIT;