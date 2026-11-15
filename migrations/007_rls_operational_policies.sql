-- Migration: 007_rls_operational_policies
-- Phase 7: Row Level Security for Operational Tables

-- ============================================
-- Helper function: Set RLS context (transaction-local)
-- ============================================
CREATE OR REPLACE FUNCTION set_rls_context(user_id uuid)
RETURNS VOID AS $$
BEGIN
  -- Set transaction-local session variables for RLS context
  -- PERFORM makes it a local setting (SET LOCAL): auto-cleared at transaction end
  PERFORM set_config('app.current_user_id', user_id::text, true);
  PERFORM set_config('app.current_role', 'user', true);
  PERFORM set_config('app.current_project_id', '00000000-0000-0000-0000-000000000000', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Helper function: Clear RLS context (transaction-local)
-- ============================================
CREATE OR REPLACE FUNCTION clear_rls_context()
RETURNS VOID AS $$
BEGIN
  PERFORM reset_config('app.current_user_id');
  PERFORM reset_config('app.current_role');
  PERFORM reset_config('app.current_project_id');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Transport legs RLS
-- ============================================
ALTER TABLE "transport_legs" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view transport legs based on project access
CREATE POLICY "transport_legs_view" ON "transport_legs"
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE contract_program_id IN (
        SELECT id FROM contract_programs WHERE buyer_id IN (
          SELECT buyer_id FROM project_members pm
          WHERE pm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Truck trips RLS
-- ============================================
ALTER TABLE "truck_trips" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view truck trips based on project access
CREATE POLICY "truck_trips_view" ON "truck_trips"
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE contract_program_id IN (
        SELECT id FROM contract_programs WHERE buyer_id IN (
          SELECT buyer_id FROM project_members pm
          WHERE pm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Tracking events RLS
-- ============================================
ALTER TABLE "tracking_events" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view tracking events based on project access
CREATE POLICY "tracking_events_view" ON "tracking_events"
  FOR SELECT USING (
    truck_trip_id IN (
      SELECT id FROM truck_trips WHERE project_id IN (
        SELECT id FROM projects WHERE contract_program_id IN (
          SELECT id FROM contract_programs WHERE buyer_id IN (
            SELECT buyer_id FROM project_members pm
            WHERE pm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          )
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Tracking evidence RLS
-- ============================================
ALTER TABLE "tracking_evidence" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view tracking evidence based on project access
CREATE POLICY "tracking_evidence_view" ON "tracking_evidence"
  FOR SELECT USING (
    tracking_event_id IN (
      SELECT id FROM tracking_events WHERE truck_trip_id IN (
        SELECT id FROM truck_trips WHERE project_id IN (
          SELECT id FROM projects WHERE contract_program_id IN (
            SELECT id FROM contract_programs WHERE buyer_id IN (
              SELECT buyer_id FROM project_members pm
              WHERE pm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            )
          )
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Warehouse receipts RLS
-- ============================================
ALTER TABLE "warehouse_receipts" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view warehouse receipts based on project access
CREATE POLICY "warehouse_receipts_view" ON "warehouse_receipts"
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE contract_program_id IN (
        SELECT id FROM contract_programs WHERE buyer_id IN (
          SELECT buyer_id FROM project_members pm
          WHERE pm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Inventory movements RLS
-- ============================================
ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view inventory movements based on project access
CREATE POLICY "inventory_movements_view" ON "inventory_movements"
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE contract_program_id IN (
        SELECT id FROM contract_programs WHERE buyer_id IN (
          SELECT buyer_id FROM project_members pm
          WHERE pm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );