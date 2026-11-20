-- Migration 048: buyer, accounting, AP/AR and document-integrity authorization hardening.
-- PREPARED ONLY. Do not apply to Neon Production without separate owner approval of this exact SQL and SHA-256.
BEGIN;
ALTER TABLE public.ar_invoices ADD COLUMN IF NOT EXISTS buyer_master_id uuid REFERENCES public.buyers(id) ON DELETE RESTRICT;
ALTER TABLE public.ar_invoices ALTER COLUMN buyer_id DROP NOT NULL;
ALTER TABLE public.ar_invoices ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id), ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id), ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users(id), ADD COLUMN IF NOT EXISTS approved_at timestamptz, ADD COLUMN IF NOT EXISTS dispute_reason text;
ALTER TABLE public.ap_invoices ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id), ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id), ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.users(id), ADD COLUMN IF NOT EXISTS verified_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_ar_invoices_buyer_master_project ON public.ar_invoices (buyer_master_id, project_id);

-- Inventory Hold API existed without a canonical table migration; add the missing Project-scoped table.
CREATE TABLE IF NOT EXISTS public.inventory_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.inventory_lots(id) ON DELETE RESTRICT,
  held_quantity numeric(15,2) NOT NULL CHECK (held_quantity > 0),
  unit text NOT NULL CHECK (length(btrim(unit)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','cancelled')),
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_holds FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_holds TO app_runtime_secure;
DROP POLICY IF EXISTS pke_inventory_holds_select ON public.inventory_holds;
DROP POLICY IF EXISTS pke_inventory_holds_insert ON public.inventory_holds;
CREATE POLICY pke_inventory_holds_select ON public.inventory_holds
  FOR SELECT TO app_runtime_secure USING (public.pke_has_project_permission(project_id,'inventory.view'));
CREATE POLICY pke_inventory_holds_insert ON public.inventory_holds
  FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_has_project_permission(project_id,'inventory.hold'));

-- Align generic RLS policies with the permissions already checked by the API and role catalogue.
DROP POLICY IF EXISTS pke_truck_trips_insert ON public.truck_trips;
DROP POLICY IF EXISTS pke_truck_trips_update ON public.truck_trips;
CREATE POLICY pke_truck_trips_insert ON public.truck_trips
  FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_has_project_permission(project_id,'record_truck_trips'));
CREATE POLICY pke_truck_trips_update ON public.truck_trips
  FOR UPDATE TO app_runtime_secure USING (public.pke_has_project_permission(project_id,'record_truck_trips'))
  WITH CHECK (public.pke_has_project_permission(project_id,'record_truck_trips'));

DROP POLICY IF EXISTS pke_warehouse_receipts_select ON public.warehouse_receipts;
DROP POLICY IF EXISTS pke_warehouse_receipts_insert ON public.warehouse_receipts;
DROP POLICY IF EXISTS pke_warehouse_receipts_update ON public.warehouse_receipts;
DROP POLICY IF EXISTS pke_warehouse_receipts_delete ON public.warehouse_receipts;
CREATE POLICY pke_warehouse_receipts_select ON public.warehouse_receipts
  FOR SELECT TO app_runtime_secure USING (public.pke_has_project_permission(project_id,'warehouse.view'));
CREATE POLICY pke_warehouse_receipts_insert ON public.warehouse_receipts
  FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_has_project_permission(project_id,'warehouse.receipt.create'));
CREATE POLICY pke_warehouse_receipts_update ON public.warehouse_receipts
  FOR UPDATE TO app_runtime_secure USING (public.pke_has_project_permission(project_id,'warehouse.update'))
  WITH CHECK (public.pke_has_project_permission(project_id,'warehouse.update'));

DROP POLICY IF EXISTS pke_tracking_events_insert ON public.tracking_events;
CREATE POLICY pke_tracking_events_insert ON public.tracking_events
  FOR INSERT TO app_runtime_secure WITH CHECK (
    public.pke_has_truck_trip_permission(truck_trip_id,'record_truck_trips')
    OR (event_type = 'receipt' AND public.pke_has_truck_trip_permission(truck_trip_id,'warehouse.receipt.create'))
  );
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
