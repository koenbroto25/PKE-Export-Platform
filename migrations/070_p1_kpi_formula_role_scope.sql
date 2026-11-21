-- Migration 070: enforce active-role KPI formula scopes inside the secure aggregate function.
-- UAT ONLY. Do not add to the Production migration manifest or apply through the generic Production runner.
BEGIN;

CREATE OR REPLACE FUNCTION public.p1_kpi_formula_allowed(
  p_project_id uuid,
  p_formula_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN public.p1_has_active_project_role_assignment(p_project_id,'pm',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'project_admin',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'platform_admin',public.pke_current_user_id()) THEN true
    WHEN p_formula_key IN ('po_cycle_time_hours','three_way_match_rate') THEN
      public.p1_has_active_project_role_assignment(p_project_id,'procurement',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'contract_manager',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'buyer',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'finance',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'accounting',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'pks_site_manager',public.pke_current_user_id())
    WHEN p_formula_key IN ('production_output_quantity','hse_open_actions','qa_release_rate') THEN
      public.p1_has_active_project_role_assignment(p_project_id,'pks_site_manager',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'production_manager',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'packing_supervisor',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'qc_officer',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'laboratory_officer',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'qa_manager',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'hse_officer',public.pke_current_user_id())
    WHEN p_formula_key='dispatch_on_time_rate' THEN
      public.p1_has_active_project_role_assignment(p_project_id,'transport_manager',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'dispatcher',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'transporter',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'driver',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'checker',public.pke_current_user_id())
    WHEN p_formula_key IN ('loading_completion_rate','laytime_hours') THEN
      public.p1_has_active_project_role_assignment(p_project_id,'master_of_loading',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'loading_manager',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'loading_supervisor',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'loading_operator',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'marine_surveyor',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'ship_master',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'terminal_representative',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'shipping_agent',public.pke_current_user_id())
    WHEN p_formula_key='lc_discrepancy_rate' THEN
      public.p1_has_active_project_role_assignment(p_project_id,'shipping_agent',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'document_officer',public.pke_current_user_id())
    WHEN p_formula_key='document_freshness_rate' THEN
      public.p1_has_active_project_role_assignment(p_project_id,'document_officer',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'internal_auditor',public.pke_current_user_id())
    WHEN p_formula_key='audit_overdue_count' THEN
      public.p1_has_active_project_role_assignment(p_project_id,'internal_auditor',public.pke_current_user_id())
    WHEN p_formula_key='inventory_variance_quantity' THEN
      public.p1_has_active_project_role_assignment(p_project_id,'warehouse',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'warehouse_manager',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'warehouse_officer',public.pke_current_user_id())
      OR public.p1_has_active_project_role_assignment(p_project_id,'inventory_controller',public.pke_current_user_id())
    ELSE false
  END
$function$;

REVOKE ALL ON FUNCTION public.p1_kpi_formula_allowed(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.p1_kpi_formula_allowed(uuid,text) TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.p1_get_kpi_metric(
  p_project_id uuid,
  p_formula_key text
)
RETURNS TABLE(value double precision, source_rows integer, as_of timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_value double precision := NULL;
  v_rows integer := 0;
  v_as_of timestamptz := NULL;
  v_valid integer := 0;
  v_on_time integer := 0;
  v_row record;
  v_planned timestamptz;
  v_actual timestamptz;
BEGIN
  IF p_project_id IS NULL OR p_formula_key IS NULL THEN
    RAISE EXCEPTION 'Project and KPI formula are required' USING ERRCODE='22023';
  END IF;

  IF NOT (
    (
      public.pke_has_project_permission(p_project_id,'p1.kpi.view')
      OR public.pke_has_project_permission(p_project_id,'reports.view')
    )
    AND public.p1_kpi_formula_allowed(p_project_id,p_formula_key)
  ) THEN
    RAISE EXCEPTION 'P1 KPI permission and active-role formula scope required' USING ERRCODE='42501';
  END IF;

  IF p_formula_key='po_cycle_time_hours' THEN
    SELECT avg(extract(epoch FROM (e.occurred_at-r.created_at))/3600)::double precision,
           count(*)::integer,max(e.occurred_at)
      INTO v_value,v_rows,v_as_of
    FROM public.p1_domain_records r
    JOIN LATERAL (
      SELECT occurred_at FROM public.p1_domain_events
      WHERE record_id=r.id AND project_id=r.project_id AND event_type='approved'
      ORDER BY occurred_at LIMIT 1
    ) e ON true
    WHERE r.project_id=p_project_id AND r.record_type='purchase_order'
      AND r.status IN ('approved','issued','acknowledged','partially_received','received');

  ELSIF p_formula_key='three_way_match_rate' THEN
    SELECT CASE WHEN count(*)=0 THEN NULL ELSE
             count(*) FILTER(WHERE status IN ('matched','verified'))::double precision/count(*)::double precision*100 END,
           count(*)::integer,max(updated_at)
      INTO v_value,v_rows,v_as_of
    FROM public.p1_domain_records
    WHERE project_id=p_project_id AND record_type='goods_receipt_match';

  ELSIF p_formula_key='qa_release_rate' THEN
    SELECT CASE WHEN count(*) FILTER(WHERE status IN ('released','held'))=0 THEN NULL ELSE
             count(*) FILTER(WHERE status='released')::double precision/
             count(*) FILTER(WHERE status IN ('released','held'))::double precision*100 END,
           count(*) FILTER(WHERE status IN ('released','held'))::integer,max(updated_at)
      INTO v_value,v_rows,v_as_of
    FROM public.p1_domain_records
    WHERE project_id=p_project_id AND record_type='qa_release';

  ELSIF p_formula_key='lc_discrepancy_rate' THEN
    SELECT CASE WHEN count(*) FILTER(WHERE status IN ('presented','accepted','discrepancy'))=0 THEN NULL ELSE
             count(*) FILTER(WHERE status='discrepancy')::double precision/
             count(*) FILTER(WHERE status IN ('presented','accepted','discrepancy'))::double precision*100 END,
           count(*) FILTER(WHERE status IN ('presented','accepted','discrepancy'))::integer,max(updated_at)
      INTO v_value,v_rows,v_as_of
    FROM public.p1_domain_records
    WHERE project_id=p_project_id AND record_type='lc_presentation';

  ELSIF p_formula_key='loading_completion_rate' THEN
    SELECT CASE WHEN count(*)>0 AND COALESCE(sum(op.quantity),0)>0 THEN
             COALESCE(sum(t.verified_quantity),0)::double precision/sum(op.quantity)::double precision*100 ELSE NULL END,
           count(*)::integer,max(COALESCE(t.as_of,op.started_at))
      INTO v_value,v_rows,v_as_of
    FROM public.loading_operations op
    LEFT JOIN LATERAL (
      SELECT sum(quantity) FILTER(WHERE status='verified')::double precision verified_quantity,
             max(verified_at) as_of
      FROM public.loading_tickets
      WHERE project_id=op.project_id AND loading_operation_id=op.id
    ) t ON true
    WHERE op.project_id=p_project_id AND op.quantity>0;

  ELSIF p_formula_key='production_output_quantity' THEN
    SELECT CASE WHEN count(*)=0 THEN NULL ELSE sum(quantity)::double precision END,
           count(*)::integer,max(updated_at)
      INTO v_value,v_rows,v_as_of
    FROM public.production_batches
    WHERE project_id=p_project_id AND quality_status='passed';

  ELSIF p_formula_key='hse_open_actions' THEN
    SELECT CASE WHEN count(*)=0 THEN NULL ELSE
             count(*) FILTER(WHERE status NOT IN ('completed','verified','closed','cancelled'))::double precision END,
           count(*)::integer,max(updated_at)
      INTO v_value,v_rows,v_as_of
    FROM public.p1_domain_records
    WHERE project_id=p_project_id AND record_type='hse_action';

  ELSIF p_formula_key='audit_overdue_count' THEN
    SELECT CASE WHEN count(*)=0 THEN NULL ELSE
             count(*) FILTER(WHERE status NOT IN ('closed','cancelled') AND due_at<now())::double precision END,
           count(*)::integer,max(updated_at)
      INTO v_value,v_rows,v_as_of
    FROM public.p1_domain_records
    WHERE project_id=p_project_id AND record_type='audit_finding';

  ELSIF p_formula_key='dispatch_on_time_rate' THEN
    SELECT count(*)::integer,max(updated_at)
      INTO v_rows,v_as_of
    FROM public.p1_domain_records
    WHERE project_id=p_project_id AND record_type='dispatch_assignment' AND status='completed';

    FOR v_row IN
      SELECT payload->>'plannedArrivalAt' AS planned,payload->>'actualArrivalAt' AS actual
      FROM public.p1_domain_records
      WHERE project_id=p_project_id AND record_type='dispatch_assignment' AND status='completed'
    LOOP
      BEGIN
        IF v_row.planned IS NOT NULL AND v_row.actual IS NOT NULL THEN
          v_planned:=v_row.planned::timestamptz;
          v_actual:=v_row.actual::timestamptz;
          v_valid:=v_valid+1;
          IF v_actual<=v_planned THEN v_on_time:=v_on_time+1; END IF;
        END IF;
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END LOOP;
    v_value:=CASE WHEN v_valid=0 THEN NULL ELSE v_on_time::double precision/v_valid::double precision*100 END;

  ELSIF p_formula_key='laytime_hours' THEN
    SELECT CASE WHEN count(*)=0 THEN NULL ELSE
             sum(COALESCE((payload->>'laytimeImpactHours')::numeric,0))::double precision END,
           count(*)::integer,max(updated_at)
      INTO v_value,v_rows,v_as_of
    FROM public.p1_domain_records
    WHERE project_id=p_project_id AND record_type='laytime_event' AND status='verified';

  ELSIF p_formula_key='inventory_variance_quantity' THEN
    SELECT CASE WHEN count(*)=0 THEN NULL ELSE COALESCE(sum(variance_quantity),0)::double precision END,
           count(*)::integer,max(created_at)
      INTO v_value,v_rows,v_as_of
    FROM public.inventory_reconciliations
    WHERE project_id=p_project_id;

  ELSIF p_formula_key='document_freshness_rate' THEN
    SELECT CASE WHEN count(*)=0 THEN NULL ELSE
             count(*) FILTER(WHERE status='approved'
               AND (expiry_date IS NULL OR expiry_date>=current_date)
               AND sha256_checksum IS NOT NULL AND object_key IS NOT NULL
               AND upload_verified_at IS NOT NULL AND storage_bucket='pke-private-documents')::double precision/
             count(*)::double precision*100 END,
           count(*)::integer,max(upload_verified_at)
      INTO v_value,v_rows,v_as_of
    FROM public.project_export_documents
    WHERE project_id=p_project_id;

  ELSE
    RAISE EXCEPTION 'Unsupported P1 KPI formula: %',p_formula_key USING ERRCODE='22023';
  END IF;

  RETURN QUERY SELECT v_value,v_rows,v_as_of;
END
$function$;

REVOKE ALL ON FUNCTION public.p1_get_kpi_metric(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.p1_get_kpi_metric(uuid,text) TO app_runtime_secure;

COMMIT;
