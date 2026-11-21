-- Migration 085: require approved, uploaded Project document evidence for port depth/tide.
CREATE SCHEMA IF NOT EXISTS p2b_backup_084_20261121;
CREATE TABLE p2b_backup_084_20261121.p16_evidence_functions_pre_085 AS
 SELECT p.proname,pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('pke_p16_depth_guard','pke_p16_tide_guard');
CREATE OR REPLACE FUNCTION public.pke_p16_depth_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_actor uuid:=public.pke_current_user_id(); v_project uuid:=NULLIF(current_setting('app.current_project_id',true),'')::uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  IF v_actor IS NULL OR v_project IS NULL OR NOT public.pke_p16_project_port_permission(v_project,NEW.port_id,'port.depth.submit') THEN RAISE EXCEPTION 'Project-linked port.depth.submit permission required.' USING ERRCODE='42501'; END IF;
  IF NEW.depth_unit<>'m' OR NULLIF(btrim(NEW.depth_datum),'') IS NULL OR NULLIF(btrim(NEW.source_authority),'') IS NULL OR NEW.survey_date IS NULL OR NEW.observed_at IS NULL OR NULLIF(btrim(COALESCE(NEW.evidence_object_key,'')),'') IS NULL OR COALESCE(NEW.evidence_sha256,'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Depth requires metres, datum, survey date, authority, evidence object and SHA-256.' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_export_documents d WHERE d.project_id=v_project AND d.object_key=NEW.evidence_object_key AND d.sha256_checksum=NEW.evidence_sha256 AND d.status='approved' AND d.upload_verified_at IS NOT NULL AND d.storage_bucket='pke-private-documents' AND d.legal_hold=false AND (d.expiry_date IS NULL OR d.expiry_date>=CURRENT_DATE)) THEN RAISE EXCEPTION 'Depth evidence must match an approved, upload-verified Project document.' USING ERRCODE='23514'; END IF;
  NEW.submitted_by:=v_actor; NEW.quality_status:='submitted'; NEW.reviewer_id:=NULL; NEW.reviewed_at:=NULL; RETURN NEW;
 END IF;
 IF NOT public.pke_is_platform_admin() OR v_actor IS NULL THEN RAISE EXCEPTION 'Only Platform Admin may review depth observations.' USING ERRCODE='42501'; END IF;
 IF NEW.quality_status IN ('verified','rejected') AND OLD.quality_status IS DISTINCT FROM NEW.quality_status THEN
  IF OLD.submitted_by IS NULL OR OLD.submitted_by=v_actor OR length(btrim(COALESCE(NEW.review_note,'')))<5 THEN RAISE EXCEPTION 'Independent depth review requires a different reviewer and review note.' USING ERRCODE='23514'; END IF;
  NEW.reviewer_id:=v_actor; NEW.reviewed_at:=now();
 END IF; RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.pke_p16_tide_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_actor uuid:=public.pke_current_user_id(); v_project uuid:=NULLIF(current_setting('app.current_project_id',true),'')::uuid;
BEGIN
 IF TG_OP='INSERT' THEN
  IF v_actor IS NULL OR v_project IS NULL OR NOT public.pke_p16_project_port_permission(v_project,NEW.port_id,'port.depth.submit') THEN RAISE EXCEPTION 'Project-linked port.depth.submit permission required.' USING ERRCODE='42501'; END IF;
  IF NULLIF(btrim(NEW.vertical_datum),'') IS NULL OR NULLIF(btrim(COALESCE(NEW.source_reference,'')),'') IS NULL OR NULLIF(btrim(COALESCE(NEW.evidence_object_key,'')),'') IS NULL OR COALESCE(NEW.evidence_sha256,'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Tide requires datum, source, evidence object and SHA-256.' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.project_export_documents d WHERE d.project_id=v_project AND d.object_key=NEW.evidence_object_key AND d.sha256_checksum=NEW.evidence_sha256 AND d.status='approved' AND d.upload_verified_at IS NOT NULL AND d.storage_bucket='pke-private-documents' AND d.legal_hold=false AND (d.expiry_date IS NULL OR d.expiry_date>=CURRENT_DATE)) THEN RAISE EXCEPTION 'Tide evidence must match an approved, upload-verified Project document.' USING ERRCODE='23514'; END IF;
  NEW.submitted_by:=v_actor; NEW.quality_status:='submitted'; NEW.reviewed_by:=NULL; NEW.reviewed_at:=NULL; RETURN NEW;
 END IF;
 IF NOT public.pke_is_platform_admin() OR v_actor IS NULL THEN RAISE EXCEPTION 'Only Platform Admin may review tide observations.' USING ERRCODE='42501'; END IF;
 IF NEW.quality_status IN ('verified','rejected') AND OLD.quality_status IS DISTINCT FROM NEW.quality_status THEN
  IF OLD.submitted_by IS NULL OR OLD.submitted_by=v_actor OR length(btrim(COALESCE(NEW.review_note,'')))<5 THEN RAISE EXCEPTION 'Independent tide review requires a different reviewer and review note.' USING ERRCODE='23514'; END IF;
  NEW.reviewed_by:=v_actor; NEW.reviewed_at:=now();
 END IF; RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_p16_depth_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pke_p16_tide_guard() FROM PUBLIC;
