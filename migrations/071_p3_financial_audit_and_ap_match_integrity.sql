-- Migration 071: P1 goods-receipt match integrity and complete financial audit.
-- Target: Neon UAT only. Production requires separate owner approval.
BEGIN;

-- A verified match is unique per Project/AP invoice. This also closes the
-- concurrent-insert race that an application-level pre-check cannot prevent.
CREATE UNIQUE INDEX IF NOT EXISTS p1_goods_receipt_match_one_verified_per_invoice_uq
  ON public.p1_domain_records (project_id, (payload->>'apInvoiceId'))
  WHERE record_type='goods_receipt_match'
    AND status='verified'
    AND NULLIF(payload->>'apInvoiceId','') IS NOT NULL;

-- A verified match lookup is deliberately strict: the immutable match record,
-- PO, GRN and AP invoice must all still agree on the same Project and values.
CREATE OR REPLACE FUNCTION public.pke_ap_has_verified_three_way_match(
  p_project_id uuid,
  p_invoice_id uuid,
  p_po_id uuid,
  p_receipt_id uuid,
  p_supplier_id uuid,
  p_currency_id uuid,
  p_total_amount numeric
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.p1_domain_records m
      JOIN public.p1_domain_records po
        ON po.id=p_po_id AND po.project_id=p_project_id AND po.record_type='purchase_order'
      JOIN public.warehouse_receipts wr
        ON wr.id=p_receipt_id AND wr.project_id=p_project_id
      JOIN public.ap_invoices ai
        ON ai.id=p_invoice_id AND ai.project_id=p_project_id
      JOIN public.currencies c ON c.id=p_currency_id
     WHERE m.project_id=p_project_id
       AND m.record_type='goods_receipt_match'
       AND m.status='verified'
       AND m.parent_record_id=p_po_id
       AND m.payload->>'apInvoiceId'=p_invoice_id::text
       AND m.payload->>'purchaseOrderRecordId'=p_po_id::text
       AND m.payload->>'warehouseReceiptId'=p_receipt_id::text
       AND po.status IN ('issued','acknowledged','partially_received','received')
       AND wr.status IN ('verified','partial')
       AND NULLIF(po.payload->>'supplierId','')::uuid=p_supplier_id
       AND po.payload->>'currencyCode'=c.code
       AND m.payload->>'currencyCode'=c.code
       AND m.payload->>'unitCode'=wr.unit
       AND NULLIF(m.payload->>'matchedQuantity','')::numeric=wr.received_quantity
       AND NULLIF(m.payload->>'matchedAmount','')::numeric=p_total_amount
  );
$function$;
REVOKE ALL ON FUNCTION public.pke_ap_has_verified_three_way_match(uuid,uuid,uuid,uuid,uuid,uuid,numeric) FROM PUBLIC;

-- No caller may manufacture match metadata or mark an invoice verified at INSERT.
-- Later match metadata is accepted only when backed by the immutable verified P1
-- record. Once matched, the PO/GRN/invoice source tuple cannot be changed.
CREATE OR REPLACE FUNCTION public.pke_ap_three_way_match_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_has_match boolean := false;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.three_way_match IS TRUE OR OLD.purchase_order_id IS NOT NULL OR OLD.goods_receipt_id IS NOT NULL THEN
      RAISE EXCEPTION 'An AP invoice linked to a verified three-way match cannot be deleted.' USING ERRCODE='55000';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.verification_status='verified'
       OR COALESCE(NEW.three_way_match,false)
       OR NEW.purchase_order_id IS NOT NULL
       OR NEW.goods_receipt_id IS NOT NULL THEN
      RAISE EXCEPTION 'AP verification and three-way match metadata are workflow-managed; create the invoice first.' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.three_way_match IS TRUE AND (
       NEW.three_way_match IS DISTINCT FROM true
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
       OR NEW.currency_id IS DISTINCT FROM OLD.currency_id
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
       OR NEW.goods_receipt_id IS DISTINCT FROM OLD.goods_receipt_id
     ) THEN
    RAISE EXCEPTION 'The source tuple of a matched AP invoice is immutable.' USING ERRCODE='55000';
  END IF;

  IF NEW.three_way_match IS TRUE OR NEW.verification_status='verified'
     OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
     OR NEW.goods_receipt_id IS DISTINCT FROM OLD.goods_receipt_id
     OR NEW.three_way_match IS DISTINCT FROM OLD.three_way_match THEN
    IF NEW.three_way_match IS DISTINCT FROM true
       OR NEW.purchase_order_id IS NULL OR NEW.goods_receipt_id IS NULL THEN
      RAISE EXCEPTION 'A verified AP match requires its match flag, PO and goods receipt.' USING ERRCODE='23514';
    END IF;
    SELECT public.pke_ap_has_verified_three_way_match(
      NEW.project_id,NEW.id,NEW.purchase_order_id,NEW.goods_receipt_id,
      NEW.supplier_id,NEW.currency_id,NEW.total_amount
    ) INTO v_has_match;
    IF NOT v_has_match THEN
      RAISE EXCEPTION 'AP match/verification requires a verified same-Project PO/GRN/invoice match.' USING ERRCODE='42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.pke_ap_three_way_match_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_ap_three_way_match_guard() TO app_runtime_secure;
