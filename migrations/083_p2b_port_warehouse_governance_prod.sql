-- Migration 083: P16 port, depth/tide, route and warehouse governance.
-- Neon UAT only. Platform Admin controls global master records; Project evidence submissions are scoped.
CREATE SCHEMA IF NOT EXISTS p2b_backup_082_20261121;
DO $backup$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['ports','port_terminals','port_berths','port_channels','port_anchorages','port_depth_observations','port_tide_observations','port_loading_services','port_equipment','port_operating_limits','pks_port_routes','warehouses','warehouse_zones','warehouse_bins','warehouse_equipment'] LOOP
  EXECUTE format('CREATE TABLE p2b_backup_082_20261121.%I AS TABLE public.%I',t||'_pre_083',t);
 END LOOP;
 CREATE TABLE p2b_backup_082_20261121.policies_pre_083 AS SELECT * FROM pg_policies WHERE schemaname='public' AND (tablename LIKE 'port_%' OR tablename LIKE 'warehouse%' OR tablename IN ('ports','pks_port_routes','vessel_port_assessments'));
 CREATE TABLE p2b_backup_082_20261121.role_permissions_pre_083 AS SELECT prp.* FROM public.project_role_permissions prp JOIN public.project_roles pr ON pr.id=prp.project_role_id JOIN public.permissions p ON p.id=prp.permission_id WHERE p.code LIKE 'port.%' OR p.code LIKE 'warehouse.%' OR p.code LIKE 'route.%' OR p.code LIKE 'vessel.port.%';
END
$backup$;

ALTER TABLE public.ports ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS verified_by uuid, ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.port_terminals ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS verified_by uuid, ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.port_berths ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS verified_by uuid, ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.port_channels ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS verified_by uuid, ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.port_anchorages ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS verified_by uuid, ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.port_loading_services ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS verified_by uuid, ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.port_equipment ADD COLUMN IF NOT EXISTS verified_at timestamptz, ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS verified_by uuid, ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.port_operating_limits ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.port_depth_observations ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.port_tide_observations ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS evidence_object_key text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS reviewed_by uuid, ADD COLUMN IF NOT EXISTS reviewed_at timestamptz, ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS source_reference text, ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS verified_by uuid, ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.warehouse_zones ADD COLUMN IF NOT EXISTS source_reference text, ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS verified_by uuid, ADD COLUMN IF NOT EXISTS verified_at timestamptz, ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.warehouse_bins ADD COLUMN IF NOT EXISTS source_reference text, ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS verified_by uuid, ADD COLUMN IF NOT EXISTS verified_at timestamptz, ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.warehouse_equipment ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS verified_by uuid, ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.pks_port_routes ADD COLUMN IF NOT EXISTS evidence_sha256 text, ADD COLUMN IF NOT EXISTS submitted_by uuid, ADD COLUMN IF NOT EXISTS verified_by uuid, ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified', ADD COLUMN IF NOT EXISTS review_note text;

ALTER TABLE public.port_tide_observations DROP CONSTRAINT IF EXISTS port_tide_observations_quality_status_check;
ALTER TABLE public.port_tide_observations ADD CONSTRAINT port_tide_observations_quality_status_check CHECK (quality_status IN ('unverified','submitted','verified','stale','provider_unavailable','rejected'));
ALTER TABLE public.warehouses DROP CONSTRAINT IF EXISTS warehouses_verification_status_check;
ALTER TABLE public.warehouses ADD CONSTRAINT warehouses_verification_status_check CHECK (verification_status IN ('unverified','submitted','under_review','verified','rejected','suspended','expired'));
ALTER TABLE public.warehouse_zones ADD CONSTRAINT warehouse_zones_verification_status_check CHECK (verification_status IN ('unverified','submitted','verified','rejected','expired'));
ALTER TABLE public.warehouse_bins ADD CONSTRAINT warehouse_bins_verification_status_check CHECK (verification_status IN ('unverified','submitted','verified','rejected','expired'));
ALTER TABLE public.warehouse_equipment ADD CONSTRAINT warehouse_equipment_verification_status_check CHECK (verification_status IN ('unverified','submitted','verified','rejected','expired'));
ALTER TABLE public.pks_port_routes ADD CONSTRAINT pks_port_routes_verification_status_check CHECK (verification_status IN ('unverified','submitted','verified','rejected','expired'));
ALTER TABLE public.port_operating_limits ADD CONSTRAINT port_operating_limits_verification_status_check CHECK (verification_status IN ('unverified','submitted','verified','rejected','expired'));

