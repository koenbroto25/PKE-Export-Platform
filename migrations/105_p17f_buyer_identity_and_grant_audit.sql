-- Migration 105: verified Neon Auth to Buyer master mapping and Buyer grant audit.
BEGIN;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,p.id
FROM public.project_roles pr
JOIN public.permissions p ON p.code='buyer.visibility.manage'
WHERE pr.is_active=true AND pr.role_code='pm'
ON CONFLICT(project_role_id,permission_id) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,p.id
FROM public.project_roles pr
JOIN public.permissions p ON p.code='buyer.shipment.view'
WHERE pr.is_active=true AND pr.role_code='buyer'
ON CONFLICT(project_role_id,permission_id) DO NOTHING;

CREATE TABLE public.buyer_auth_user_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE RESTRICT,
  mapping_status text NOT NULL DEFAULT 'pending_review'
    CHECK (mapping_status IN ('pending_review','active','suspended','revoked')),
  created_by uuid NOT NULL REFERENCES public.users(id),
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buyer_auth_mapping_review_ck CHECK (
    (mapping_status='active' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND reviewed_by<>created_by AND length(btrim(COALESCE(review_note,'')))>=5)
    OR mapping_status<>'active'
  )
);
CREATE UNIQUE INDEX buyer_auth_mapping_active_buyer_uq
  ON public.buyer_auth_user_mappings(buyer_id)
  WHERE mapping_status='active';
CREATE UNIQUE INDEX buyer_auth_mapping_single_owner_uq
  ON public.buyer_auth_user_mappings(buyer_id)
  WHERE mapping_status IN ('pending_review','active','suspended');
CREATE INDEX buyer_auth_mapping_status_idx
  ON public.buyer_auth_user_mappings(mapping_status,buyer_id);