DROP TRIGGER IF EXISTS trg_pke_ap_three_way_match_guard ON public.ap_invoices;
CREATE TRIGGER trg_pke_ap_three_way_match_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.ap_invoices
FOR EACH ROW EXECUTE FUNCTION public.pke_ap_three_way_match_guard();

-- Prevent mutation of PO or GRN source data after a verified match references it.
CREATE OR REPLACE FUNCTION public.pke_guard_verified_match_sources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME='p1_domain_records' THEN
    IF OLD.record_type='purchase_order'
       AND EXISTS (
         SELECT 1 FROM public.p1_domain_records m
          WHERE m.project_id=OLD.project_id AND m.record_type='goods_receipt_match'
            AND m.status='verified' AND m.parent_record_id=OLD.id
       )
       AND (TG_OP='DELETE' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.payload IS DISTINCT FROM OLD.payload) THEN
      RAISE EXCEPTION 'A Purchase Order referenced by a verified three-way match is immutable.' USING ERRCODE='55000';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME='warehouse_receipts' THEN
    IF EXISTS (
      SELECT 1 FROM public.p1_domain_records m
       WHERE m.project_id=OLD.project_id AND m.record_type='goods_receipt_match'
         AND m.status='verified' AND m.payload->>'warehouseReceiptId'=OLD.id::text
    ) AND (TG_OP='DELETE'
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.received_quantity IS DISTINCT FROM OLD.received_quantity
       OR NEW.unit IS DISTINCT FROM OLD.unit
       OR NEW.status IS DISTINCT FROM OLD.status) THEN
      RAISE EXCEPTION 'A GRN referenced by a verified three-way match is immutable.' USING ERRCODE='55000';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Unsupported verified match source table: %',TG_TABLE_NAME USING ERRCODE='0A000';
END;
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_verified_match_sources() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_guard_verified_match_sources() TO app_runtime_secure;
DROP TRIGGER IF EXISTS trg_pke_verified_match_po_source_guard ON public.p1_domain_records;
CREATE TRIGGER trg_pke_verified_match_po_source_guard
BEFORE UPDATE OR DELETE ON public.p1_domain_records
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_verified_match_sources();
DROP TRIGGER IF EXISTS trg_pke_verified_match_grn_source_guard ON public.warehouse_receipts;
CREATE TRIGGER trg_pke_verified_match_grn_source_guard
BEFORE UPDATE OR DELETE ON public.warehouse_receipts
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_verified_match_sources();

-- Database-side three-way validation mirrors src/p1-workflow-engine.ts:
-- same Project, supplier, ISO currency, unit, received quantity, invoice amount,
-- and PO ceiling. The match transition is the authoritative write boundary.
CREATE OR REPLACE FUNCTION public.pke_sync_verified_goods_receipt_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_po_id uuid;
  v_receipt_id uuid;
  v_invoice_id uuid;
  v_po record;
  v_match record;
  v_po_quantity numeric := 0;
  v_po_amount numeric := 0;
  v_item_count integer := 0;
  v_units_ok boolean := false;
  v_items_valid boolean := false;
  v_matched_quantity numeric;
  v_matched_amount numeric;
  v_unit_code text;
  v_currency_code text;
  v_po_supplier_id uuid;
  v_po_currency_code text;
