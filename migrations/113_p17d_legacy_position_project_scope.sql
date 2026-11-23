-- Migration 113: scope legacy AIS vessel-position reads to the active Project.
-- Prepared corrective migration. Do not apply to Production without exact owner approval. The replacement policy is Project scoped.
BEGIN;

DROP POLICY IF EXISTS pke_scope_select ON public.vessel_tracking_positions;

CREATE POLICY pke_scope_select
ON public.vessel_tracking_positions
FOR SELECT TO app_runtime_secure
USING (
  source_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.voyages v
    WHERE v.vessel_id = vessel_tracking_positions.vessel_id
      AND v.project_id = NULLIF(current_setting('app.current_project_id', true), '')::uuid
      AND (
        public.pke_has_project_permission(v.project_id, 'vessel.position.view')
        OR public.pke_has_project_permission(v.project_id, 'vessel.view')
        OR public.pke_has_project_permission(v.project_id, 'shipping.view')
      )
  )
);

DO $verify$
DECLARE
  policy_expression text;
BEGIN
  SELECT pg_get_expr(p.polqual, p.polrelid)
    INTO policy_expression
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'vessel_tracking_positions'
    AND p.polname = 'pke_scope_select';

  IF policy_expression IS NULL
     OR position('pke_has_project_permission' IN policy_expression) = 0
     OR position('pke_has_any_project_permission' IN policy_expression) > 0
     OR position('app.current_project_id' IN policy_expression) = 0 THEN
    RAISE EXCEPTION 'Legacy vessel-position SELECT policy is not Project scoped';
  END IF;
END
$verify$;

COMMIT;