INSERT INTO public.permissions(name,code,description,is_active) VALUES
('Submit Port Depth/Tide Evidence','port.depth.submit','Submit dated, datum-qualified port depth/tide evidence for a linked Project port.',true),
('Estimate Project Port Routes','route.estimate','Read verified route references and advisory route comparisons for the selected Project.',true),
('Assess Vessel-Port Compatibility','vessel.port.assess','Create advisory vessel-port compatibility assessments from verified evidence.',true)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_active=true;

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code) VALUES
('pm','port.view'),('pm','port.depth.view'),('pm','route.estimate'),('pm','vessel.port.assess'),
('terminal_representative','port.depth.view'),('terminal_representative','port.depth.submit')
ON CONFLICT(role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,p.id FROM public.project_roles pr JOIN public.permissions p ON
 (pr.role_code='pm' AND p.code IN ('port.view','port.depth.view','route.estimate','vessel.port.assess'))
 OR (pr.role_code='terminal_representative' AND p.code IN ('port.depth.view','port.depth.submit'))
WHERE pr.is_active=true ON CONFLICT(project_role_id,permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pke_p16_project_port_permission(p_project_id uuid,p_port_id uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
 SELECT p_project_id IS NOT NULL AND p_port_id IS NOT NULL
 AND NULLIF(current_setting('app.current_project_id',true),'')::uuid=p_project_id
 AND public.pke_has_project_permission(p_project_id,p_permission)
 AND (EXISTS(SELECT 1 FROM public.project_operating_profiles op WHERE op.project_id=p_project_id AND op.primary_port_id=p_port_id)
 OR EXISTS(SELECT 1 FROM public.project_pks_site_participation part JOIN public.pks_port_routes r ON r.pks_site_id=part.pks_site_id WHERE part.project_id=p_project_id AND part.status='active' AND r.port_id=p_port_id AND r.is_active)
 OR EXISTS(SELECT 1 FROM public.shipments s WHERE s.project_id=p_project_id AND s.destination_port_id=p_port_id)
 OR EXISTS(SELECT 1 FROM public.voyages v WHERE v.project_id=p_project_id AND v.port_id=p_port_id))
$function$;
REVOKE ALL ON FUNCTION public.pke_p16_project_port_permission(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_p16_project_port_permission(uuid,uuid,text) TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.pke_p16_admin_master_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_actor uuid:=public.pke_current_user_id(); v_before jsonb; v_after jsonb; v_changed boolean:=false;
BEGIN
 IF NOT public.pke_is_platform_admin() OR v_actor IS NULL THEN RAISE EXCEPTION 'Platform Admin required for P16 global master data.' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN
  INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,action,target_type,target_id,before_snapshot,outcome)
  VALUES(v_actor,'admin','admin','p16.master.deleted',TG_TABLE_NAME,OLD.id,to_jsonb(OLD),'success'); RETURN OLD;
 ELSIF TG_OP='INSERT' THEN
  NEW.submitted_by:=v_actor; NEW.verification_status:='submitted'; NEW.verified_by:=NULL; NEW.verified_at:=NULL;
  INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,action,target_type,target_id,after_snapshot,outcome)
  VALUES(v_actor,'admin','admin','p16.master.submitted',TG_TABLE_NAME,NEW.id,to_jsonb(NEW),'success'); RETURN NEW;
 END IF;
 v_before:=to_jsonb(OLD); v_after:=to_jsonb(NEW);
 v_changed:=(v_before-ARRAY['verification_status','verified_by','verified_at','review_note','submitted_by']::text[]) IS DISTINCT FROM (v_after-ARRAY['verification_status','verified_by','verified_at','review_note','submitted_by']::text[]);
 IF v_changed THEN NEW.submitted_by:=v_actor; NEW.verification_status:='submitted'; NEW.verified_by:=NULL; NEW.verified_at:=NULL;
 ELSIF NEW.verification_status='verified' AND OLD.verification_status IS DISTINCT FROM 'verified' THEN
  IF NULLIF(btrim(COALESCE(NEW.source_reference,'')),'') IS NULL OR COALESCE(NEW.evidence_sha256,'') !~ '^[0-9a-f]{64}$' OR OLD.submitted_by IS NULL OR OLD.submitted_by=v_actor OR length(btrim(COALESCE(NEW.review_note,'')))<5 THEN
   RAISE EXCEPTION 'Independent verification requires source, SHA-256 evidence, a different reviewer and review note.' USING ERRCODE='23514'; END IF;
  NEW.verified_by:=v_actor; NEW.verified_at:=now();
 ELSIF NEW.verification_status='rejected' AND OLD.verification_status IS DISTINCT FROM 'rejected' THEN
  IF OLD.submitted_by=v_actor OR length(btrim(COALESCE(NEW.review_note,'')))<5 THEN RAISE EXCEPTION 'Independent rejection requires reviewer note.' USING ERRCODE='23514'; END IF;
  NEW.verified_by:=v_actor; NEW.verified_at:=now();
 END IF;
 INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,action,target_type,target_id,before_snapshot,after_snapshot,reason,outcome)
 VALUES(v_actor,'admin','admin',CASE WHEN NEW.verification_status IN ('verified','rejected') AND OLD.verification_status IS DISTINCT FROM NEW.verification_status THEN 'p16.master.reviewed' ELSE 'p16.master.updated' END,TG_TABLE_NAME,NEW.id,v_before,to_jsonb(NEW),NULLIF(btrim(COALESCE(NEW.review_note,'')),''),'success');
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_p16_admin_master_guard() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.pke_p16_depth_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_actor uuid:=public.pke_current_user_id();
BEGIN
 IF TG_OP='INSERT' THEN
  IF v_actor IS NULL OR NOT public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,NEW.port_id,'port.depth.submit') THEN RAISE EXCEPTION 'Project-linked port.depth.submit permission required.' USING ERRCODE='42501'; END IF;
  IF NEW.depth_unit<>'m' OR NULLIF(btrim(NEW.depth_datum),'') IS NULL OR NULLIF(btrim(NEW.source_authority),'') IS NULL OR NEW.survey_date IS NULL OR NEW.observed_at IS NULL OR NULLIF(btrim(COALESCE(NEW.evidence_object_key,'')),'') IS NULL OR COALESCE(NEW.evidence_sha256,'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Depth submission requires metres, datum, survey date, authority, evidence object and SHA-256.' USING ERRCODE='23514'; END IF;
  NEW.submitted_by:=v_actor; NEW.quality_status:='submitted'; NEW.reviewer_id:=NULL; NEW.reviewed_at:=NULL; RETURN NEW;
 END IF;
 IF NOT public.pke_is_platform_admin() OR v_actor IS NULL THEN RAISE EXCEPTION 'Only Platform Admin may review depth observations.' USING ERRCODE='42501'; END IF;
 IF NEW.quality_status IN ('verified','rejected') AND OLD.quality_status IS DISTINCT FROM NEW.quality_status THEN
  IF OLD.submitted_by IS NULL OR OLD.submitted_by=v_actor OR length(btrim(COALESCE(NEW.review_note,'')))<5 THEN RAISE EXCEPTION 'Independent depth review requires a different reviewer and review note.' USING ERRCODE='23514'; END IF;
  NEW.reviewer_id:=v_actor; NEW.reviewed_at:=now();
 END IF; RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_p16_depth_guard() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.pke_p16_tide_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_actor uuid:=public.pke_current_user_id();
BEGIN
 IF TG_OP='INSERT' THEN
  IF v_actor IS NULL OR NOT public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,NEW.port_id,'port.depth.submit') THEN RAISE EXCEPTION 'Project-linked port.depth.submit permission required.' USING ERRCODE='42501'; END IF;
  IF NULLIF(btrim(NEW.vertical_datum),'') IS NULL OR NULLIF(btrim(COALESCE(NEW.source_reference,'')),'') IS NULL OR NULLIF(btrim(COALESCE(NEW.evidence_object_key,'')),'') IS NULL OR COALESCE(NEW.evidence_sha256,'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Tide submission requires datum, source reference, evidence object and SHA-256.' USING ERRCODE='23514'; END IF;
  NEW.submitted_by:=v_actor; NEW.quality_status:='submitted'; NEW.reviewed_by:=NULL; NEW.reviewed_at:=NULL; RETURN NEW;
 END IF;
 IF NOT public.pke_is_platform_admin() OR v_actor IS NULL THEN RAISE EXCEPTION 'Only Platform Admin may review tide observations.' USING ERRCODE='42501'; END IF;
 IF NEW.quality_status IN ('verified','rejected') AND OLD.quality_status IS DISTINCT FROM NEW.quality_status THEN
  IF OLD.submitted_by IS NULL OR OLD.submitted_by=v_actor OR length(btrim(COALESCE(NEW.review_note,'')))<5 THEN RAISE EXCEPTION 'Independent tide review requires a different reviewer and review note.' USING ERRCODE='23514'; END IF;
  NEW.reviewed_by:=v_actor; NEW.reviewed_at:=now();
 END IF; RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_p16_tide_guard() FROM PUBLIC;

DO $triggers$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['ports','port_terminals','port_berths','port_channels','port_anchorages','port_loading_services','port_equipment','port_operating_limits','warehouses','warehouse_zones','warehouse_bins','warehouse_equipment','pks_port_routes'] LOOP
  EXECUTE format('CREATE TRIGGER p16_admin_master_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.pke_p16_admin_master_guard()',t);
 END LOOP;
END
$triggers$;
CREATE TRIGGER p16_depth_guard BEFORE INSERT OR UPDATE ON public.port_depth_observations FOR EACH ROW EXECUTE FUNCTION public.pke_p16_depth_guard();
CREATE TRIGGER p16_tide_guard BEFORE INSERT OR UPDATE ON public.port_tide_observations FOR EACH ROW EXECUTE FUNCTION public.pke_p16_tide_guard();

DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['ports','port_terminals','port_berths','port_channels','port_anchorages','port_loading_services','port_equipment','port_operating_limits','warehouses','warehouse_zones','warehouse_bins','warehouse_equipment','pks_port_routes'] LOOP
  EXECUTE format('CREATE POLICY p16_admin_insert ON public.%I FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_is_platform_admin())',t);
  EXECUTE format('CREATE POLICY p16_admin_update ON public.%I FOR UPDATE TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin())',t);
  EXECUTE format('CREATE POLICY p16_admin_delete ON public.%I FOR DELETE TO app_runtime_secure USING (public.pke_is_platform_admin())',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO app_runtime_secure',t);
 END LOOP;
END
$policies$;
CREATE POLICY p16_depth_submit ON public.port_depth_observations FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,port_id,'port.depth.submit'));
CREATE POLICY p16_depth_review ON public.port_depth_observations FOR UPDATE TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY p16_tide_submit ON public.port_tide_observations FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,port_id,'port.depth.submit'));
CREATE POLICY p16_tide_review ON public.port_tide_observations FOR UPDATE TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
GRANT INSERT,UPDATE ON public.port_depth_observations,public.port_tide_observations TO app_runtime_secure;

