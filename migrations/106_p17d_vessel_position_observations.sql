-- Migration 106: extend the canonical vessel tracking master with licensed AIS evidence controls.
BEGIN;

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
      (review_status IN ('accepted','rejected','superseded')
        AND source_id IS NOT NULL AND created_by IS NOT NULL
        AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
        AND reviewed_by<>created_by AND length(btrim(COALESCE(review_note,'')))>=5)
    ),
  ADD CONSTRAINT vessel_tracking_source_evidence_ck
    CHECK (
      source_id IS NULL OR (
        mmsi ~ '^[0-9]{9}$'
        AND NULLIF(btrim(COALESCE(source_reference,'')),'') IS NOT NULL
        AND NULLIF(btrim(COALESCE(attribution_text,'')),'') IS NOT NULL
        AND raw_payload_hash ~ '^[0-9a-f]{64}$'
      )
    );

CREATE UNIQUE INDEX vessel_tracking_source_observation_uq
  ON public.vessel_tracking_positions(source_id,provider_reference,position_timestamp,raw_payload_hash)
  WHERE source_id IS NOT NULL AND provider_reference IS NOT NULL AND raw_payload_hash IS NOT NULL;
CREATE INDEX vessel_tracking_review_latest_idx
  ON public.vessel_tracking_positions(vessel_id,review_status,position_timestamp DESC);

DROP POLICY IF EXISTS vessel_tracking_accepted_project_read ON public.vessel_tracking_positions;
CREATE POLICY vessel_tracking_accepted_project_read
  ON public.vessel_tracking_positions FOR SELECT TO app_runtime_secure
  USING (
    review_status='accepted' AND source_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.voyages v
      JOIN public.maritime_data_sources s ON s.id=vessel_tracking_positions.source_id
      WHERE v.vessel_id=vessel_tracking_positions.vessel_id
        AND v.project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
        AND s.enabled IS TRUE AND s.source_class='ais'
        AND s.rights_status='approved' AND s.internal_processing_allowed IS TRUE
        AND s.rights_expires_at>now()
        AND EXISTS (
          SELECT 1 FROM public.maritime_source_field_permissions f
          WHERE f.source_id=s.id AND f.purpose_code='internal_operations'
            AND f.allowed IS TRUE AND f.field_code IN ('mmsi','latitude','longitude','observed_at')
          GROUP BY f.source_id HAVING COUNT(DISTINCT f.field_code)=4
        )
        AND (public.pke_has_project_permission(v.project_id,'vessel.view')
          OR public.pke_has_project_permission(v.project_id,'shipping.view')
          OR public.pke_has_project_permission(v.project_id,'vessel.position.view'))
    )
  );

CREATE OR REPLACE FUNCTION public.pke_guard_vessel_tracking_source_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
  required_fields text[] := ARRAY['mmsi','latitude','longitude','observed_at'];
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.source_id IS DISTINCT FROM OLD.source_id
    OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id
    OR NEW.mmsi IS DISTINCT FROM OLD.mmsi
    OR NEW.provider_code IS DISTINCT FROM OLD.provider_code
    OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
    OR NEW.latitude IS DISTINCT FROM OLD.latitude
    OR NEW.longitude IS DISTINCT FROM OLD.longitude
    OR NEW.position_timestamp IS DISTINCT FROM OLD.position_timestamp
    OR NEW.sog_knots IS DISTINCT FROM OLD.sog_knots
    OR NEW.cog_degrees IS DISTINCT FROM OLD.cog_degrees
    OR NEW.raw_payload_hash IS DISTINCT FROM OLD.raw_payload_hash
    OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
    OR NEW.attribution_text IS DISTINCT FROM OLD.attribution_text
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  ) THEN
    RAISE EXCEPTION 'Provider position identity and payload are immutable'
      USING ERRCODE='23514';
  END IF;

  IF NEW.source_id IS NOT NULL THEN
    IF NEW.sog_knots IS NOT NULL THEN required_fields:=array_append(required_fields,'sog_knots'); END IF;
    IF NEW.cog_degrees IS NOT NULL THEN required_fields:=array_append(required_fields,'cog_degrees'); END IF;
    IF NEW.provider_reference IS NULL OR NEW.provider_reference='' OR NEW.source_reference IS NULL
       OR NEW.attribution_text IS NULL OR NEW.raw_payload_hash !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'AIS observation provenance and payload evidence are required'
        USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.maritime_data_sources s
      WHERE s.id=NEW.source_id AND s.source_code=NEW.provider_code
        AND s.source_class='ais' AND s.enabled IS TRUE
        AND s.rights_status='approved' AND s.internal_processing_allowed IS TRUE
        AND s.rights_reviewed_by IS NOT NULL AND s.rights_reviewed_at IS NOT NULL
        AND s.rights_expires_at>now()
    ) THEN
      RAISE EXCEPTION 'AIS ingestion requires current approved source rights'
        USING ERRCODE='42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.vessels v
      WHERE v.id=NEW.vessel_id AND v.mmsi=NEW.mmsi AND v.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'AIS MMSI must match the active canonical vessel master'
        USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.maritime_source_field_permissions f
      WHERE f.source_id=NEW.source_id AND f.purpose_code='internal_operations'
        AND f.allowed IS TRUE AND f.field_code=ANY(required_fields)
      GROUP BY f.source_id HAVING COUNT(DISTINCT f.field_code)=cardinality(required_fields)
    ) THEN
      RAISE EXCEPTION 'AIS source field-purpose permissions are incomplete'
        USING ERRCODE='42501';
    END IF;
  END IF;

  IF NEW.review_status<>'pending' THEN
    IF NEW.source_id IS NULL OR NEW.created_by IS NULL
       OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL
       OR NEW.reviewed_by=NEW.created_by
       OR NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()
       OR length(btrim(COALESCE(NEW.review_note,'')))<5 THEN
      RAISE EXCEPTION 'AIS acceptance requires independent authenticated review'
        USING ERRCODE='42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.maritime_data_sources s
      WHERE s.id=NEW.source_id AND s.enabled IS TRUE AND s.source_class='ais'
        AND s.rights_status='approved' AND s.internal_processing_allowed IS TRUE
        AND s.rights_reviewed_by IS NOT NULL AND s.rights_reviewed_at IS NOT NULL
        AND s.rights_expires_at>now()
    ) THEN
      RAISE EXCEPTION 'AIS source rights expired or are not approved'
        USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.pke_guard_vessel_tracking_source_evidence() FROM PUBLIC;
DROP TRIGGER IF EXISTS vessel_tracking_source_evidence_guard ON public.vessel_tracking_positions;
CREATE TRIGGER vessel_tracking_source_evidence_guard
BEFORE INSERT OR UPDATE ON public.vessel_tracking_positions
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_vessel_tracking_source_evidence();

GRANT SELECT,INSERT,UPDATE ON public.vessel_tracking_positions TO app_runtime_secure;

COMMENT ON TABLE public.vessel_tracking_positions IS
'Canonical vessel tracking position master. P17-D adds source rights, payload evidence and independent acceptance; legacy rows remain pending and are not represented as live AIS.';

COMMIT;