BEGIN
  IF NEW.record_type<>'goods_receipt_match' THEN RETURN NEW; END IF;
  IF NEW.status<>'verified' THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    RAISE EXCEPTION 'A goods receipt match must be created as draft and transition through matched before verification.' USING ERRCODE='42501';
  END IF;
  IF OLD.status='verified' THEN RETURN NEW; END IF;
  IF OLD.status<>'matched' THEN
    RAISE EXCEPTION 'Only a matched goods receipt workflow can transition to verified.' USING ERRCODE='23514';
  END IF;

  IF NOT public.pke_has_project_permission(NEW.project_id,'procurement.match.create') THEN
    RAISE EXCEPTION 'Active Project Procurement match permission is required.' USING ERRCODE='42501';
  END IF;

  BEGIN
    v_po_id:=NULLIF(NEW.payload->>'purchaseOrderRecordId','')::uuid;
    v_receipt_id:=NULLIF(NEW.payload->>'warehouseReceiptId','')::uuid;
    v_invoice_id:=NULLIF(NEW.payload->>'apInvoiceId','')::uuid;
    v_matched_quantity:=NULLIF(NEW.payload->>'matchedQuantity','')::numeric;
    v_matched_amount:=NULLIF(NEW.payload->>'matchedAmount','')::numeric;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Goods receipt match identifiers and amounts are invalid.' USING ERRCODE='22023';
  END;
  v_unit_code:=NULLIF(btrim(NEW.payload->>'unitCode'),'');
  v_currency_code:=NULLIF(btrim(NEW.payload->>'currencyCode'),'');

  IF v_po_id IS NULL OR v_receipt_id IS NULL OR v_invoice_id IS NULL
     OR NEW.parent_record_id IS DISTINCT FROM v_po_id
     OR v_matched_quantity IS NULL OR v_matched_quantity<=0
     OR v_matched_amount IS NULL OR v_matched_amount<=0
     OR v_unit_code IS NULL OR v_currency_code IS NULL THEN
    RAISE EXCEPTION 'Goods receipt match must link a same-Project PO, GRN and AP invoice with positive matched values.' USING ERRCODE='23514';
  END IF;

  SELECT id,status,payload INTO v_po
    FROM public.p1_domain_records
   WHERE id=v_po_id AND project_id=NEW.project_id AND record_type='purchase_order'
   FOR SHARE;
  IF NOT FOUND OR v_po.status NOT IN ('issued','acknowledged','partially_received','received') THEN
    RAISE EXCEPTION 'Three-way match requires an issued same-Project Purchase Order.' USING ERRCODE='23514';
  END IF;
  IF jsonb_typeof(v_po.payload->'items') IS DISTINCT FROM 'array'
     OR jsonb_array_length(COALESCE(v_po.payload->'items','[]'::jsonb))=0 THEN
    RAISE EXCEPTION 'Purchase Order must contain line items before matching.' USING ERRCODE='23514';
  END IF;

  SELECT wr.received_quantity,wr.unit,wr.status,
         ai.id AS invoice_id,ai.project_id AS invoice_project_id,ai.supplier_id AS invoice_supplier_id,
         ai.total_amount AS invoice_total_amount,c.code AS invoice_currency_code,
         ai.purchase_order_id AS invoice_purchase_order_id,ai.goods_receipt_id AS invoice_goods_receipt_id,
         ai.verification_status AS invoice_verification_status
    INTO v_match
    FROM public.warehouse_receipts wr
    JOIN public.ap_invoices ai ON ai.project_id=wr.project_id
    JOIN public.currencies c ON c.id=ai.currency_id
   WHERE wr.id=v_receipt_id AND ai.id=v_invoice_id AND wr.project_id=NEW.project_id
   FOR UPDATE OF wr,ai;
  IF NOT FOUND OR v_match.invoice_project_id IS DISTINCT FROM NEW.project_id
     OR v_match.status NOT IN ('verified','partial')
     OR v_match.invoice_verification_status NOT IN ('pending','draft') THEN
    RAISE EXCEPTION 'Three-way match requires a verified same-Project GRN and an unverified same-Project AP invoice.' USING ERRCODE='23514';
  END IF;

  BEGIN
    v_po_supplier_id:=NULLIF(v_po.payload->>'supplierId','')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Purchase Order supplier is invalid.' USING ERRCODE='23514';
  END;
  v_po_currency_code:=NULLIF(btrim(v_po.payload->>'currencyCode'),'');
  IF v_po_supplier_id IS NULL OR v_po_supplier_id IS DISTINCT FROM v_match.invoice_supplier_id
     OR v_po_currency_code IS DISTINCT FROM v_match.invoice_currency_code
     OR v_currency_code IS DISTINCT FROM v_match.invoice_currency_code
     OR v_unit_code IS DISTINCT FROM v_match.unit THEN
    RAISE EXCEPTION 'PO, GRN and AP invoice supplier, currency or unit do not match.' USING ERRCODE='23514';
  END IF;

  BEGIN
    SELECT count(*)::integer,
           COALESCE(sum((x.item->>'quantity')::numeric),0),
           COALESCE(sum((x.item->>'quantity')::numeric*(x.item->>'unitPrice')::numeric),0),
           COALESCE(bool_and(NULLIF(btrim(x.item->>'unitCode'),'') IS NOT NULL AND x.item->>'unitCode'=v_unit_code),false),
           COALESCE(bool_and(NULLIF(x.item->>'quantity','') IS NOT NULL AND NULLIF(x.item->>'unitPrice','') IS NOT NULL
             AND (x.item->>'quantity')::numeric>0 AND (x.item->>'unitPrice')::numeric>=0),false)
      INTO v_item_count,v_po_quantity,v_po_amount,v_units_ok,v_items_valid
      FROM jsonb_array_elements(v_po.payload->'items') AS x(item);
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Purchase Order line items contain invalid quantity, unit or unit price.' USING ERRCODE='23514';
  END;

  IF v_item_count=0 OR NOT v_units_ok OR NOT v_items_valid
     OR abs(v_matched_quantity-v_match.received_quantity)>0.0001
     OR v_matched_quantity-v_po_quantity>0.0001
     OR abs(v_matched_amount-v_match.invoice_total_amount)>0.0001
     OR v_matched_amount-v_po_amount>0.0001 THEN
    RAISE EXCEPTION 'PO/GRN/AP invoice quantity or amount three-way match failed.' USING ERRCODE='23514';
  END IF;

  IF (v_match.invoice_purchase_order_id IS NOT NULL AND v_match.invoice_purchase_order_id IS DISTINCT FROM v_po_id)
     OR (v_match.invoice_goods_receipt_id IS NOT NULL AND v_match.invoice_goods_receipt_id IS DISTINCT FROM v_receipt_id) THEN
    RAISE EXCEPTION 'AP invoice is already linked to a different PO or goods receipt.' USING ERRCODE='23514';
  END IF;

  UPDATE public.ap_invoices
     SET three_way_match=true,purchase_order_id=v_po_id,goods_receipt_id=v_receipt_id,updated_at=now()
   WHERE id=v_invoice_id AND project_id=NEW.project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'AP invoice disappeared during three-way match.' USING ERRCODE='23503'; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.pke_sync_verified_goods_receipt_match() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_sync_verified_goods_receipt_match() TO app_runtime_secure;
