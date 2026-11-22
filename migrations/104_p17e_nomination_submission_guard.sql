-- Migration 104: complete P17-E nomination submission and lifecycle guard.
BEGIN;

CREATE OR REPLACE FUNCTION public.pke_guard_vessel_nomination_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.shipment_id IS DISTINCT FROM OLD.shipment_id
     OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id
     OR NEW.voyage_id IS DISTINCT FROM OLD.voyage_id
     OR NEW.nominated_by IS DISTINCT FROM OLD.nominated_by THEN
    RAISE EXCEPTION 'Nomination identity and Project scope are immutable' USING ERRCODE='23514';
  END IF;

  IF NEW.nomination_status IS DISTINCT FROM OLD.nomination_status THEN
    IF OLD.nomination_status='draft' AND NEW.nomination_status='submitted' THEN
      IF NOT public.pke_has_project_permission(NEW.project_id,'vessel.nominate')
         OR NEW.nominated_by IS DISTINCT FROM public.pke_current_user_id()
         OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL
         OR NEW.submitted_at IS NULL THEN
        RAISE EXCEPTION 'Only the nominator may submit a draft nomination' USING ERRCODE='42501';
      END IF;
    ELSIF NEW.nomination_status IN ('identity_verified','port_screened','documents_checked','approved_for_internal_planning','rejected') THEN
      IF NOT public.pke_has_project_permission(NEW.project_id,'vessel.nomination.review')
         OR NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()
         OR NEW.reviewed_by=NEW.nominated_by
         OR NEW.reviewed_at IS NULL OR length(btrim(COALESCE(NEW.decision_note,'')))<5 THEN
        RAISE EXCEPTION 'Independent nomination reviewer and decision note required' USING ERRCODE='42501';
      END IF;
      IF NOT (
        (OLD.nomination_status='submitted' AND NEW.nomination_status IN ('identity_verified','rejected'))
        OR (OLD.nomination_status='identity_verified' AND NEW.nomination_status IN ('port_screened','rejected'))
        OR (OLD.nomination_status='port_screened' AND NEW.nomination_status IN ('documents_checked','rejected'))
        OR (OLD.nomination_status='documents_checked' AND NEW.nomination_status IN ('approved_for_internal_planning','rejected'))
      ) THEN
        RAISE EXCEPTION 'Invalid vessel nomination transition' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.nomination_status IN ('changed','withdrawn') THEN
      IF NOT public.pke_has_project_permission(NEW.project_id,'vessel.nominate')
         OR NEW.nominated_by IS DISTINCT FROM public.pke_current_user_id()
         OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Only the nominator may change or withdraw a nomination' USING ERRCODE='42501';
      END IF;
      IF OLD.nomination_status NOT IN ('draft','submitted','identity_verified','port_screened','documents_checked','approved_for_internal_planning') THEN
        RAISE EXCEPTION 'Nomination cannot be changed or withdrawn from its current state' USING ERRCODE='23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported vessel nomination transition' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.version<>OLD.version+1 THEN
    RAISE EXCEPTION 'Nomination version must increment exactly once' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.pke_guard_vessel_nomination_transition() IS
'P17-E: immutable Project identity, nominator-only draft submission/withdrawal, independent reviewer decisions, mandatory version increment and decision evidence.';

COMMIT;
