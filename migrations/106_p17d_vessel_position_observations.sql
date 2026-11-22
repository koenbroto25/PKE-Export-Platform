-- Migration 106: extend the existing vessel tracking master with licensed AIS evidence controls.
BEGIN;

-- Reuse the canonical PKE vessel_tracking_positions table; do not create a parallel position master.
ALTER TABLE public.vessel_tracking_positions
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.maritime_data_sources(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS mmsi text,
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS attribution_text text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

ALTER TABLE public.vessel_tracking_positions
  ADD CONSTRAINT vessel_tracking_source_review_status_ck
    CHECK(review_status IN ('pending','accepted','rejected','superseded')),
  ADD CONSTRAINT vessel_tracking_source_review_stamp_ck
    CHECK (
      (review_status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
      OR
      (review_status IN ('accepted','rejected','superseded') AND source_id IS NOT NULL
        AND created_by IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
        AND reviewed_by<>created_by AND length(btrim(COALESCE(review_note,'')))>=5)
    ),
  ADD CONSTRAINT vessel_tracking_source_evidence_ck
    CHECK(source_id IS NULL OR (mmsi ~ '^[0-9]{9}
      AND NULLIF(btrim(COALESCE(attribution_text,'')),'') IS NOT NULL
      AND raw_payload_hash ~ '^[0-9a-f]{64}$'));

CREATE UNIQUE INDEX vessel_tracking_source_observation_uq
  ON public.vessel_tracking_positions(source_id,provider_reference,position_timestamp,raw_payload_hash)
  WHERE source_id IS NOT NULL AND provider_reference IS NOT NULL AND raw_payload_hash IS NOT NULL;
CREATE INDEX vessel_tracking_review_latest_idx
  ON public.vessel_tracking_positions(vessel_id,review_status,position_timestamp DESC);

CREATE POLICY vessel_tracking_accepted_project_read
  ON public.vessel_tracking_positions FOR SELECT TO app_runtime_secure
  USING (
    review_status='accepted' AND source_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.voyages v
      JOIN public.maritime_data_sources s ON s.id=vessel_tracking_positions.source_id
      WHERE v.vessel_id=vessel_tracking_positions.vessel_id
        AND v.project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
        AND s.enabled IS TRUE AND s.rights_status='approved'
        AND s.internal_processing_allowed IS TRUE AND s.rights_expires_at>now()
        AND (public.pke_has_project_permission(v.project_id,'vessel.view')
          OR public.pke_has_project_permission(v.project_id,'shipping.view')
          OR public.pke_has_project_permission(v.project_id,'vessel.position.view'))
    )
  );

CREATE OR REPLACE FUNCTION public.pke_guard_vessel_tracking_source_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.source_id IS DISTINCT FROM OLD.source_id
    OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id
    OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
    OR NEW.latitude IS DISTINCT FROM OLD.latitude
    OR NEW.longitude IS DISTINCT FROM OLD.longitude
    OR NEW.position_timestamp IS DISTINCT FROM OLD.position_timestamp
    OR NEW.sog_knots IS DISTINCT FROM OLD.sog_knots
    OR NEW.cog_degrees IS DISTINCT FROM OLD.cog_degrees
    OR NEW.raw_payload_hash IS DISTINCT FROM OLD.raw_payload_hash
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  ) THEN
    RAISE EXCEPTION 'Provider position identity and payload are immutable'
      USING ERRCODE='23514';
  END IF;
  IF NEW.review_status='accepted' AND (
    NEW.source_id IS NULL OR NEW.created_by IS NULL
    OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL
    OR NEW.reviewed_by=NEW.created_by
    OR length(btrim(COALESCE(NEW.review_note,'')))<5
    OR NOT EXISTS (
      SELECT 1 FROM public.maritime_data_sources s
      WHERE s.id=NEW.source_id AND s.enabled IS TRUE AND s.rights_status='approved'
        AND s.internal_processing_allowed IS TRUE AND s.rights_expires_at>now()
        AND s.rights_reviewed_by IS NOT NULL AND s.rights_reviewed_at IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'Accepted position requires current provider rights and independent review'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_vessel_tracking_source_evidence() FROM PUBLIC;
CREATE TRIGGER vessel_tracking_source_evidence_guard
BEFORE INSERT OR UPDATE ON public.vessel_tracking_positions
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_vessel_tracking_source_evidence();

COMMENT ON TABLE public.vessel_tracking_positions IS
'Canonical vessel tracking position master. P17-D extends it with source rights, payload evidence and independent acceptance; legacy rows remain unaccepted and are not represented as live AIS.';

COMMIT;
 AND NULLIF(btrim(COALESCE(source_reference,'')),'') IS NOT NULL
      AND NULLIF(btrim(COALESCE(attribution_text,'')),'') IS NOT NULL
      AND raw_payload_hash ~ '^[0-9a-f]{64}$'));

