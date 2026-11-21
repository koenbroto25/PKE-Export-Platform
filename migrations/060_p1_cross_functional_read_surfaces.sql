-- P1 cross-functional read surfaces: narrow match inputs and role-correct operational visibility.
CREATE OR REPLACE FUNCTION public.p1_get_three_way_match_inputs(
  p_project_id uuid,
  p_receipt_id uuid,
  p_invoice_id uuid
)
RETURNS TABLE (
  receipt_id uuid,
  receipt_quantity numeric,
  receipt_unit text,
  receipt_status text,
  invoice_id uuid,
  invoice_supplier_id uuid,
  invoice_total_amount numeric,
  invoice_currency_code text,
  invoice_purchase_order_id uuid,
  invoice_goods_receipt_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  IF p_project_id IS NULL OR NOT public.pke_has_project_permission(p_project_id,'procurement.match.create') THEN
    RAISE EXCEPTION 'Procurement match permission required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT wr.id,wr.received_quantity,wr.unit,wr.status,
         ai.id,ai.supplier_id,ai.total_amount,c.code,ai.purchase_order_id,ai.goods_receipt_id
    FROM public.warehouse_receipts wr
    JOIN public.ap_invoices ai ON ai.project_id=wr.project_id
    JOIN public.currencies c ON c.id=ai.currency_id
   WHERE wr.project_id=p_project_id AND wr.id=p_receipt_id
     AND ai.id=p_invoice_id;
END;
$$;
REVOKE ALL ON FUNCTION public.p1_get_three_way_match_inputs(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.p1_get_three_way_match_inputs(uuid,uuid,uuid) TO app_runtime_secure;

DROP POLICY IF EXISTS pke_loading_operations_select ON public.loading_operations;
CREATE POLICY pke_loading_operations_select ON public.loading_operations FOR SELECT TO app_runtime_secure
USING (pke_has_project_permission(project_id,'operations.view') OR pke_has_project_permission(project_id,'shipping.view'));

DROP POLICY IF EXISTS pke_voyages_select ON public.voyages;
CREATE POLICY pke_voyages_select ON public.voyages FOR SELECT TO app_runtime_secure
USING (pke_has_project_permission(project_id,'shipping.view') OR pke_has_project_permission(project_id,'voyage.view'));

DROP POLICY IF EXISTS pke_scope_select ON public.product_quality_samples;
CREATE POLICY pke_scope_select ON public.product_quality_samples FOR SELECT TO app_runtime_secure
USING (
  project_id IS NOT NULL AND (
    pke_has_project_permission(project_id,'quality.result.create')
    OR pke_has_project_permission(project_id,'quality.result.review')
    OR pke_has_project_permission(project_id,'quality.result.view')
  )
);

DROP POLICY IF EXISTS pke_quality_select ON public.product_quality_results;
CREATE POLICY pke_quality_select ON public.product_quality_results FOR SELECT TO app_runtime_secure
USING (
  EXISTS (
    SELECT 1 FROM public.product_quality_samples s
    WHERE s.id=product_quality_results.sample_id
      AND (pke_has_project_permission(s.project_id,'quality.result.create')
        OR pke_has_project_permission(s.project_id,'quality.result.review')
        OR pke_has_project_permission(s.project_id,'quality.result.view'))
  )
);

