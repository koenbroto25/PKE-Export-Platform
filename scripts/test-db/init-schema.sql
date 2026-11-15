-- Sprint 01.1 Local Test Database Schema Initialization
-- Based on verified Production contract (read-only inspection of Neon Production)
-- Tables match Production schema for the operational slice.
-- Run as superuser/setup role, then create app_runtime_secure (NOBYPASSRLS).
-- No business data except synthetic test fixtures for identities/projects.

-- ============================================
-- Enable pgcrypto for gen_random_uuid()
-- ============================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- Create custom types (enums) FIRST - before any table that references them
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('admin','pm','field_manager','procurement','checker','warehouse_manager','packing_supervisor','loading_manager','document_officer','finance','cashier','accounting','funder','buyer','supplier','transporter','external_provider','viewer');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
    CREATE TYPE project_status AS ENUM ('draft','active','partial','settled','closed');
  END IF;
END $$;

-- ============================================
-- Reference tables (no deps)
-- ============================================
CREATE TABLE IF NOT EXISTS countries (
  country_code character(2) PRIMARY KEY,
  country_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pks_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  code text NOT NULL UNIQUE,
  country_code character(2) REFERENCES countries(country_code),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Auth/identity tables
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  role text NOT NULL DEFAULT 'viewer'::user_role,
  mfa_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  neon_auth_user_id uuid UNIQUE
);

CREATE TABLE IF NOT EXISTS role_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES role_catalog(id),
  permission_id uuid NOT NULL REFERENCES permissions(id),
  granted_by uuid REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission_id)
);

-- ============================================
-- Core business tables (matching Production contract)
-- ============================================
CREATE TABLE IF NOT EXISTS contract_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  settlement_unit text,
  target_quantity numeric(15,2),
  cadence text,
  generation_mode text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cycle_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_program_id uuid NOT NULL REFERENCES contract_programs(id),
  cadence text,
  target_quantity numeric(15,2),
  generation_mode text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_program_id uuid NOT NULL REFERENCES contract_programs(id),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft'::project_status,
  quantity_tranche numeric(15,2),
  settlement_unit text NOT NULL,
  target_quantity numeric(15,2) NOT NULL,
  started_at timestamptz,
  closed_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  export_country_code character(2) REFERENCES countries(country_code)
);

