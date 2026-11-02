-- Migration: 002_phase2_business_foundations
-- Phase 2: Core Business & Access - Master data and contract programs

-- Buyers table (if not already exists from Phase 1)
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "buyers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "code" text UNIQUE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
); END $$;

-- Supplier/PKS sites table (if not already exists)
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "pks_sites" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "location" text,
  "code" text UNIQUE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "pks_sites_pkey" PRIMARY KEY ("id")
); END $$;

-- Contracts table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "contracts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "buyer_id" uuid NOT NULL REFERENCES "buyers" ("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "start_date" timestamp WITH TIME ZONE NOT NULL,
  "end_date" timestamp WITH TIME ZONE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
); END $$;

-- Contract Programs table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "contract_programs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text,
  "buyer_id" uuid REFERENCES "buyers" ("id") ON DELETE SET NULL,
  "contract_id" uuid REFERENCES "contracts" ("id") ON DELETE SET NULL,
  "settlement_unit" text NOT NULL,
  "target_quantity" numeric(15, 2) NOT NULL,
  "cadence" text NOT NULL,
  "generation_mode" text NOT NULL DEFAULT 'scheduled_draft',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "contract_programs_pkey" PRIMARY KEY ("id")
); END $$;

-- Cycle Policies table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "cycle_policies" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "contract_program_id" uuid NOT NULL REFERENCES "contract_programs" ("id") ON DELETE CASCADE,
  "cadence" text NOT NULL,
  "target_quantity" numeric(15, 2),
  "generation_mode" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "cycle_policies_pkey" PRIMARY KEY ("id")
); END $$;

-- Role Catalog table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "role_catalog" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "role_catalog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_catalog_name_unique" UNIQUE ("name")
); END $$;

-- Permissions table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "permissions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "code" text NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "permissions_code_unique" UNIQUE ("code")
); END $$;

-- Role Permissions junction table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "role_permissions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "role_id" uuid NOT NULL REFERENCES "role_catalog" ("id") ON DELETE CASCADE,
  "permission_id" uuid NOT NULL REFERENCES "permissions" ("id") ON DELETE CASCADE,
  "granted_by" uuid REFERENCES "users" ("id"),
  "granted_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_permissions_role_perm_unique" UNIQUE ("role_id", "permission_id")
); END $$;

-- Project Members table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "project_members" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "role_id" uuid REFERENCES "role_catalog" ("id"),
  "joined_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "is_active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
); END $$;

-- Buyer Parties/Importers table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "buyer_parties" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "buyer_id" uuid NOT NULL REFERENCES "buyers" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "role" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "buyer_parties_pkey" PRIMARY KEY ("id")
); END $$;

-- Service Vendors table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "service_vendors" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "code" text UNIQUE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "service_vendors_pkey" PRIMARY KEY ("id")
); END $$;

-- Project Templates table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "project_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text,
  "contract_program_id" uuid REFERENCES "contract_programs" ("id") ON DELETE SET NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "project_templates_pkey" PRIMARY KEY ("id")
); END $$;

-- Project Template Versions table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "project_template_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_template_id" uuid NOT NULL REFERENCES "project_templates" ("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "status" text NOT NULL DEFAULT "draft",
  "config_snapshot" jsonb,
  "effective_date" timestamp WITH TIME ZONE,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "project_template_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_template_versions_template_version_unique" UNIQUE ("project_template_id", "version_number")
); END $$;

-- Approval Events table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "approval_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "action" text NOT NULL,
  "approved_by" uuid REFERENCES "users" ("id"),
  "status" text NOT NULL DEFAULT "pending",
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "approval_events_pkey" PRIMARY KEY ("id")
); END $$;

-- Admin Action Queue table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "admin_action_queue" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "action_type" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "details" jsonb,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "resolved_at" timestamp WITH TIME ZONE,
  "resolved_by" uuid REFERENCES "users" ("id"),
  "is_resolved" boolean NOT NULL DEFAULT false,
  CONSTRAINT "admin_action_queue_pkey" PRIMARY KEY ("id")
); END $$;

-- Company Settings table
DO $$ BEGIN CREATE TABLE IF NOT EXISTS "company_settings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "functional_currency" text NOT NULL DEFAULT "IDR",
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
); END $$;

-- Insert default roles and permissions
DO $$ BEGIN
  INSERT INTO "role_catalog" ("name", "description", "is_active") VALUES 
    ('admin', 'Application Administrator', true),
    ('pm', 'Project Manager', true),
    ('checker', 'Truck Checker', true),
    ('warehouse', 'Warehouse Manager', true),
    ('finance', 'Finance', true),
    ('buyer', 'Buyer', true),
    ('supplier', 'Supplier', true);
END $$;

DO $$ BEGIN
  INSERT INTO "permissions" ("name", "code", "description", "is_active") VALUES
  -- Admin permissions
  ('View All', 'view_all', 'View all data and reports', true),
  ('Manage Contract Programs', 'manage_contract_programs', 'Manage contract programs', true),
  ('Manage Projects', 'manage_projects', 'Manage projects', true),
  ('Manage Users', 'manage_users', 'Manage users and roles', true),
  ('View Financial', 'view_financial', 'View financial data', true),
  ('Manage Finance', 'manage_finance', 'Manage finance operations', true),
  -- PM permissions
  ('View Assigned Projects', 'view_assigned_projects', 'View assigned projects', true),
  ('Create Projects', 'create_projects', 'Create new projects', true),
  ('Edit Projects', 'edit_projects', 'Edit projects', true),
  -- Checker permissions
  ('Record Truck Trips', 'record_truck_trips', 'Record truck departure/arrival', true),
  ('Verify Checkpoints', 'verify_checkpoints', 'Verify checkpoint evidence', true),
  -- Warehouse permissions
  ('Manage Inventory', 'manage_inventory', 'Manage inventory lots', true),
  ('Record Packing', 'record_packing', 'Record packing batches', true),
  -- Finance permissions
  ('View RAB', 'view_rab', 'View RAB and budgets', true),
  ('Manage RAB', 'manage_rab', 'Manage RAB and cost allocations', true),
  ('View FX', 'view_fx', 'View FX rates and exposure', true),
  ('Manage FX', 'manage_fx', 'Manage FX rates and revaluation', true),
  -- Buyer permissions
  ('View Own Projects', 'view_own_projects', 'View own projects', true),
  ('View Published Documents', 'view_published_docs', 'View published documents', true),
  -- Supplier permissions
  ('View Own Contracts', 'view_own_contracts', 'View own contracts', true);
END $$;
END $$;