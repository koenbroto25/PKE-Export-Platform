-- Migration 048: buyer, accounting, AP/AR and document-integrity authorization hardening.
-- PREPARED ONLY. Do not apply to Neon Production without separate owner approval of this exact SQL and SHA-256.
BEGIN;
ALTER TABLE public.ar_invoices ADD COLUMN IF NOT EXISTS buyer_master_id uuid REFERENCES public.buyers(id) ON DELETE RESTRICT;
ALTER TABLE public.ar_invoices ALTER COLUMN buyer_id DROP NOT NULL;
ALTER TABLE public.ar_invoices ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id), ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id), ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users(id), ADD COLUMN IF NOT EXISTS approved_at timestamptz, ADD COLUMN IF NOT EXISTS dispute_reason text;
ALTER TABLE public.ap_invoices ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id), ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id), ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.users(id), ADD COLUMN IF NOT EXISTS verified_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_ar_invoices_buyer_master_project ON public.ar_invoices (buyer_master_id, project_id);
DROP POLICY IF EXISTS pke_buyers_insert_platform_admin ON public.buyers;
DROP POLICY IF EXISTS pke_buyers_update_platform_admin ON public.buyers;
DROP POLICY IF EXISTS pke_buyers_delete_platform_admin ON public.buyers;
CREATE POLICY pke_buyers_insert_platform_admin ON public.buyers FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY pke_buyers_update_platform_admin ON public.buyers FOR UPDATE TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY pke_buyers_delete_platform_admin ON public.buyers FOR DELETE TO app_runtime_secure USING (public.pke_is_platform_admin());
DROP POLICY IF EXISTS pke_fx_rates_insert_platform_admin ON public.fx_rates;
DROP POLICY IF EXISTS pke_fx_rates_update_platform_admin ON public.fx_rates;
DROP POLICY IF EXISTS pke_fx_rates_delete_platform_admin ON public.fx_rates;
CREATE POLICY pke_fx_rates_insert_platform_admin ON public.fx_rates FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY pke_fx_rates_update_platform_admin ON public.fx_rates FOR UPDATE TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY pke_fx_rates_delete_platform_admin ON public.fx_rates FOR DELETE TO app_runtime_secure USING (public.pke_is_platform_admin());
DROP POLICY IF EXISTS pke_chart_of_accounts_insert_platform_admin ON public.chart_of_accounts;
DROP POLICY IF EXISTS pke_chart_of_accounts_update_platform_admin ON public.chart_of_accounts;
DROP POLICY IF EXISTS pke_chart_of_accounts_delete_platform_admin ON public.chart_of_accounts;
CREATE POLICY pke_chart_of_accounts_insert_platform_admin ON public.chart_of_accounts FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY pke_chart_of_accounts_update_platform_admin ON public.chart_of_accounts FOR UPDATE TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
CREATE POLICY pke_chart_of_accounts_delete_platform_admin ON public.chart_of_accounts FOR DELETE TO app_runtime_secure USING (public.pke_is_platform_admin());
DROP POLICY IF EXISTS pke_fx_exposures_select ON public.fx_exposures;
DROP POLICY IF EXISTS pke_fx_exposures_insert ON public.fx_exposures;
DROP POLICY IF EXISTS pke_fx_exposures_update ON public.fx_exposures;
DROP POLICY IF EXISTS pke_fx_exposures_delete ON public.fx_exposures;
CREATE POLICY pke_fx_exposures_select ON public.fx_exposures FOR SELECT TO app_runtime_secure USING (public.pke_has_project_permission(project_id,'finance.view'));
CREATE POLICY pke_fx_exposures_insert ON public.fx_exposures FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_has_project_permission(project_id,'finance.create'));
CREATE POLICY pke_fx_exposures_update ON public.fx_exposures FOR UPDATE TO app_runtime_secure USING (public.pke_has_project_permission(project_id,'finance.update')) WITH CHECK (public.pke_has_project_permission(project_id,'finance.update'));
CREATE POLICY pke_fx_exposures_delete ON public.fx_exposures FOR DELETE TO app_runtime_secure USING (public.pke_has_project_permission(project_id,'finance.delete'));
DROP POLICY IF EXISTS pke_journal_lines_insert ON public.journal_lines;
CREATE POLICY pke_journal_lines_insert ON public.journal_lines FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_has_journal_entry_permission(journal_entry_id,'accounting.create'));
INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id,granted_at)
SELECT pr.project_id,pr.id,perm.id,now() FROM public.project_roles pr JOIN public.permissions perm ON perm.code='accounting.update' AND perm.is_active=true
WHERE pr.role_code='accounting' AND pr.is_active=true ON CONFLICT(project_role_id,permission_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.pke_current_user_project_permissions(p_project_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $function$
SELECT CASE WHEN public.pke_is_platform_admin() THEN ARRAY['*']::text[] ELSE COALESCE((
 SELECT array_agg(DISTINCT perm.code ORDER BY perm.code)
 FROM public.project_role_assignments a
 JOIN public.project_members pm ON pm.id=a.project_member_id AND pm.project_id=a.project_id AND pm.user_id=a.user_id
 JOIN public.project_roles pr ON pr.id=a.project_role_id AND pr.project_id=a.project_id AND pr.is_active=true
 JOIN public.project_role_permissions prp ON prp.project_id=a.project_id AND prp.project_role_id=a.project_role_id
 JOIN public.permissions perm ON perm.id=prp.permission_id AND perm.is_active=true
 JOIN public.projects p ON p.id=a.project_id AND p.is_active=true
 WHERE a.project_id=p_project_id AND a.user_id=public.pke_current_user_id() AND a.is_active=true AND a.revoked_at IS NULL
 AND (a.expires_at IS NULL OR a.expires_at>now()) AND pm.is_active=true AND pm.deactivated_at IS NULL AND (pm.expires_at IS NULL OR pm.expires_at>now())
),ARRAY[]::text[]) END
$function$;
REVOKE ALL ON FUNCTION public.pke_current_user_project_permissions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_current_user_project_permissions(uuid) TO app_runtime_secure;
COMMIT;