-- project_roles table (referenced by project_members in Production)
CREATE TABLE IF NOT EXISTS project_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- project_members (references project_roles, users, role_catalog)
CREATE TABLE IF NOT EXISTS project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role_id uuid REFERENCES role_catalog(id),
  project_role_id uuid REFERENCES project_roles(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- ============================================
-- Operational tables (slice)
-- ============================================
CREATE TABLE IF NOT EXISTS transport_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  origin text NOT NULL,
  destination text NOT NULL,
  distance_km numeric(10,2),
  status text NOT NULL DEFAULT 'planned'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS truck_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  transport_leg_id uuid NOT NULL REFERENCES transport_legs(id),
  pks_site_id uuid REFERENCES pks_sites(id),
  vehicle_id uuid REFERENCES service_vendors(id),
  driver_name text,
  license_plate text NOT NULL,
  departure_time timestamptz,
  arrival_time timestamptz,
  status text NOT NULL DEFAULT 'scheduled'::text,
  gps_latitude numeric(9,6),
  gps_longitude numeric(10,6),
  gps_accuracy numeric(5,2),
  checker_id uuid REFERENCES users(id),
  departure_checkpoint_id uuid,
  arrival_checkpoint_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_trip_id uuid NOT NULL REFERENCES truck_trips(id),
  event_type text NOT NULL,
  checker_id uuid NOT NULL REFERENCES users(id),
  latitude numeric(9,6) NOT NULL,
  longitude numeric(10,6) NOT NULL,
  gps_accuracy numeric(5,2) NOT NULL,
  source text NOT NULL DEFAULT 'checker_device'::text,
  capture_timestamp timestamptz NOT NULL,
  server_received_timestamp timestamptz NOT NULL DEFAULT now(),
  qr_scanned boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'verified'::text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracking_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_event_id uuid NOT NULL REFERENCES tracking_events(id),
  object_key text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  file_size numeric(10,2) NOT NULL,
  sha256_checksum text NOT NULL,
  supersedes_document_id uuid REFERENCES tracking_evidence(id),
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  pks_site_id uuid REFERENCES pks_sites(id),
  quantity numeric(15,2) NOT NULL,
  unit text NOT NULL DEFAULT 'MT'::text,
  location text,
  status text NOT NULL DEFAULT 'incoming'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouse_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  truck_trip_id uuid REFERENCES truck_trips(id),
  lot_id uuid REFERENCES inventory_lots(id),
  received_quantity numeric(15,2) NOT NULL,
  unit text NOT NULL,
  condition_status text,
  exception_reason text,
  weighbridge_ticket_key text,
  checker_id uuid NOT NULL REFERENCES users(id),
  gps_latitude numeric(9,6),
  gps_longitude numeric(10,6),
  gps_accuracy numeric(5,2),
  check_timestamp timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  lot_id uuid NOT NULL REFERENCES inventory_lots(id),
  warehouse_receipt_id uuid REFERENCES warehouse_receipts(id),
  movement_type text NOT NULL,
  quantity numeric(15,2) NOT NULL,
  unit text NOT NULL,
  source_location text,
  destination_location text,
  reason text,
  actor_id uuid NOT NULL REFERENCES users(id),
  timestamp timestamptz NOT NULL DEFAULT now(),
  reference_id uuid,
  reference_type text,
  status text NOT NULL DEFAULT 'posted'::text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- Helper functions (RLS)
-- ============================================
CREATE OR REPLACE FUNCTION pke_current_user_id() RETURNS uuid AS $$
  SELECT current_setting('app.current_user_id', true)::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION pke_is_platform_admin() RETURNS boolean AS $$
  SELECT current_setting('app.current_role', true) = 'admin';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION pke_can_view_user(target_user_id uuid) RETURNS boolean AS $$
  SELECT (target_user_id = pke_current_user_id()) OR pke_is_platform_admin();
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION pke_has_any_project_access() RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.user_id = pke_current_user_id() AND pm.is_active = true
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION pke_has_project_permission(project_id uuid, permission_code text) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members pm
    JOIN role_permissions rp ON rp.role_id = pm.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE pm.user_id = pke_current_user_id()
      AND pm.is_active = true
      AND (pm.project_id = project_id OR project_id IS NULL)
      AND p.code = permission_code
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION pke_has_truck_trip_permission(truck_trip_id uuid, permission_code text) RETURNS boolean AS $$
  SELECT pke_has_project_permission(
    (SELECT project_id FROM truck_trips WHERE id = truck_trip_id),
    permission_code
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION pke_has_tracking_event_permission(tracking_event_id uuid, permission_code text) RETURNS boolean AS $$
  SELECT pke_has_truck_trip_permission(
    (SELECT truck_trip_id FROM tracking_events WHERE id = tracking_event_id),
    permission_code
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================
-- Create runtime role (NOBYPASSRLS, non-superuser, can login)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime_secure') THEN
    CREATE ROLE app_runtime_secure LOGIN PASSWORD 'app_runtime_secure_test';
  END IF;
END $$;

-- Grant privileges to runtime role
GRANT USAGE ON SCHEMA public TO app_runtime_secure;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime_secure;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime_secure;

-- ============================================
-- Enable RLS on all slice tables
-- ============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE truck_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE pks_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycle_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================
-- projects
DROP POLICY IF EXISTS pke_projects_select ON projects;
DROP POLICY IF EXISTS pke_projects_update ON projects;
DROP POLICY IF EXISTS pke_projects_insert ON projects;
DROP POLICY IF EXISTS pke_projects_delete ON projects;
DROP POLICY IF EXISTS pke_admin_all_projects ON projects;
CREATE POLICY pke_projects_select ON projects FOR SELECT USING (pke_has_project_permission(id, 'project.view'));
CREATE POLICY pke_projects_update ON projects FOR UPDATE USING (pke_has_project_permission(id, 'project.update'));
CREATE POLICY pke_projects_insert ON projects FOR INSERT WITH CHECK (pke_has_project_permission(id, 'project.create'));
CREATE POLICY pke_projects_delete ON projects FOR DELETE USING (pke_has_project_permission(id, 'project.delete'));
CREATE POLICY pke_admin_all_projects ON projects FOR ALL USING (pke_is_platform_admin());

-- truck_trips
DROP POLICY IF EXISTS pke_truck_trips_select ON truck_trips;
DROP POLICY IF EXISTS pke_truck_trips_insert ON truck_trips;
DROP POLICY IF EXISTS pke_truck_trips_update ON truck_trips;
DROP POLICY IF EXISTS pke_truck_trips_delete ON truck_trips;
DROP POLICY IF EXISTS pke_admin_all_truck_trips ON truck_trips;
CREATE POLICY pke_truck_trips_select ON truck_trips FOR SELECT USING (pke_has_project_permission(project_id, 'logistics.view'));
CREATE POLICY pke_truck_trips_insert ON truck_trips FOR INSERT WITH CHECK (pke_has_project_permission(project_id, 'logistics.create'));
CREATE POLICY pke_truck_trips_update ON truck_trips FOR UPDATE USING (pke_has_project_permission(project_id, 'logistics.update'));
CREATE POLICY pke_truck_trips_delete ON truck_trips FOR DELETE USING (pke_has_project_permission(project_id, 'logistics.delete'));
CREATE POLICY pke_admin_all_truck_trips ON truck_trips FOR ALL USING (pke_is_platform_admin());

-- tracking_events
DROP POLICY IF EXISTS pke_tracking_events_select ON tracking_events;
DROP POLICY IF EXISTS pke_tracking_events_insert ON tracking_events;
DROP POLICY IF EXISTS pke_tracking_events_update ON tracking_events;
DROP POLICY IF EXISTS pke_tracking_events_delete ON tracking_events;
DROP POLICY IF EXISTS pke_admin_all_tracking_events ON tracking_events;
CREATE POLICY pke_tracking_events_select ON tracking_events FOR SELECT USING (pke_has_tracking_event_permission(id, 'logistics.view'));
CREATE POLICY pke_tracking_events_insert ON tracking_events FOR INSERT WITH CHECK (pke_has_truck_trip_permission(truck_trip_id, 'logistics.create'));
CREATE POLICY pke_tracking_events_update ON tracking_events FOR UPDATE USING (pke_has_tracking_event_permission(id, 'logistics.update'));
CREATE POLICY pke_tracking_events_delete ON tracking_events FOR DELETE USING (pke_has_tracking_event_permission(id, 'logistics.delete'));
CREATE POLICY pke_admin_all_tracking_events ON tracking_events FOR ALL USING (pke_is_platform_admin());

-- warehouse_receipts
DROP POLICY IF EXISTS pke_warehouse_receipts_select ON warehouse_receipts;
DROP POLICY IF EXISTS pke_warehouse_receipts_insert ON warehouse_receipts;
DROP POLICY IF EXISTS pke_warehouse_receipts_update ON warehouse_receipts;
DROP POLICY IF EXISTS pke_warehouse_receipts_delete ON warehouse_receipts;
DROP POLICY IF EXISTS pke_admin_all_warehouse_receipts ON warehouse_receipts;
CREATE POLICY pke_warehouse_receipts_select ON warehouse_receipts FOR SELECT USING (pke_has_project_permission(project_id, 'inventory.view'));
CREATE POLICY pke_warehouse_receipts_insert ON warehouse_receipts FOR INSERT WITH CHECK (pke_has_project_permission(project_id, 'inventory.create'));
CREATE POLICY pke_warehouse_receipts_update ON warehouse_receipts FOR UPDATE USING (pke_has_project_permission(project_id, 'inventory.update'));
CREATE POLICY pke_warehouse_receipts_delete ON warehouse_receipts FOR DELETE USING (pke_has_project_permission(project_id, 'inventory.delete'));
CREATE POLICY pke_admin_all_warehouse_receipts ON warehouse_receipts FOR ALL USING (pke_is_platform_admin());

-- inventory_lots
DROP POLICY IF EXISTS pke_inventory_lots_select ON inventory_lots;
DROP POLICY IF EXISTS pke_inventory_lots_insert ON inventory_lots;
DROP POLICY IF EXISTS pke_inventory_lots_update ON inventory_lots;
DROP POLICY IF EXISTS pke_inventory_lots_delete ON inventory_lots;
DROP POLICY IF EXISTS pke_admin_all_inventory_lots ON inventory_lots;
CREATE POLICY pke_inventory_lots_select ON inventory_lots FOR SELECT USING (pke_has_project_permission(project_id, 'inventory.view'));
CREATE POLICY pke_inventory_lots_insert ON inventory_lots FOR INSERT WITH CHECK (pke_has_project_permission(project_id, 'inventory.create'));
CREATE POLICY pke_inventory_lots_update ON inventory_lots FOR UPDATE USING (pke_has_project_permission(project_id, 'inventory.update'));
CREATE POLICY pke_inventory_lots_delete ON inventory_lots FOR DELETE USING (pke_has_project_permission(project_id, 'inventory.delete'));
CREATE POLICY pke_admin_all_inventory_lots ON inventory_lots FOR ALL USING (pke_is_platform_admin());

-- inventory_movements
DROP POLICY IF EXISTS pke_inventory_movements_select ON inventory_movements;
DROP POLICY IF EXISTS pke_inventory_movements_insert ON inventory_movements;
DROP POLICY IF EXISTS pke_inventory_movements_update ON inventory_movements;
DROP POLICY IF EXISTS pke_inventory_movements_delete ON inventory_movements;
DROP POLICY IF EXISTS pke_admin_all_inventory_movements ON inventory_movements;
CREATE POLICY pke_inventory_movements_select ON inventory_movements FOR SELECT USING (pke_has_project_permission(project_id, 'inventory.view'));
CREATE POLICY pke_inventory_movements_insert ON inventory_movements FOR INSERT WITH CHECK (pke_has_project_permission(project_id, 'inventory.create'));
CREATE POLICY pke_inventory_movements_update ON inventory_movements FOR UPDATE USING (pke_has_project_permission(project_id, 'inventory.update'));
CREATE POLICY pke_inventory_movements_delete ON inventory_movements FOR DELETE USING (pke_has_project_permission(project_id, 'inventory.delete'));
CREATE POLICY pke_admin_all_inventory_movements ON inventory_movements FOR ALL USING (pke_is_platform_admin());

-- transport_legs
DROP POLICY IF EXISTS pke_transport_legs_select ON transport_legs;
DROP POLICY IF EXISTS pke_transport_legs_insert ON transport_legs;
DROP POLICY IF EXISTS pke_transport_legs_update ON transport_legs;
DROP POLICY IF EXISTS pke_transport_legs_delete ON transport_legs;
DROP POLICY IF EXISTS pke_admin_all_transport_legs ON transport_legs;
CREATE POLICY pke_transport_legs_select ON transport_legs FOR SELECT USING (pke_has_project_permission(project_id, 'logistics.view'));
CREATE POLICY pke_transport_legs_insert ON transport_legs FOR INSERT WITH CHECK (pke_has_project_permission(project_id, 'logistics.create'));
CREATE POLICY pke_transport_legs_update ON transport_legs FOR UPDATE USING (pke_has_project_permission(project_id, 'logistics.update'));
CREATE POLICY pke_transport_legs_delete ON transport_legs FOR DELETE USING (pke_has_project_permission(project_id, 'logistics.delete'));
CREATE POLICY pke_admin_all_transport_legs ON transport_legs FOR ALL USING (pke_is_platform_admin());

-- users
DROP POLICY IF EXISTS pke_users_select ON users;
DROP POLICY IF EXISTS pke_admin_all_users ON users;
CREATE POLICY pke_users_select ON users FOR SELECT USING (pke_can_view_user(id));
CREATE POLICY pke_admin_all_users ON users FOR ALL USING (pke_is_platform_admin());

-- Other tables - admin only + member read where appropriate
DROP POLICY IF EXISTS pke_admin_all_role_catalog ON role_catalog;
DROP POLICY IF EXISTS pke_role_catalog_member_read ON role_catalog;
DROP POLICY IF EXISTS pke_admin_all_permissions ON permissions;
DROP POLICY IF EXISTS pke_permissions_member_read ON permissions;
DROP POLICY IF EXISTS pke_admin_all_role_permissions ON role_permissions;
DROP POLICY IF EXISTS pke_admin_all_contract_programs ON contract_programs;
DROP POLICY IF EXISTS pke_admin_all_cycle_policies ON cycle_policies;
DROP POLICY IF EXISTS pke_admin_all_service_vendors ON service_vendors;
DROP POLICY IF EXISTS pke_admin_all_countries ON countries;
DROP POLICY IF EXISTS pke_admin_all_pks_sites ON pks_sites;
DROP POLICY IF EXISTS pke_pks_sites_member_read ON pks_sites;
DROP POLICY IF EXISTS pke_admin_all_warehouses ON warehouses;
DROP POLICY IF EXISTS pke_warehouses_member_read ON warehouses;
DROP POLICY IF EXISTS pke_admin_all_tracking_evidence ON tracking_evidence;
DROP POLICY IF EXISTS pke_admin_all_project_members ON project_members;
CREATE POLICY pke_admin_all_role_catalog ON role_catalog FOR ALL USING (pke_is_platform_admin());
CREATE POLICY pke_role_catalog_member_read ON role_catalog FOR SELECT USING (pke_has_any_project_access());
CREATE POLICY pke_admin_all_permissions ON permissions FOR ALL USING (pke_is_platform_admin());
CREATE POLICY pke_permissions_member_read ON permissions FOR SELECT USING (pke_has_any_project_access());
CREATE POLICY pke_admin_all_role_permissions ON role_permissions FOR ALL USING (pke_is_platform_admin());
CREATE POLICY pke_admin_all_contract_programs ON contract_programs FOR ALL USING (pke_is_platform_admin());
CREATE POLICY pke_admin_all_cycle_policies ON cycle_policies FOR ALL USING (pke_is_platform_admin());
CREATE POLICY pke_admin_all_service_vendors ON service_vendors FOR ALL USING (pke_is_platform_admin());
CREATE POLICY pke_admin_all_countries ON countries FOR ALL USING (pke_is_platform_admin());
CREATE POLICY pke_admin_all_pks_sites ON pks_sites FOR ALL USING (pke_is_platform_admin());
CREATE POLICY pke_pks_sites_member_read ON pks_sites FOR SELECT USING (pke_has_any_project_access());
CREATE POLICY pke_admin_all_warehouses ON warehouses FOR ALL USING (pke_is_platform_admin());
CREATE POLICY pke_warehouses_member_read ON warehouses FOR SELECT USING (pke_has_any_project_access());
CREATE POLICY pke_admin_all_tracking_evidence ON tracking_evidence FOR ALL USING (pke_is_platform_admin());
CREATE POLICY pke_admin_all_project_members ON project_members FOR ALL USING (pke_is_platform_admin());
-- Self-read policy for project_members
CREATE POLICY pke_project_members_self_select ON project_members
  FOR SELECT USING (user_id = pke_current_user_id());

-- ============================================
-- Test fixture data (synthetic, local test DB only)
-- ============================================

-- Countries
INSERT INTO countries (country_code, country_name) VALUES
  ('ID', 'Indonesia'),
  ('CN', 'China'),
  ('PK', 'Pakistan')
ON CONFLICT (country_code) DO NOTHING;

-- Service vendors
INSERT INTO service_vendors (name, code) VALUES
  ('Test Transporter A', 'TRANSPORTER_A'),
  ('Test Transporter B', 'TRANSPORTER_B')
ON CONFLICT (code) DO NOTHING;

-- PKS sites
INSERT INTO pks_sites (name, location, code, country_code) VALUES
  ('PKS Site A', 'Site A Location', 'PKS_A', 'ID'),
  ('PKS Site B', 'Site B Location', 'PKS_B', 'ID')
ON CONFLICT (code) DO NOTHING;

-- Contract programs
INSERT INTO contract_programs (name, description, settlement_unit, target_quantity, generation_mode, is_active) VALUES
  ('Contract Program A', 'Test program A', 'MT', 10000, 'scheduled_draft', true),
  ('Contract Program B', 'Test program B', 'MT', 20000, 'admin_manual', true)
ON CONFLICT (id) DO NOTHING;

-- Cycles
INSERT INTO cycle_policies (contract_program_id, cadence, target_quantity, generation_mode, is_active) VALUES
  ((SELECT id FROM contract_programs WHERE name = 'Contract Program A'), 'weekly', 5000, 'scheduled_draft', true),
  ((SELECT id FROM contract_programs WHERE name = 'Contract Program B'), 'monthly', 10000, 'admin_manual', true)
ON CONFLICT (id) DO NOTHING;

-- Roles
INSERT INTO role_catalog (name, description) VALUES
  ('admin', 'Platform Administrator'),
  ('field_manager', 'Field Manager'),
  ('checker', 'Field Checker'),
  ('viewer', 'Viewer')
ON CONFLICT (name) DO NOTHING;

-- Permissions
INSERT INTO permissions (name, code, description) VALUES
  ('Project View', 'project.view', 'View project details'),
  ('Project Update', 'project.update', 'Update project details'),
  ('Project Create', 'project.create', 'Create projects'),
  ('Logistics View', 'logistics.view', 'View logistics data'),
  ('Logistics Create', 'logistics.create', 'Create logistics records'),
  ('Logistics Update', 'logistics.update', 'Update logistics records'),
  ('Logistics Delete', 'logistics.delete', 'Delete logistics records'),
  ('Inventory View', 'inventory.view', 'View inventory data'),
  ('Inventory Create', 'inventory.create', 'Create inventory records'),
  ('Inventory Update', 'inventory.update', 'Update inventory data'),
  ('Inventory Delete', 'inventory.delete', 'Delete inventory data')
ON CONFLICT (code) DO NOTHING;

-- Role permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM role_catalog r, permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM role_catalog r, permissions p
WHERE r.name = 'field_manager' AND p.code IN ('project.view','logistics.view','logistics.create','inventory.view','inventory.create')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM role_catalog r, permissions p
WHERE r.name = 'checker' AND p.code IN ('logistics.view','logistics.create','inventory.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM role_catalog r, permissions p
WHERE r.name = 'viewer' AND p.code IN ('project.view','logistics.view','inventory.view')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Test users (synthetic, local test DB only)
INSERT INTO users (email, name, role, is_active, neon_auth_user_id) VALUES
  ('user-a@test.local', 'Test User A', 'field_manager', true, gen_random_uuid()),
  ('user-b@test.local', 'Test User B', 'field_manager', true, gen_random_uuid()),
  ('viewer-user@test.local', 'Test Viewer', 'viewer', true, gen_random_uuid()),
  ('admin-user@test.local', 'Test Admin', 'admin', true, gen_random_uuid())
ON CONFLICT (email) DO NOTHING;

-- Set neon_auth_user_id = id for test users so JWT sub matches
UPDATE users SET neon_auth_user_id = id;

-- Projects
INSERT INTO projects (contract_program_id, name, status, quantity_tranche, settlement_unit, target_quantity, export_country_code, is_active) VALUES
  ((SELECT id FROM contract_programs WHERE name = 'Contract Program A'), 'Project A', 'active', 5000, 'MT', 10000, 'ID', true),
  ((SELECT id FROM contract_programs WHERE name = 'Contract Program B'), 'Project B', 'active', 5000, 'MT', 10000, 'ID', true)
ON CONFLICT (id) DO NOTHING;

-- Project roles
INSERT INTO project_roles (project_id, name) VALUES
  ((SELECT id FROM projects WHERE name = 'Project A'), 'Project A Member'),
  ((SELECT id FROM projects WHERE name = 'Project B'), 'Project B Member')
ON CONFLICT (id) DO NOTHING;

-- Project members
INSERT INTO project_members (project_id, user_id, role_id, project_role_id) VALUES
  ((SELECT id FROM projects WHERE name = 'Project A'), (SELECT id FROM users WHERE email = 'user-a@test.local'),
   (SELECT id FROM role_catalog WHERE name = 'field_manager'),
   (SELECT id FROM project_roles WHERE name = 'Project A Member')),
  ((SELECT id FROM projects WHERE name = 'Project B'), (SELECT id FROM users WHERE email = 'user-b@test.local'),
   (SELECT id FROM role_catalog WHERE name = 'field_manager'),
   (SELECT id FROM project_roles WHERE name = 'Project B Member'))
ON CONFLICT (project_id, user_id) DO NOTHING;

-- Transport legs
INSERT INTO transport_legs (project_id, origin, destination, distance_km, status) VALUES
  ((SELECT id FROM projects WHERE name = 'Project A'), 'Port A', 'Warehouse A', 100, 'planned'),
  ((SELECT id FROM projects WHERE name = 'Project B'), 'Port B', 'Warehouse B', 150, 'planned')
ON CONFLICT (id) DO NOTHING;

-- Truck trips
INSERT INTO truck_trips (project_id, transport_leg_id, license_plate, driver_name, status) VALUES
  ((SELECT id FROM projects WHERE name = 'Project A'),
   (SELECT id FROM transport_legs WHERE origin = 'Port A'),
   'TEST-A-001', 'Driver A', 'scheduled'),
  ((SELECT id FROM projects WHERE name = 'Project B'),
   (SELECT id FROM transport_legs WHERE origin = 'Port B'),
   'TEST-B-001', 'Driver B', 'scheduled')
ON CONFLICT (id) DO NOTHING;

-- Warehouse receipts
INSERT INTO warehouse_receipts (project_id, truck_trip_id, received_quantity, unit, condition_status, checker_id, check_timestamp, status) VALUES
  ((SELECT id FROM projects WHERE name = 'Project A'),
   (SELECT id FROM truck_trips WHERE license_plate = 'TEST-A-001'),
   5000, 'MT', 'good', (SELECT id FROM users WHERE email = 'user-a@test.local'), now(), 'pending'),
  ((SELECT id FROM projects WHERE name = 'Project B'),
   (SELECT id FROM truck_trips WHERE license_plate = 'TEST-B-001'),
   3000, 'MT', 'good', (SELECT id FROM users WHERE email = 'user-b@test.local'), now(), 'pending')
ON CONFLICT (id) DO NOTHING;

-- Inventory lots
INSERT INTO inventory_lots (project_id, pks_site_id, quantity, unit, location, status) VALUES
  ((SELECT id FROM projects WHERE name = 'Project A'),
   (SELECT id FROM pks_sites WHERE code = 'PKS_A'),
   5000, 'MT', 'Zone A-1', 'incoming'),
  ((SELECT id FROM projects WHERE name = 'Project B'),
   (SELECT id FROM pks_sites WHERE code = 'PKS_B'),
   3000, 'MT', 'Zone B-1', 'incoming')
ON CONFLICT (id) DO NOTHING;

-- Inventory movements
INSERT INTO inventory_movements (project_id, lot_id, movement_type, quantity, unit, actor_id, reason, status) VALUES
  ((SELECT id FROM projects WHERE name = 'Project A'),
   (SELECT id FROM inventory_lots WHERE quantity = 5000),
   'receipt', 5000, 'MT', (SELECT id FROM users WHERE email = 'user-a@test.local'), 'Initial receipt', 'posted'),
  ((SELECT id FROM projects WHERE name = 'Project B'),
   (SELECT id FROM inventory_lots WHERE quantity = 3000),
   'receipt', 3000, 'MT', (SELECT id FROM users WHERE email = 'user-b@test.local'), 'Initial receipt', 'posted')
ON CONFLICT (id) DO NOTHING;

-- Tracking events
INSERT INTO tracking_events (truck_trip_id, event_type, checker_id, latitude, longitude, gps_accuracy, source, capture_timestamp, status, notes) VALUES
  ((SELECT id FROM truck_trips WHERE license_plate = 'TEST-A-001'),
   'departure', (SELECT id FROM users WHERE email = 'user-a@test.local'),
   -6.2088, 106.8456, 5.0, 'checker_device', now(), 'verified', 'Departure from Port A'),
  ((SELECT id FROM truck_trips WHERE license_plate = 'TEST-B-001'),
   'departure', (SELECT id FROM users WHERE email = 'user-b@test.local'),
   -6.1754, 106.8272, 5.0, 'checker_device', now(), 'verified', 'Departure from Port B')
ON CONFLICT (id) DO NOTHING;

SELECT 'Schema initialization complete' AS status;