CREATE TABLE public.buyer_auth_mapping_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_id uuid NOT NULL REFERENCES public.buyer_auth_user_mappings(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE RESTRICT,
  event_code text NOT NULL CHECK(event_code IN ('mapping_created','activated','suspended','revoked')),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  reason text NOT NULL CHECK(length(btrim(reason))>=5),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX buyer_auth_mapping_events_buyer_idx
  ON public.buyer_auth_mapping_events(buyer_id,created_at DESC);
ALTER TABLE public.buyer_auth_mapping_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_auth_mapping_events FORCE ROW LEVEL SECURITY;
CREATE POLICY buyer_auth_mapping_events_admin_read
  ON public.buyer_auth_mapping_events FOR SELECT TO app_runtime_secure
  USING(public.pke_is_platform_admin());
CREATE POLICY buyer_auth_mapping_events_admin_insert
  ON public.buyer_auth_mapping_events FOR INSERT TO app_runtime_secure
  WITH CHECK(public.pke_is_platform_admin() AND actor_id=public.pke_current_user_id());
GRANT SELECT,INSERT ON public.buyer_auth_mapping_events TO app_runtime_secure;



CREATE TABLE public.buyer_visibility_grant_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES public.buyer_visibility_grants(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE RESTRICT,
  event_code text NOT NULL CHECK (event_code IN ('granted','revoked','expired')),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  reason text NOT NULL CHECK (length(btrim(reason))>=5),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX buyer_visibility_grant_events_buyer_idx
  ON public.buyer_visibility_grant_events(buyer_id,project_id,created_at DESC);

ALTER TABLE public.buyer_auth_user_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_auth_user_mappings FORCE ROW LEVEL SECURITY;
CREATE POLICY buyer_auth_mapping_admin_all
  ON public.buyer_auth_user_mappings FOR ALL TO app_runtime_secure
  USING (public.pke_is_platform_admin())
  WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY buyer_auth_mapping_project_grant_manager_read
  ON public.buyer_auth_user_mappings FOR SELECT TO app_runtime_secure
  USING (
    mapping_status='active'
    AND public.pke_has_project_permission(
      NULLIF(current_setting('app.current_project_id',true),'')::uuid,
      'buyer.visibility.manage'
    )
  );

CREATE POLICY buyer_auth_mapping_self_read
  ON public.buyer_auth_user_mappings FOR SELECT TO app_runtime_secure
  USING (user_id=public.pke_current_user_id() AND mapping_status='active');

ALTER TABLE public.buyer_visibility_grant_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY buyer_visibility_grant_events_project_insert
  ON public.buyer_visibility_grant_events FOR INSERT TO app_runtime_secure
  WITH CHECK (
    project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
    AND actor_id=public.pke_current_user_id()
    AND public.pke_has_project_permission(project_id,'buyer.visibility.manage')
  );


ALTER TABLE public.buyer_visibility_grant_events FORCE ROW LEVEL SECURITY;
CREATE POLICY buyer_visibility_grant_events_admin_read
  ON public.buyer_visibility_grant_events FOR SELECT TO app_runtime_secure
  USING (public.pke_is_platform_admin());
CREATE POLICY buyer_visibility_grant_events_admin_insert
  ON public.buyer_visibility_grant_events FOR INSERT TO app_runtime_secure
  WITH CHECK (public.pke_is_platform_admin() AND actor_id=public.pke_current_user_id());

GRANT SELECT,INSERT,UPDATE ON public.buyer_auth_user_mappings TO app_runtime_secure;
GRANT SELECT,INSERT ON public.buyer_visibility_grant_events TO app_runtime_secure;

-- A mapping may only be activated after a real Neon Auth identity is explicitly attached.
CREATE OR REPLACE FUNCTION public.pke_guard_buyer_auth_mapping()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM public.pke_current_user_id()
       OR NEW.mapping_status<>'pending_review'
       OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Buyer mapping must be created as pending review by the authenticated administrator'
        USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Buyer mapping identity is immutable; revoke and create a new mapping'
        USING ERRCODE='23514';
    END IF;
    IF NOT (
      (OLD.mapping_status='pending_review' AND NEW.mapping_status IN ('active','revoked'))
      OR (OLD.mapping_status='active' AND NEW.mapping_status='suspended')
      OR (OLD.mapping_status='suspended' AND NEW.mapping_status='revoked')
    ) THEN
      RAISE EXCEPTION 'Invalid Buyer mapping lifecycle transition'
        USING ERRCODE='23514';
    END IF;
    IF NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()
       OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=NEW.created_by
       OR NEW.reviewed_at IS NULL OR length(btrim(COALESCE(NEW.review_note,'')))<5 THEN
      RAISE EXCEPTION 'Buyer mapping lifecycle requires independent authenticated review'
        USING ERRCODE='42501';
    END IF;
  END IF;
  IF NEW.mapping_status='active' AND NOT EXISTS (
    SELECT 1 FROM public.users u JOIN public.buyers b ON b.id=NEW.buyer_id
    WHERE u.id=NEW.user_id AND u.neon_auth_user_id IS NOT NULL
      AND u.is_active IS TRUE AND b.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Active Buyer mapping requires an active user with explicitly linked Neon Auth identity and active Buyer master'
      USING ERRCODE='23514';
  END IF;
  NEW.updated_at=now();
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_buyer_auth_mapping() FROM PUBLIC;
CREATE TRIGGER buyer_auth_mapping_guard
BEFORE INSERT OR UPDATE ON public.buyer_auth_user_mappings
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_buyer_auth_mapping();

CREATE OR REPLACE FUNCTION public.pke_audit_buyer_auth_mapping()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE event_name text; event_reason text;
BEGIN
  IF TG_OP='INSERT' THEN
    event_name:='mapping_created';
    event_reason:='Mapping created and queued for independent review';
  ELSE
    event_name:=CASE NEW.mapping_status WHEN 'active' THEN 'activated' WHEN 'suspended' THEN 'suspended' ELSE 'revoked' END;
    event_reason:=NEW.review_note;
  END IF;
  INSERT INTO public.buyer_auth_mapping_events(mapping_id,user_id,buyer_id,event_code,actor_id,reason)
  VALUES(NEW.id,NEW.user_id,NEW.buyer_id,event_name,public.pke_current_user_id(),event_reason);
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_audit_buyer_auth_mapping() FROM PUBLIC;
CREATE TRIGGER buyer_auth_mapping_audit
AFTER INSERT OR UPDATE OF mapping_status ON public.buyer_auth_user_mappings
FOR EACH ROW EXECUTE FUNCTION public.pke_audit_buyer_auth_mapping();



-- Buyer-facing RLS is additive: visibility requires an active identity mapping and an active,
-- unexpired grant scoped to the exact Project and (when present) shipment.
CREATE POLICY buyers_project_visibility_manager_read
  ON public.buyers FOR SELECT TO app_runtime_secure
  USING (
    public.pke_has_project_permission(
      NULLIF(current_setting('app.current_project_id',true),'')::uuid,
      'buyer.visibility.manage'
    )
  );

CREATE POLICY buyers_verified_mapping_self_read
  ON public.buyers FOR SELECT TO app_runtime_secure
  USING (
    EXISTS (
      SELECT 1 FROM public.buyer_auth_user_mappings m
      JOIN public.users u ON u.id=m.user_id AND u.is_active IS TRUE AND u.neon_auth_user_id IS NOT NULL
      JOIN public.buyers active_buyer ON active_buyer.id=m.buyer_id AND active_buyer.is_active IS TRUE
      WHERE m.buyer_id=buyers.id AND m.user_id=public.pke_current_user_id()
        AND m.mapping_status='active'
    )
  );

CREATE POLICY buyer_visibility_grants_project_manager_read
  ON public.buyer_visibility_grants FOR SELECT TO app_runtime_secure
  USING (
    project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
    AND public.pke_has_project_permission(project_id,'buyer.visibility.manage')
  );

CREATE POLICY buyer_visibility_grants_buyer_read
  ON public.buyer_visibility_grants FOR SELECT TO app_runtime_secure
  USING (
    status='active' AND (expires_at IS NULL OR expires_at>now())
    AND EXISTS (
      SELECT 1 FROM public.buyer_auth_user_mappings m
      JOIN public.users u ON u.id=m.user_id AND u.is_active IS TRUE AND u.neon_auth_user_id IS NOT NULL
      JOIN public.buyers b ON b.id=m.buyer_id AND b.is_active IS TRUE
      WHERE m.user_id=public.pke_current_user_id()
        AND m.buyer_id=buyer_visibility_grants.buyer_id
        AND m.mapping_status='active'
    )
  );

CREATE POLICY shipments_buyer_summary_read
  ON public.shipments FOR SELECT TO app_runtime_secure
  USING (
    EXISTS (
      SELECT 1 FROM public.buyer_visibility_grants g
      JOIN public.buyer_auth_user_mappings m ON m.buyer_id=g.buyer_id
      JOIN public.users u ON u.id=m.user_id AND u.is_active IS TRUE AND u.neon_auth_user_id IS NOT NULL
      JOIN public.buyers b ON b.id=m.buyer_id AND b.is_active IS TRUE
      WHERE m.user_id=public.pke_current_user_id() AND m.mapping_status='active'
        AND g.project_id=shipments.project_id AND (g.shipment_id IS NULL OR g.shipment_id=shipments.id)
        AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>now())
        AND g.scope IN ('summary','milestones')
    )
  );

CREATE POLICY shipment_events_buyer_milestones_read
  ON public.shipment_events FOR SELECT TO app_runtime_secure
  USING (
    EXISTS (
      SELECT 1 FROM public.buyer_visibility_grants g
      JOIN public.buyer_auth_user_mappings m ON m.buyer_id=g.buyer_id
      JOIN public.users u ON u.id=m.user_id AND u.is_active IS TRUE AND u.neon_auth_user_id IS NOT NULL
      WHERE m.user_id=public.pke_current_user_id() AND m.mapping_status='active'
        AND g.project_id=shipment_events.project_id
        AND (g.shipment_id IS NULL OR g.shipment_id=shipment_events.shipment_id)
        AND g.status='active' AND (g.expires_at IS NULL OR g.expires_at>now())
        AND g.scope='milestones'
    )
  );

-- Existing Buyer grants remain untouched; all existing/legacy rows stay subject to explicit mapping.
COMMENT ON TABLE public.buyer_auth_user_mappings IS
'P17-F: explicit, independently reviewed mapping from app user with verified Neon Auth UUID to canonical Buyer; never inferred by email.';
COMMENT ON TABLE public.buyer_visibility_grant_events IS
'P17-F: append-only audit history for Buyer shipment visibility grant/revoke/expiry decisions.';

COMMIT;