DROP TRIGGER IF EXISTS trg_pke_sync_verified_goods_receipt_match ON public.p1_domain_records;
CREATE TRIGGER trg_pke_sync_verified_goods_receipt_match
AFTER INSERT OR UPDATE OF record_type,status,payload,project_id,parent_record_id
ON public.p1_domain_records
FOR EACH ROW EXECUTE FUNCTION public.pke_sync_verified_goods_receipt_match();

-- Verified match evidence itself is append-only.
CREATE OR REPLACE FUNCTION public.pke_guard_verified_goods_receipt_match_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.record_type='goods_receipt_match' AND OLD.status='verified' THEN
      RAISE EXCEPTION 'Verified goods receipt matches are retained for financial audit.' USING ERRCODE='55000';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.record_type='goods_receipt_match' AND OLD.status='verified'
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.parent_record_id IS DISTINCT FROM OLD.parent_record_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id) THEN
    RAISE EXCEPTION 'Verified goods receipt match source data is immutable.' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_verified_goods_receipt_match_immutable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_guard_verified_goods_receipt_match_immutable() TO app_runtime_secure;
DROP TRIGGER IF EXISTS trg_pke_verified_goods_receipt_match_immutable ON public.p1_domain_records;
CREATE TRIGGER trg_pke_verified_goods_receipt_match_immutable
BEFORE UPDATE OR DELETE ON public.p1_domain_records
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_verified_goods_receipt_match_immutable();

-- Capture full before/after snapshots for AP/AR updates, including disputes,
-- approvals, match references, paid balances and all other material fields.
CREATE OR REPLACE FUNCTION public.pke_financial_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_project_id uuid;
  v_target_id uuid;
  v_action text;
  v_permission text := 'finance.update';
  v_target_type text;
  v_before jsonb;
  v_after jsonb;
  v_metadata jsonb;
  v_changed_fields jsonb;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'payment_instructions' THEN
      IF TG_OP='UPDATE' AND OLD.instruction_status IS NOT DISTINCT FROM NEW.instruction_status THEN RETURN NEW; END IF;
      v_project_id:=NEW.project_id; v_target_id:=NEW.id; v_target_type:='payment_instruction';
      v_action:='payment_instruction.status_changed'; v_permission:='payment.request';
      IF TG_OP='UPDATE' THEN v_before:=jsonb_build_object('instruction_status',OLD.instruction_status,'approved_at',OLD.approved_at,
        'acknowledged_at',OLD.acknowledged_at,'external_execution_date',OLD.external_execution_date,'returned_at',OLD.returned_at); END IF;
      v_after:=jsonb_build_object('instruction_status',NEW.instruction_status,'approved_at',NEW.approved_at,
        'acknowledged_at',NEW.acknowledged_at,'external_execution_date',NEW.external_execution_date,'returned_at',NEW.returned_at);
      v_metadata:=jsonb_build_object('payment_obligation_id',NEW.payment_obligation_id,'cash_advance_id',NEW.cash_advance_id,
        'amount',NEW.amount,'currency_id',NEW.currency_id,'requested_by',NEW.requested_by,'approved_by',NEW.approved_by,
        'acknowledged_by',NEW.acknowledged_by,'returned_by',NEW.returned_by,'return_reason',NEW.return_reason,
        'external_reference_present',NULLIF(btrim(NEW.external_reference),'') IS NOT NULL);
    WHEN 'payment_instruction_approvals' THEN
      SELECT project_id INTO v_project_id FROM public.payment_instructions WHERE id=NEW.payment_instruction_id;
      v_target_id:=NEW.id; v_target_type:='payment_instruction_approval';
      v_action:='payment_instruction.approval_recorded'; v_permission:='payment.approve';
      IF TG_OP='UPDATE' THEN v_before:=jsonb_build_object('decision',OLD.decision,'approver_id',OLD.approver_id,'decided_at',OLD.decided_at); END IF;
      v_after:=jsonb_build_object('decision',NEW.decision,'approver_id',NEW.approver_id,'decided_at',NEW.decided_at);
      v_metadata:=jsonb_build_object('payment_instruction_id',NEW.payment_instruction_id,'reason',NEW.reason);
    WHEN 'payment_evidence' THEN
      SELECT project_id INTO v_project_id FROM public.payment_instructions WHERE id=NEW.payment_instruction_id;
      v_target_id:=NEW.id; v_target_type:='payment_evidence';
      v_action:=CASE WHEN TG_OP='INSERT' THEN 'payment_evidence.registered' ELSE 'payment_evidence.reviewed' END;
      v_permission:=CASE WHEN TG_OP='INSERT' THEN 'payment.request' ELSE 'payment.evidence.verify' END;
      IF TG_OP='UPDATE' THEN v_before:=jsonb_build_object('status',OLD.status,'mime_type',OLD.mime_type,'file_size_bytes',OLD.file_size_bytes,
        'sha256_checksum',OLD.sha256_checksum,'reviewed_by',OLD.reviewed_by,'reviewed_at',OLD.reviewed_at); END IF;
      v_after:=jsonb_build_object('status',NEW.status,'mime_type',NEW.mime_type,'file_size_bytes',NEW.file_size_bytes,
        'sha256_checksum',NEW.sha256_checksum,'reviewed_by',NEW.reviewed_by,'reviewed_at',NEW.reviewed_at);
      v_metadata:=jsonb_build_object('payment_instruction_id',NEW.payment_instruction_id,'object_bucket',NEW.object_bucket,
        'object_key',NEW.object_key,'supersedes_evidence_id',NEW.supersedes_evidence_id);
    WHEN 'payment_verifications' THEN
      SELECT project_id INTO v_project_id FROM public.payment_instructions WHERE id=NEW.payment_instruction_id;
      v_target_id:=NEW.id; v_target_type:='payment_verification'; v_action:='payment_evidence.verified';
      v_permission:='payment.evidence.verify';
      IF TG_OP='UPDATE' THEN v_before:=jsonb_build_object('verification_status',OLD.verification_status,'verified_amount',OLD.verified_amount,
        'verified_currency_id',OLD.verified_currency_id,'verified_execution_date',OLD.verified_execution_date,
        'verified_by',OLD.verified_by,'verified_at',OLD.verified_at); END IF;
      v_after:=jsonb_build_object('verification_status',NEW.verification_status,'verified_amount',NEW.verified_amount,
        'verified_currency_id',NEW.verified_currency_id,'verified_execution_date',NEW.verified_execution_date,
        'verified_by',NEW.verified_by,'verified_at',NEW.verified_at);
      v_metadata:=jsonb_build_object('payment_instruction_id',NEW.payment_instruction_id,'evidence_id',NEW.evidence_id);
    WHEN 'payment_reconciliations' THEN
      IF TG_OP='UPDATE' AND OLD.reconciliation_status IS NOT DISTINCT FROM NEW.reconciliation_status THEN RETURN NEW; END IF;
      IF NEW.reconciliation_status='matched' THEN RETURN NEW; END IF;
      v_project_id:=NEW.project_id; v_target_id:=NEW.id; v_target_type:='payment_reconciliation';
      v_action:=CASE WHEN TG_OP='INSERT' THEN 'payment_reconciliation.created' ELSE 'payment_reconciliation.exception' END;
      v_permission:='payment.reconcile';
      IF TG_OP='UPDATE' THEN v_before:=jsonb_build_object('reconciliation_status',OLD.reconciliation_status,'reconciled_amount',OLD.reconciled_amount,
        'currency_id',OLD.currency_id,'reconciled_by',OLD.reconciled_by,'reconciled_at',OLD.reconciled_at); END IF;
      v_after:=jsonb_build_object('reconciliation_status',NEW.reconciliation_status,'reconciled_amount',NEW.reconciled_amount,
        'currency_id',NEW.currency_id,'reconciled_by',NEW.reconciled_by,'reconciled_at',NEW.reconciled_at);
      v_metadata:=jsonb_build_object('payment_instruction_id',NEW.payment_instruction_id,'verification_id',NEW.verification_id,
        'exception_reason',NEW.exception_reason);
    WHEN 'payment_obligations' THEN
      IF TG_OP='UPDATE' AND (to_jsonb(OLD)-'updated_at') IS NOT DISTINCT FROM (to_jsonb(NEW)-'updated_at') THEN RETURN NEW; END IF;
      v_project_id:=NEW.project_id; v_target_id:=NEW.id; v_target_type:='payment_obligation';
      v_action:='payment_obligation.state_changed'; v_permission:='finance.update';
      IF TG_OP='UPDATE' THEN v_before:=to_jsonb(OLD)-'updated_at'; END IF;
      v_after:=to_jsonb(NEW)-'updated_at';
      v_metadata:=jsonb_build_object('cost_obligation_id',NEW.cost_obligation_id,'currency_id',NEW.currency_id);
    WHEN 'cash_advances' THEN
      IF TG_OP='UPDATE' AND (to_jsonb(OLD)-'updated_at') IS NOT DISTINCT FROM (to_jsonb(NEW)-'updated_at') THEN RETURN NEW; END IF;
      v_project_id:=NEW.project_id; v_target_id:=NEW.id; v_target_type:='cash_advance';
      v_action:='cash_advance.state_changed'; v_permission:='finance.update';
      IF TG_OP='UPDATE' THEN v_before:=to_jsonb(OLD)-'updated_at'; END IF;
      v_after:=to_jsonb(NEW)-'updated_at';
      v_metadata:=jsonb_build_object('requestor_id',NEW.requestor_id,'amount',NEW.amount,'currency_id',NEW.currency_id);
    WHEN 'ap_invoices' THEN
      IF TG_OP='UPDATE' AND (to_jsonb(OLD)-'updated_at') IS NOT DISTINCT FROM (to_jsonb(NEW)-'updated_at') THEN RETURN NEW; END IF;
      v_project_id:=NEW.project_id; v_target_id:=NEW.id; v_target_type:='ap_invoice';
      v_action:='ap_invoice.state_changed'; v_permission:='finance.update';
      IF TG_OP='UPDATE' THEN v_before:=to_jsonb(OLD)-'updated_at'; END IF;
      v_after:=to_jsonb(NEW)-'updated_at';
      IF TG_OP='UPDATE' THEN
        SELECT COALESCE(jsonb_agg(k ORDER BY k),'[]'::jsonb) INTO v_changed_fields
          FROM (SELECT jsonb_object_keys(v_after) AS k) q
         WHERE (v_before->q.k) IS DISTINCT FROM (v_after->q.k);
      ELSE v_changed_fields:='[]'::jsonb; END IF;
      v_metadata:=jsonb_build_object('invoice_number',NEW.invoice_number,'supplier_id',NEW.supplier_id,
        'currency_id',NEW.currency_id,'changed_fields',v_changed_fields);
    WHEN 'ar_invoices' THEN
      IF TG_OP='UPDATE' AND (to_jsonb(OLD)-'updated_at') IS NOT DISTINCT FROM (to_jsonb(NEW)-'updated_at') THEN RETURN NEW; END IF;
      v_project_id:=NEW.project_id; v_target_id:=NEW.id; v_target_type:='ar_invoice';
      v_action:='ar_invoice.state_changed'; v_permission:='finance.update';
      IF TG_OP='UPDATE' THEN v_before:=to_jsonb(OLD)-'updated_at'; END IF;
      v_after:=to_jsonb(NEW)-'updated_at';
      IF TG_OP='UPDATE' THEN
        SELECT COALESCE(jsonb_agg(k ORDER BY k),'[]'::jsonb) INTO v_changed_fields
          FROM (SELECT jsonb_object_keys(v_after) AS k) q
         WHERE (v_before->q.k) IS DISTINCT FROM (v_after->q.k);
      ELSE v_changed_fields:='[]'::jsonb; END IF;
      v_metadata:=jsonb_build_object('invoice_number',NEW.invoice_number,'buyer_id',NEW.buyer_id,
        'buyer_master_id',NEW.buyer_master_id,'currency_id',NEW.currency_id,'changed_fields',v_changed_fields);
    ELSE
      RAISE EXCEPTION 'Unsupported financial audit trigger table: %',TG_TABLE_NAME USING ERRCODE='0A000';
  END CASE;

  INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
    project_id,before_snapshot,after_snapshot,metadata,outcome)
  VALUES(public.pke_current_user_id(),'user',current_setting('app.current_role',true),v_permission,v_action,
    v_target_type,v_target_id,v_project_id,v_before,v_after,v_metadata,'success');
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.pke_financial_audit_event() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_financial_audit_event() TO app_runtime_secure;
DROP TRIGGER IF EXISTS trg_pke_ap_invoice_audit ON public.ap_invoices;
CREATE TRIGGER trg_pke_ap_invoice_audit AFTER UPDATE ON public.ap_invoices
FOR EACH ROW EXECUTE FUNCTION public.pke_financial_audit_event();
DROP TRIGGER IF EXISTS trg_pke_ar_invoice_audit ON public.ar_invoices;
CREATE TRIGGER trg_pke_ar_invoice_audit AFTER UPDATE ON public.ar_invoices
FOR EACH ROW EXECUTE FUNCTION public.pke_financial_audit_event();

-- Catalog postconditions: all enforcement and audit paths must be active.
DO $postconditions$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_pke_ap_three_way_match_guard' AND NOT tgisinternal AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'P3 AP three-way match guard trigger is missing or disabled.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_pke_sync_verified_goods_receipt_match' AND NOT tgisinternal AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'P1 verified goods receipt match synchronizer is missing or disabled.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_pke_verified_goods_receipt_match_immutable' AND NOT tgisinternal AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'P1 verified goods receipt match immutability trigger is missing or disabled.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_pke_verified_match_grn_source_guard' AND NOT tgisinternal AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'P1 verified GRN source guard trigger is missing or disabled.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_pke_ap_invoice_audit' AND NOT tgisinternal AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'P3 AP audit trigger is missing or disabled.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_pke_ar_invoice_audit' AND NOT tgisinternal AND tgenabled<>'D') THEN
    RAISE EXCEPTION 'P3 AR audit trigger is missing or disabled.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname='p1_goods_receipt_match_one_verified_per_invoice_uq' AND i.indisunique AND i.indisvalid) THEN
    RAISE EXCEPTION 'P1 verified match uniqueness index is missing or invalid.';
  END IF;
END;
$postconditions$;

COMMIT;