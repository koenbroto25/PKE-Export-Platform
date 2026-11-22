-- Migration 106: evidence-backed AIS position observations with source rights and freshness controls.
BEGIN;

CREATE TABLE public.maritime_vessel_position_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.maritime_data_sources(id) ON DELETE RESTRICT,
  vessel_id uuid NOT NULL REFERENCES public.vessels(id) ON DELETE RESTRICT,
  mmsi text NOT NULL,
  latitude numeric(9,6) NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  sog_knots numeric(7,2) CHECK(sog_knots IS NULL OR sog_knots BETWEEN 0 AND 120),
  cog_degrees numeric(6,2) CHECK(cog_degrees IS NULL OR cog_degrees BETWEEN 0 AND 360),
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'),
  source_reference text NOT NULL,
  attribution_text text NOT NULL,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK(review_status IN ('pending','accepted','rejected','superseded')),
  created_by uuid NOT NULL REFERENCES public.users(id),
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  review_note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maritime_position_review_ck CHECK (
    (review_status='accepted' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND reviewed_by<>created_by AND length(btrim(COALESCE(review_note,'')))>=5)
    OR review_status<>'accepted'
  ),
  CONSTRAINT maritime_position_source_observation_uq UNIQUE(source_id,mmsi,observed_at,payload_sha256)
);
CREATE INDEX maritime_position_vessel_observed_idx
  ON public.maritime_vessel_position_observations(vessel_id,observed_at DESC);
CREATE INDEX maritime_position_source_status_idx
  ON public.maritime_vessel_position_observations(source_id,review_status,observed_at DESC);

ALTER TABLE public.maritime_vessel_position_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maritime_vessel_position_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY maritime_position_admin_all
  ON public.maritime_vessel_position_observations FOR ALL TO app_runtime_secure
  USING(public.pke_is_platform_admin()) WITH CHECK(public.pke_is_platform_admin());
CREATE POLICY maritime_position_project_read
  ON public.maritime_vessel_position_observations FOR SELECT TO app_runtime_secure
  USING (
    review_status='accepted'
    AND EXISTS (
      SELECT 1 FROM public.voyages v
      WHERE v.vessel_id=maritime_vessel_position_observations.vessel_id
        AND v.project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
        AND (public.pke_has_project_permission(v.project_id,'vessel.view')
          OR public.pke_has_project_permission(v.project_id,'shipping.view'))
    )
  );
GRANT SELECT,INSERT,UPDATE ON public.maritime_vessel_position_observations TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.pke_guard_maritime_vessel_position()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.source_id IS DISTINCT FROM OLD.source_id OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id
    OR NEW.mmsi IS DISTINCT FROM OLD.mmsi OR NEW.latitude IS DISTINCT FROM OLD.latitude
    OR NEW.longitude IS DISTINCT FROM OLD.longitude OR NEW.sog_knots IS DISTINCT FROM OLD.sog_knots
    OR NEW.cog_degrees IS DISTINCT FROM OLD.cog_degrees OR NEW.observed_at IS DISTINCT FROM OLD.observed_at
    OR NEW.payload_sha256 IS DISTINCT FROM OLD.payload_sha256 OR NEW.created_by IS DISTINCT FROM OLD.created_by
  ) THEN
    RAISE EXCEPTION 'AIS observation identity and source payload are immutable'
      USING ERRCODE='23514';
  END IF;
  IF NEW.review_status='accepted' THEN
    IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL
       OR NEW.reviewed_by=NEW.created_by
       OR length(btrim(COALESCE(NEW.review_note,'')))<5
       OR NOT EXISTS (
         SELECT 1 FROM public.maritime_data_sources s
         WHERE s.id=NEW.source_id AND s.enabled IS TRUE AND s.rights_status='approved'
           AND s.internal_processing_allowed IS TRUE AND s.rights_expires_at>now()
           AND s.rights_reviewed_by IS NOT NULL AND s.rights_reviewed_at IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'Accepted AIS position requires current source rights and independent review'
        USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_maritime_vessel_position() FROM PUBLIC;
CREATE TRIGGER maritime_vessel_position_guard
BEFORE INSERT OR UPDATE ON public.maritime_vessel_position_observations
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_maritime_vessel_position();

COMMENT ON TABLE public.maritime_vessel_position_observations IS
'P17-D: immutable provider-sourced AIS position observations; pending until independent evidence review; never implies navigational clearance.';

COMMIT;
