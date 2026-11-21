-- Migration 080: permit Project quality readers to resolve the controlled product-attribute dictionary.
-- Target: existing Neon UAT branch only. No Production apply is authorized by this migration.
BEGIN;
CREATE POLICY pke_product_attributes_quality_view
ON public.product_attributes FOR SELECT TO app_runtime_secure
USING (
  public.pke_has_any_project_permission('quality.sample.view')
  OR public.pke_has_any_project_permission('quality.result.view')
  OR public.pke_has_any_project_permission('quality.result.create')
  OR public.pke_has_any_project_permission('quality.result.review')
);
GRANT SELECT ON public.product_attributes TO app_runtime_secure;
COMMIT;
