-- Migration 082: controlled Project-scoped transition from pending sample to tested lab-backed sample.
-- Target: existing Neon UAT branch only. No Production apply is authorized by this migration.
BEGIN;
CREATE OR REPLACE FUNCTION public.pke_attach_quality_lab_report(
  p_project_id uuid,
  p_sample_id uuid,
  p_document_id uuid,
  p_laboratory_name text,
  p_accreditation_reference text DEFAULT NULL
)
RETURNS public.product_quality_samples
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
  v_sample public.product_quality_samples;
  v_doc public.project_export_documents;
BEGIN
  IF NOT (public.pke_is_platform_admin() OR public.pke_has_project_permission(p_project_id,'quality.result.create')) THEN
    RAISE EXCEPTION 'Project quality result creation permission required to attach lab evidence' USING ERRCODE='42501';
  END IF;
  IF NULLIF(btrim(COALESCE(p_laboratory_name,'')),'') IS NULL OR length(p_laboratory_name)>240
     OR (p_accreditation_reference IS NOT NULL AND length(p_accreditation_reference)>500) THEN
    RAISE EXCEPTION 'Laboratory identity or accreditation reference is invalid' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_sample
    FROM public.product_quality_samples
   WHERE id=p_sample_id AND project_id=p_project_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quality sample not found in this Project' USING ERRCODE='P0002'; END IF;
  IF v_sample.status NOT IN ('pending','submitted') THEN
    RAISE EXCEPTION 'Only pending or submitted samples may be marked tested' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_doc
    FROM public.project_export_documents
   WHERE id=p_document_id AND project_id=p_project_id
     AND status='approved' AND upload_verified_at IS NOT NULL
     AND object_key IS NOT NULL AND sha256_checksum ~ '^[0-9a-f]{64}$'
     AND storage_bucket='pke-private-documents' AND legal_hold=false
     AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lab report must be approved, checksum-verified and belong to this Project' USING ERRCODE='23514';
  END IF;
  UPDATE public.product_quality_samples
     SET status='tested',lab_report_document_id=p_document_id,
         laboratory_name=btrim(p_laboratory_name),
         laboratory_accreditation_reference=NULLIF(btrim(COALESCE(p_accreditation_reference,'')),''),
         updated_at=now()
   WHERE id=p_sample_id AND project_id=p_project_id
   RETURNING * INTO v_sample;
  RETURN v_sample;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_attach_quality_lab_report(uuid,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_attach_quality_lab_report(uuid,uuid,uuid,text,text) TO app_runtime_secure;
COMMIT;