DROP POLICY pke_pks_port_routes_member_read ON public.pks_port_routes;
CREATE POLICY p16_route_project_read ON public.pks_port_routes FOR SELECT TO app_runtime_secure USING (
 EXISTS(SELECT 1 FROM public.project_operating_profiles op WHERE op.primary_pks_site_id=pks_port_routes.pks_site_id AND public.pke_has_project_permission(op.project_id,'route.estimate'))
 OR EXISTS(SELECT 1 FROM public.project_pks_site_participation part WHERE part.pks_site_id=pks_port_routes.pks_site_id AND part.status='active' AND public.pke_has_project_permission(part.project_id,'route.estimate')));
DROP POLICY pke_scope_update ON public.vessel_port_assessments;
CREATE POLICY p16_assessment_admin_review ON public.vessel_port_assessments FOR UPDATE TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
DROP POLICY pke_scope_select ON public.vessel_port_assessments;
CREATE POLICY p16_assessment_project_read ON public.vessel_port_assessments FOR SELECT TO app_runtime_secure USING (public.pke_has_project_permission(project_id,'vessel.port.assess') OR public.pke_has_project_permission(project_id,'vessel.view'));
GRANT SELECT,INSERT,UPDATE ON public.vessel_port_assessments TO app_runtime_secure;
