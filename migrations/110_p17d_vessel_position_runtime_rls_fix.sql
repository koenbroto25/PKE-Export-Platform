-- Migration 110: restore explicit runtime RLS paths for licensed AIS ingestion and independent review.
-- P17-D corrective migration. Source rights and provider credentials remain separately gated.
BEGIN;

INSERT INTO public.permissions(name,code,description,is_active)
VALUES
 ('Review AIS Vessel Positions','vessel.position.review','Independently accept, reject or supersede licensed AIS position observations for a Project vessel.',true)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_active=true;

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
VALUES ('pm','vessel.position.review')
ON CONFLICT(role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id,granted_by)
SELECT pr.project_id,pr.id,perm.id,NULL
FROM public.project_roles pr
JOIN public.permissions perm ON perm.code='vessel.position.review' AND perm.is_active=true
WHERE pr.role_code='pm' AND pr.is_active=true
ON CONFLICT(project_role_id,permission_id) DO NOTHING;

DROP POLICY IF EXISTS p17d_vessel_position_ingest_admin_insert ON public.vessel_tracking_positions;
CREATE POLICY p17d_vessel_position_ingest_admin_insert
ON public.vessel_tracking_positions
FOR INSERT TO app_runtime_secure
WITH CHECK (
  public.pke_is_platform_admin()
  AND source_id IS NOT NULL
  AND created_by=public.pke_current_user_id()
  AND review_status='pending'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);

DROP POLICY IF EXISTS p17d_vessel_position_independent_review_update ON public.vessel_tracking_positions;
CREATE POLICY p17d_vessel_position_independent_review_update
ON public.vessel_tracking_positions
FOR UPDATE TO app_runtime_secure
USING (
  source_id IS NOT NULL
  AND review_status='pending'
  AND EXISTS (
    SELECT 1 FROM public.voyages v
    WHERE v.vessel_id=vessel_tracking_positions.vessel_id
      AND v.project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
      AND public.pke_has_project_permission(v.project_id,'vessel.position.review')
  )
)
WITH CHECK (
  source_id IS NOT NULL
  AND review_status IN ('accepted','rejected','superseded')
  AND reviewed_by=public.pke_current_user_id()
  AND reviewed_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.voyages v
    WHERE v.vessel_id=vessel_tracking_positions.vessel_id
      AND v.project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
      AND public.pke_has_project_permission(v.project_id,'vessel.position.review')
  )
);

DO $verify$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_policies
   WHERE schemaname='public' AND tablename='vessel_tracking_positions'
     AND policyname='p17d_vessel_position_ingest_admin_insert' AND cmd='INSERT'
 ) THEN RAISE EXCEPTION 'AIS ingestion insert policy missing'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_catalog.pg_policies
   WHERE schemaname='public' AND tablename='vessel_tracking_positions'
     AND policyname='p17d_vessel_position_independent_review_update' AND cmd='UPDATE'
 ) THEN RAISE EXCEPTION 'AIS independent review update policy missing'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.pke_project_role_permission_allowlist
   WHERE role_code='pm' AND permission_code='vessel.position.review'
 ) THEN RAISE EXCEPTION 'PM AIS review permission missing'; END IF;
END
$verify$;

COMMIT;
