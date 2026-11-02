-- Migration: RLS - Row Level Security Policies (Transaction-Local Context)
-- Phase 3: Identity, Authorization, Role & RLS
-- Uses transaction-local session variables for RLS context (per P03 guidelines)
-- SET LOCAL ensures context is cleared automatically after each transaction,
-- preventing context leakage in pooled connections.

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
-- Users table RLS
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own record
-- current_setting(..., true) returns default value if not set (safe for RLS)
CREATE POLICY "users_self_view" ON users
  FOR SELECT USING (id = current_setting('app.current_user_id', true));

-- Policy: Admins can view all users
CREATE POLICY "users_admin_view" ON users
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Role catalog RLS
-- ============================================
ALTER TABLE role_catalog ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view active roles
CREATE POLICY "role_catalog_view" ON role_catalog
  FOR SELECT USING (is_active = true);

-- ============================================
-- Permissions RLS
-- ============================================
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view active permissions
CREATE POLICY "permissions_view" ON permissions
  FOR SELECT USING (is_active = true);

-- ============================================
-- Role permissions RLS
-- ============================================
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view permissions relevant to their role
CREATE POLICY "role_permissions_view" ON role_permissions
  FOR SELECT USING (
    role_id IN (
      SELECT role_id FROM project_members WHERE user_id = current_setting('app.current_user_id', true)
    )
  );

-- ============================================
-- Project members RLS
-- ============================================
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own project memberships
CREATE POLICY "project_members_self_view" ON project_members
  FOR SELECT USING (user_id = current_setting('app.current_user_id', true));

-- Policy: Admin can view all project memberships
CREATE POLICY "project_members_admin_view" ON project_members
  FOR SELECT USING (
    current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Buyers RLS
-- ============================================
ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view buyers based on project membership
CREATE POLICY "buyers_view" ON buyers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.user_id = current_setting('app.current_user_id', true)
    )
  );

-- ============================================
-- PKS sites RLS
-- ============================================
ALTER TABLE pks_sites ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view PKS sites based on project membership
CREATE POLICY "pks_sites_view" ON pks_sites
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.user_id = current_setting('app.current_user_id', true)
    )
  );

-- ============================================
-- Contracts RLS
-- ============================================
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view contracts based on buyer access through project membership
CREATE POLICY "contracts_view" ON contracts
  FOR SELECT USING (
    buyer_id IN (
      SELECT buyer_id FROM project_members pm
      WHERE pm.user_id = current_setting('app.current_user_id', true)
    )
  );

