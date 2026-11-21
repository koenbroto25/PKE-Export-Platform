-- Migration 046: Enforce Finance Project role for Cash Advance decisions at the database boundary.
-- PREPARED ONLY. Do not apply without separate owner approval of this exact SQL and SHA-256.
BEGIN;
CREATE OR REPLACE FUNCTION public.pke_has_active_project_role(p_project_id uuid,p_role_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
SELECT EXISTS (
 SELECT 1 FROM public.project_role_assignments a
 JOIN public.project_members pm ON pm.id=a.project_member_id AND pm.project_id=a.project_id AND pm.user_id=a.user_id
 JOIN public.project_roles pr ON pr.id=a.project_role_id AND pr.project_id=a.project_id
 JOIN public.projects proj ON proj.id=a.project_id
 JOIN public.users u ON u.id=a.user_id
 WHERE a.project_id=p_project_id
 AND a.user_id=NULLIF(current_setting('app.current_user_id',true),'')::uuid
 AND a.is_active=true AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>now())
 AND pm.is_active=true AND pm.deactivated_at IS NULL AND (pm.expires_at IS NULL OR pm.expires_at>now())
 AND pr.is_active=true AND pr.role_code=p_role_code AND proj.is_active=true AND u.is_active=true
)
$function$;
REVOKE ALL ON FUNCTION public.pke_has_active_project_role(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_has_active_project_role(uuid,text) TO app_runtime_secure;
DROP POLICY IF EXISTS pke_cash_advances_update ON public.cash_advances;
CREATE POLICY pke_cash_advances_update ON public.cash_advances FOR UPDATE TO app_runtime_secure
USING (NOT public.pke_is_platform_admin() AND requestor_id<>public.pke_current_user_id()
 AND public.pke_has_active_project_role(project_id,'finance')
 AND public.pke_has_project_permission(project_id,'finance.update'))
WITH CHECK (NOT public.pke_is_platform_admin() AND requestor_id<>public.pke_current_user_id()
 AND public.pke_has_active_project_role(project_id,'finance')
 AND public.pke_has_project_permission(project_id,'finance.update'));
CREATE OR REPLACE FUNCTION public.pke_cash_advance_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.approval_status='approved' OR OLD.disbursement_status='disbursed'
   OR EXISTS(SELECT 1 FROM public.payment_instructions pi WHERE pi.cash_advance_id=OLD.id) THEN
   RAISE EXCEPTION 'Approved, disbursed or linked cash advances are retained for audit.' USING ERRCODE='55000';
  END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.requestor_id IS DISTINCT FROM public.pke_current_user_id()
   OR NEW.approval_status<>'draft' OR NEW.disbursement_status<>'pending'
   OR COALESCE(NEW.remaining_balance,0)<>0 OR COALESCE(NEW.refund_amount,0)<>0 THEN
   RAISE EXCEPTION 'New cash advances must be created by their authenticated requestor as draft and undistributed.' USING ERRCODE='42501';
  END IF;
 ELSE
  IF OLD.approval_status='approved' OR OLD.disbursement_status='disbursed' THEN
   IF NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.requestor_id IS DISTINCT FROM OLD.requestor_id
    OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency_id IS DISTINCT FROM OLD.currency_id
    OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.advance_date IS DISTINCT FROM OLD.advance_date THEN
    RAISE EXCEPTION 'Approved/disbursed cash advance terms are immutable.' USING ERRCODE='55000';
   END IF;
  END IF;
  IF NEW.disbursement_status IS DISTINCT FROM OLD.disbursement_status THEN
   IF current_setting('app.cash_advance_reconciliation_apply',true) IS DISTINCT FROM 'on'
    OR OLD.disbursement_status<>'pending' OR NEW.disbursement_status<>'disbursed'
    OR NEW.remaining_balance IS DISTINCT FROM NEW.amount THEN
    RAISE EXCEPTION 'Cash advance disbursement is set only by a fully matched payment reconciliation.' USING ERRCODE='42501';
   END IF;
  END IF;
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status AND NEW.approval_status IN ('approved','rejected') THEN
   IF NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.requestor_id IS DISTINCT FROM OLD.requestor_id THEN
    RAISE EXCEPTION 'Cash advance Project and requestor identity are immutable during a decision.' USING ERRCODE='42501';
   END IF;
   IF NOT public.pke_has_active_project_role(NEW.project_id,'finance')
    OR NOT public.pke_has_project_permission(NEW.project_id,'finance.update') THEN
    RAISE EXCEPTION 'An active Finance Project role with finance.update is required for cash advance decisions.' USING ERRCODE='42501';
   END IF;
   IF NEW.requestor_id=public.pke_current_user_id() THEN
    RAISE EXCEPTION 'Cash advance approval/rejection must be performed by someone other than the requestor.' USING ERRCODE='42501';
   END IF;
  END IF;
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END;
$function$;
COMMIT;
