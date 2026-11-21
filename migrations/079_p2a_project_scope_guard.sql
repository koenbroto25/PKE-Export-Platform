-- Migration 079: enforce Project relationship on P15 canonical master-data requests.
-- Target: existing Neon UAT branch only. No Production apply is authorized by this migration.
BEGIN;
CREATE OR REPLACE FUNCTION public.pke_enforce_p2a_change_request_project_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_facility_id uuid; v_linked boolean := false;
BEGIN
  IF public.pke_is_platform_admin() THEN RETURN NEW; END IF;
  IF NEW.entity_type='organization' AND NEW.operation='update' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.project_supplier_participation psp
      JOIN public.vendors v ON v.id=psp.vendor_id
      WHERE psp.project_id=NEW.project_id AND psp.is_active=true AND v.is_active=true AND v.organization_id=NEW.target_id
      UNION ALL
      SELECT 1 FROM public.project_pks_site_participation pp
      JOIN public.vendors v ON v.id=pp.vendor_id
      WHERE pp.project_id=NEW.project_id AND pp.status<>'closed' AND v.is_active=true AND v.organization_id=NEW.target_id
      UNION ALL
      SELECT 1 FROM public.buyers b
      JOIN public.contract_programs cp ON cp.buyer_id=b.id
      WHERE cp.project_id=NEW.project_id AND cp.is_active=true AND b.is_active=true AND b.organization_id=NEW.target_id
      UNION ALL
      SELECT 1 FROM public.pks_sites s
      JOIN public.project_operating_profiles op ON op.primary_pks_site_id=s.id
      WHERE op.project_id=NEW.project_id AND s.organization_id=NEW.target_id
    ) INTO v_linked;
    IF NOT v_linked THEN
      RAISE EXCEPTION 'Organization is not linked to the selected Project; cross-Project master-data changes are denied' USING ERRCODE='42501';
    END IF;
  ELSIF NEW.entity_type='facility' AND NEW.operation='update' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.project_pks_site_participation pp
      WHERE pp.project_id=NEW.project_id AND pp.pks_site_id=NEW.target_id AND pp.status<>'closed'
    ) INTO v_linked;
    IF NOT v_linked THEN
      RAISE EXCEPTION 'Facility is not participating in the selected Project; cross-Project master-data changes are denied' USING ERRCODE='42501';
    END IF;
  ELSIF NEW.entity_type IN ('facility_product','capacity_record','certification') THEN
    BEGIN
      v_facility_id := NULLIF(NEW.proposed_data->>'facility_id','')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'A valid Project-linked facility_id is required for facility evidence requests' USING ERRCODE='23514';
    END;
    IF v_facility_id IS NULL THEN
      RAISE EXCEPTION 'A Project-linked facility_id is required for facility evidence requests' USING ERRCODE='23514';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.project_pks_site_participation pp
      WHERE pp.project_id=NEW.project_id AND pp.pks_site_id=v_facility_id AND pp.status<>'closed'
    ) INTO v_linked;
    IF NOT v_linked THEN
      RAISE EXCEPTION 'Facility evidence must belong to a facility participating in the selected Project' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_enforce_p2a_change_request_project_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_enforce_p2a_change_request_project_scope() TO app_runtime_secure;
DROP TRIGGER IF EXISTS p2a_master_change_project_scope ON public.p2a_master_data_change_requests;
CREATE TRIGGER p2a_master_change_project_scope
BEFORE INSERT OR UPDATE ON public.p2a_master_data_change_requests
FOR EACH ROW EXECUTE FUNCTION public.pke_enforce_p2a_change_request_project_scope();
COMMIT;