CREATE UNIQUE INDEX vessel_tracking_source_observation_uq
  ON public.vessel_tracking_positions(source_id,provider_reference,position_timestamp,raw_payload_hash)
  WHERE source_id IS NOT NULL AND provider_reference IS NOT NULL AND raw_payload_hash IS NOT NULL;
CREATE INDEX vessel_tracking_review_latest_idx
  ON public.vessel_tracking_positions(vessel_id,review_status,position_timestamp DESC);

CREATE POLICY vessel_tracking_accepted_project_read
  ON public.vessel_tracking_positions FOR SELECT TO app_runtime_secure
  USING (
    review_status='accepted' AND source_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.voyages v
      JOIN public.maritime_data_sources s ON s.id=vessel_tracking_positions.source_id
      WHERE v.vessel_id=vessel_tracking_positions.vessel_id
        AND v.project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
        AND s.enabled IS TRUE AND s.rights_status='approved'
        AND s.internal_processing_allowed IS TRUE AND s.rights_expires_at>now()
        AND (public.pke_has_project_permission(v.project_id,'vessel.view')
          OR public.pke_has_project_permission(v.project_id,'shipping.view')
          OR public.pke_has_project_permission(v.project_id,'vessel.position.view'))
    )
  );

CREATE OR REPLACE FUNCTION public.pke_guard_vessel_tracking_source_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.source_id IS DISTINCT FROM OLD.source_id
    OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id
    OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
    OR NEW.latitude IS DISTINCT FROM OLD.latitude
    OR NEW.longitude IS DISTINCT FROM OLD.longitude
    OR NEW.position_timestamp IS DISTINCT FROM OLD.position_timestamp
    OR NEW.sog_knots IS DISTINCT FROM OLD.sog_knots
    OR NEW.cog_degrees IS DISTINCT FROM OLD.cog_degrees
    OR NEW.raw_payload_hash IS DISTINCT FROM OLD.raw_payload_hash
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  ) THEN
    RAISE EXCEPTION 'Provider position identity and payload are immutable'
      USING ERRCODE='23514';
  END IF;
  IF NEW.review_status='accepted' AND (
    NEW.source_id IS NULL OR NEW.created_by IS NULL
    OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL
    OR NEW.reviewed_by=NEW.created_by
    OR length(btrim(COALESCE(NEW.review_note,'')))<5
    OR NOT EXISTS (
      SELECT 1 FROM public.maritime_data_sources s
      WHERE s.id=NEW.source_id AND s.enabled IS TRUE AND s.rights_status='approved'
        AND s.internal_processing_allowed IS TRUE AND s.rights_expires_at>now()
        AND s.rights_reviewed_by IS NOT NULL AND s.rights_reviewed_at IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'Accepted position requires current provider rights and independent review'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_vessel_tracking_source_evidence() FROM PUBLIC;
CREATE TRIGGER vessel_tracking_source_evidence_guard
BEFORE INSERT OR UPDATE ON public.vessel_tracking_positions
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_vessel_tracking_source_evidence();

COMMENT ON TABLE public.vessel_tracking_positions IS
'Canonical vessel tracking position master. P17-D extends it with source rights, payload evidence and independent acceptance; legacy rows remain unaccepted and are not represented as live AIS.';

COMMIT;
