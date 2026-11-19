-- Migration 045: Cash Advance requestor/Finance RLS and financial creation audit.
-- Prepared only. Requires separate owner approval of this exact SQL and SHA-256.
BEGIN;
INSERT INTO public.permissions(name,code,description,is_active,created_at,updated_at)
VALUES('Request Project Cash Advance','finance.cash_advance.request',
 'Create Cash Advances as the authenticated requestor; own-row read unless finance.view is separately granted.',true,now(),now())
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_active=true,updated_at=now();

DROP POLICY IF EXISTS pke_admin_all ON public.cash_advances;
DROP POLICY IF EXISTS pke_cash_advances_insert ON public.cash_advances;
DROP POLICY IF EXISTS pke_cash_advances_select ON public.cash_advances;
DROP POLICY IF EXISTS pke_cash_advances_update ON public.cash_advances;
DROP POLICY IF EXISTS pke_cash_advances_delete ON public.cash_advances;
CREATE POLICY pke_cash_advances_insert ON public.cash_advances FOR INSERT TO app_runtime_secure
 WITH CHECK(NOT public.pke_is_platform_admin() AND requestor_id=public.pke_current_user_id()
 AND public.pke_has_project_permission(project_id,'finance.cash_advance.request'));
CREATE POLICY pke_cash_advances_select ON public.cash_advances FOR SELECT TO app_runtime_secure
 USING(NOT public.pke_is_platform_admin() AND (requestor_id=public.pke_current_user_id()
 OR public.pke_has_project_permission(project_id,'finance.view')));
CREATE POLICY pke_cash_advances_update ON public.cash_advances FOR UPDATE TO app_runtime_secure
 USING(NOT public.pke_is_platform_admin() AND requestor_id<>public.pke_current_user_id()
 AND public.pke_has_project_permission(project_id,'finance.update'))
 WITH CHECK(NOT public.pke_is_platform_admin() AND requestor_id<>public.pke_current_user_id()
 AND public.pke_has_project_permission(project_id,'finance.update'));
CREATE POLICY pke_cash_advances_delete ON public.cash_advances FOR DELETE TO app_runtime_secure
 USING(NOT public.pke_is_platform_admin() AND public.pke_has_project_permission(project_id,'finance.delete'));

CREATE OR REPLACE FUNCTION public.pke_financial_audit_event()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_project_id uuid; v_target_id uuid; v_action text; v_permission text;
 v_target_type text; v_after jsonb; v_metadata jsonb;