-- ============================================
-- Contract Programs RLS
-- ============================================
ALTER TABLE contract_programs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view contract programs based on buyer access
CREATE POLICY "contract_programs_view" ON contract_programs
  FOR SELECT USING (
    buyer_id IN (
      SELECT buyer_id FROM project_members pm
      WHERE pm.user_id = current_setting('app.current_user_id', true)
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- Policy: Admins can modify contract programs
CREATE POLICY "contract_programs_admin_modify" ON contract_programs
  FOR ALL USING (
    current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Cycle Policies RLS
-- ============================================
ALTER TABLE cycle_policies ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view cycle policies through contract program access
CREATE POLICY "cycle_policies_view" ON cycle_policies
  FOR SELECT USING (
    contract_program_id IN (
      SELECT id FROM contract_programs WHERE buyer_id IN (
        SELECT buyer_id FROM project_members pm
        WHERE pm.user_id = current_setting('app.current_user_id', true)
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Projects RLS
-- ============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view projects assigned to them via contract program
CREATE POLICY "projects_view" ON projects
  FOR SELECT USING (
    contract_program_id IN (
      SELECT id FROM contract_programs WHERE buyer_id IN (
        SELECT buyer_id FROM project_members pm
        WHERE pm.user_id = current_setting('app.current_user_id', true)
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- Policy: Admins can modify projects
CREATE POLICY "projects_admin_modify" ON projects
  FOR ALL USING (
    current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Project versions RLS
-- ============================================
ALTER TABLE project_versions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view project versions through project access
CREATE POLICY "project_versions_view" ON project_versions
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE contract_program_id IN (
        SELECT id FROM contract_programs WHERE buyer_id IN (
          SELECT buyer_id FROM project_members pm
          WHERE pm.user_id = current_setting('app.current_user_id', true)
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Project change requests RLS
-- ============================================
ALTER TABLE project_change_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view change requests for their projects
CREATE POLICY "project_change_requests_view" ON project_change_requests
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE contract_program_id IN (
        SELECT id FROM contract_programs WHERE buyer_id IN (
          SELECT buyer_id FROM project_members pm
          WHERE pm.user_id = current_setting('app.current_user_id', true)
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- Policy: Admin can modify change requests
CREATE POLICY "project_change_requests_admin_modify" ON project_change_requests
  FOR ALL USING (
    current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Approval events RLS
-- ============================================
ALTER TABLE approval_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view approval events for their entities
CREATE POLICY "approval_events_view" ON approval_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = current_setting('app.current_user_id', true)
    )
  );

-- Policy: Admin can modify approval events
CREATE POLICY "approval_events_admin_modify" ON approval_events
  FOR ALL USING (
    current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Warehouses RLS
-- ============================================
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view warehouses based on project membership
CREATE POLICY "warehouses_view" ON warehouses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.user_id = current_setting('app.current_user_id', true)
    )
  );

-- ============================================
-- Ports RLS
-- ============================================
ALTER TABLE ports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view ports based on project membership
CREATE POLICY "ports_view" ON ports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.user_id = current_setting('app.current_user_id', true)
    )
  );

-- ============================================
-- Vessels RLS
-- ============================================
ALTER TABLE vessels ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view vessels based on project membership
CREATE POLICY "vessels_view" ON vessels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.user_id = current_setting('app.current_user_id', true)
    )
  );

-- ============================================
-- Truck trips RLS
-- ============================================
ALTER TABLE truck_trips ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view truck trips based on project access
CREATE POLICY "truck_trips_view" ON truck_trips
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE contract_program_id IN (
        SELECT id FROM contract_programs WHERE buyer_id IN (
          SELECT buyer_id FROM project_members pm
          WHERE pm.user_id = current_setting('app.current_user_id', true)
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Tracking events RLS
-- ============================================
ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view tracking events based on truck trip access
CREATE POLICY "tracking_events_view" ON tracking_events
  FOR SELECT USING (
    truck_trip_id IN (
      SELECT id FROM truck_trips WHERE project_id IN (
        SELECT id FROM projects WHERE contract_program_id IN (
          SELECT id FROM contract_programs WHERE buyer_id IN (
            SELECT buyer_id FROM project_members pm
            WHERE pm.user_id = current_setting('app.current_user_id', true)
          )
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Inventory lots RLS
-- ============================================
ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view inventory lots based on project access
CREATE POLICY "inventory_lots_view" ON inventory_lots
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE contract_program_id IN (
        SELECT id FROM contract_programs WHERE buyer_id IN (
          SELECT buyer_id FROM project_members pm
          WHERE pm.user_id = current_setting('app.current_user_id', true)
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Packing batches RLS
-- ============================================
ALTER TABLE packing_batches ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view packing batches based on project access
CREATE POLICY "packing_batches_view" ON packing_batches
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE contract_program_id IN (
        SELECT id FROM contract_programs WHERE buyer_id IN (
          SELECT buyer_id FROM project_members pm
          WHERE pm.user_id = current_setting('app.current_user_id', true)
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Loading operations RLS
-- ============================================
ALTER TABLE loading_operations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view loading operations based on project access
CREATE POLICY "loading_operations_view" ON loading_operations
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE contract_program_id IN (
        SELECT id FROM contract_programs WHERE buyer_id IN (
          SELECT buyer_id FROM project_members pm
          WHERE pm.user_id = current_setting('app.current_user_id', true)
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Voyages RLS
-- ============================================
ALTER TABLE voyages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view voyages based on project access
CREATE POLICY "voyages_view" ON voyages
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE contract_program_id IN (
        SELECT id FROM contract_programs WHERE buyer_id IN (
          SELECT buyer_id FROM project_members pm
          WHERE pm.user_id = current_setting('app.current_user_id', true)
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );

-- ============================================
-- Shipments RLS
-- ============================================
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view shipments based on project access
CREATE POLICY "shipments_view" ON shipments
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE contract_program_id IN (
        SELECT id FROM contract_programs WHERE buyer_id IN (
          SELECT buyer_id FROM project_members pm
          WHERE pm.user_id = current_setting('app.current_user_id', true)
        )
      )
    )
    OR current_setting('app.current_role', true) = 'admin'
  );