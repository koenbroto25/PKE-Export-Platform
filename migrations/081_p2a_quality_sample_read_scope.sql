-- Migration 081: align quality sample/result SELECT RLS with Project quality sample-view/create grants.
-- Target: existing Neon UAT branch only. No Production apply is authorized by this migration.
BEGIN;
CREATE POLICY pke_quality_samples_project_view
ON public.product_quality_samples FOR SELECT TO app_runtime_secure
USING (
  public.pke_has_project_permission(project_id,'quality.sample.view')
  OR public.pke_has_project_permission(project_id,'quality.sample.create')
);
CREATE POLICY pke_quality_results_sample_view
ON public.product_quality_results FOR SELECT TO app_runtime_secure
USING (
  EXISTS (
    SELECT 1 FROM public.product_quality_samples s
     WHERE s.id=product_quality_results.sample_id
       AND (
         public.pke_has_project_permission(s.project_id,'quality.sample.view')
         OR public.pke_has_project_permission(s.project_id,'quality.sample.create')
       )
  )
);
COMMIT;