BEGIN
 v_permission:='finance.update';
 CASE TG_TABLE_NAME
 WHEN 'payment_obligations' THEN
  IF TG_OP='UPDATE' AND OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status
   AND OLD.amount_paid IS NOT DISTINCT FROM NEW.amount_paid AND OLD.approval_status IS NOT DISTINCT FROM NEW.approval_status THEN RETURN NEW; END IF;
  v_project_id:=NEW.project_id;v_target_id:=NEW.id;v_target_type:='payment_obligation';
  v_action:=CASE WHEN TG_OP='INSERT' THEN 'payment_obligation.created' ELSE 'payment_obligation.state_changed' END;
  v_after:=jsonb_build_object('project_id',NEW.project_id,'approval_status',NEW.approval_status,
   'payment_status',NEW.payment_status,'amount_paid',NEW.amount_paid,'amount',NEW.amount);
  v_metadata:=jsonb_build_object('cost_obligation_id',NEW.cost_obligation_id,'currency_id',NEW.currency_id);
 WHEN 'cash_advances' THEN
  IF TG_OP='UPDATE' AND OLD.approval_status IS NOT DISTINCT FROM NEW.approval_status
   AND OLD.disbursement_status IS NOT DISTINCT FROM NEW.disbursement_status
   AND OLD.expense_submission_status IS NOT DISTINCT FROM NEW.expense_submission_status
   AND OLD.settled_status IS NOT DISTINCT FROM NEW.settled_status
   AND OLD.remaining_balance IS NOT DISTINCT FROM NEW.remaining_balance
   AND OLD.refund_amount IS NOT DISTINCT FROM NEW.refund_amount THEN RETURN NEW; END IF;
  v_project_id:=NEW.project_id;v_target_id:=NEW.id;v_target_type:='cash_advance';
  v_action:=CASE WHEN TG_OP='INSERT' THEN 'cash_advance.created' ELSE 'cash_advance.state_changed' END;
  v_after:=jsonb_build_object('project_id',NEW.project_id,'requestor_id',NEW.requestor_id,'amount',NEW.amount,
   'currency_id',NEW.currency_id,'purpose',NEW.purpose,'advance_date',NEW.advance_date,
   'approval_status',NEW.approval_status,'disbursement_status',NEW.disbursement_status,
   'expense_submission_status',NEW.expense_submission_status,'settled_status',NEW.settled_status);
  v_metadata:=jsonb_build_object('requestor_id',NEW.requestor_id,'amount',NEW.amount,'currency_id',NEW.currency_id);
 WHEN 'ap_invoices' THEN
  IF TG_OP='UPDATE' AND OLD.paid_amount IS NOT DISTINCT FROM NEW.paid_amount
   AND OLD.outstanding_amount IS NOT DISTINCT FROM NEW.outstanding_amount
   AND OLD.verification_status IS NOT DISTINCT FROM NEW.verification_status THEN RETURN NEW; END IF;
  v_project_id:=NEW.project_id;v_target_id:=NEW.id;v_target_type:='ap_invoice';
  v_action:=CASE WHEN TG_OP='INSERT' THEN 'ap_invoice.created' ELSE 'ap_invoice.state_changed' END;
  v_after:=jsonb_build_object('invoice_number',NEW.invoice_number,'supplier_id',NEW.supplier_id,
   'project_id',NEW.project_id,'invoice_date',NEW.invoice_date,'due_date',NEW.due_date,
   'currency_id',NEW.currency_id,'invoice_amount',NEW.invoice_amount,'tax_amount',NEW.tax_amount,
   'total_amount',NEW.total_amount,'verification_status',NEW.verification_status,
   'paid_amount',NEW.paid_amount,'outstanding_amount',NEW.outstanding_amount);
  v_metadata:=jsonb_build_object('invoice_number',NEW.invoice_number,'supplier_id',NEW.supplier_id,'currency_id',NEW.currency_id);
 WHEN 'ar_invoices' THEN
  IF TG_OP='UPDATE' AND OLD.paid_amount IS NOT DISTINCT FROM NEW.paid_amount
   AND OLD.outstanding_amount IS NOT DISTINCT FROM NEW.outstanding_amount
   AND OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status
   AND OLD.settlement_status IS NOT DISTINCT FROM NEW.settlement_status THEN RETURN NEW; END IF;
  v_project_id:=NEW.project_id;v_target_id:=NEW.id;v_target_type:='ar_invoice';
  v_action:=CASE WHEN TG_OP='INSERT' THEN 'ar_invoice.created' ELSE 'ar_invoice.state_changed' END;
  v_after:=jsonb_build_object('invoice_number',NEW.invoice_number,'buyer_id',NEW.buyer_id,
   'project_id',NEW.project_id,'invoice_date',NEW.invoice_date,'due_date',NEW.due_date,
   'currency_id',NEW.currency_id,'invoice_amount',NEW.invoice_amount,'accepted_quantity',NEW.accepted_quantity,
   'selling_price',NEW.selling_price,'total_amount',NEW.total_amount,'approval_status',NEW.approval_status,
   'settlement_status',NEW.settlement_status,'payment_status',NEW.payment_status,
   'paid_amount',NEW.paid_amount,'outstanding_amount',NEW.outstanding_amount);
  v_metadata:=jsonb_build_object('invoice_number',NEW.invoice_number,'buyer_id',NEW.buyer_id,'currency_id',NEW.currency_id);
 ELSE
  RAISE EXCEPTION 'Unsupported financial audit trigger table: %',TG_TABLE_NAME USING ERRCODE='0A000';
 END CASE;
 INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
  project_id,after_snapshot,metadata,outcome)
 VALUES(public.pke_current_user_id(),'user',current_setting('app.current_role',true),v_permission,
  v_action,v_target_type,v_target_id,v_project_id,v_after,v_metadata,'success');
 RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_pke_cash_advance_created_audit AFTER INSERT ON public.cash_advances
 FOR EACH ROW EXECUTE FUNCTION public.pke_financial_audit_event();
CREATE TRIGGER trg_pke_payment_obligation_created_audit AFTER INSERT ON public.payment_obligations
 FOR EACH ROW EXECUTE FUNCTION public.pke_financial_audit_event();
CREATE TRIGGER trg_pke_ap_invoice_created_audit AFTER INSERT ON public.ap_invoices
 FOR EACH ROW EXECUTE FUNCTION public.pke_financial_audit_event();
CREATE TRIGGER trg_pke_ar_invoice_created_audit AFTER INSERT ON public.ar_invoices
 FOR EACH ROW EXECUTE FUNCTION public.pke_financial_audit_event();
COMMIT;
