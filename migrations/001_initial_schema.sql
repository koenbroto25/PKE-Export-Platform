-- Migration: 001_initial_schema
-- Phase 1: Application Foundation - Core schema setup

-- Enable UUID extension
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto"; END $$;

-- Create enum types
DO $$ BEGIN CREATE TYPE public."user_role" AS ENUM ('admin', 'pm', 'field_manager', 'procurement', 'checker', 'warehouse_manager', 'packing_supervisor', 'loading_manager', 'document_officer', 'finance', 'cashier', 'accounting', 'funder', 'buyer', 'supplier', 'transporter', 'external_provider'); END $$;
DO $$ BEGIN CREATE TYPE public."project_status" AS ENUM ('draft', 'active', 'partial', 'settled', 'closed'); END $$;
DO $$ BEGIN CREATE TYPE public."tracking_event_type" AS ENUM ('departure', 'checkpoint', 'arrival', 'weighbridge', 'receipt', 'exception'); END $$;
DO $$ BEGIN CREATE TYPE public."rab_category" AS ENUM ('fixed', 'variable', 'contingency', 'tax', 'overhead'); END $$;
DO $$ BEGIN CREATE TYPE public."fx_exposure_type" AS ENUM ('open', 'revalued', 'realized', 'unrealized'); END $$;

-- Table: users
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "name" text,
  "role" "user_role" NOT NULL DEFAULT 'viewer',
  "password_hash" text NOT NULL,
  "mfa_enabled" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_unique" UNIQUE ("email")
);

-- Table: role_catalog
CREATE TABLE IF NOT EXISTS "role_catalog" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "role_catalog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_catalog_name_unique" UNIQUE ("name")
);

-- Table: permissions
CREATE TABLE IF NOT EXISTS "permissions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "code" text NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "permissions_code_unique" UNIQUE ("code")
);

-- Table: role_permissions
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "role_id" uuid NOT NULL REFERENCES "role_catalog" ("id") ON DELETE CASCADE,
  "permission_id" uuid NOT NULL REFERENCES "permissions" ("id") ON DELETE CASCADE,
  "granted_by" uuid REFERENCES "users" ("id"),
  "granted_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_permissions_role_perm_unique" UNIQUE ("role_id", "permission_id")
);

-- Table: project_members
CREATE TABLE IF NOT EXISTS "project_members" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "role_id" uuid REFERENCES "role_catalog" ("id"),
  "joined_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "is_active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- Table: buyers
CREATE TABLE IF NOT EXISTS "buyers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "code" text UNIQUE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
);

-- Table: pks_sites
CREATE TABLE IF NOT EXISTS "pks_sites" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "location" text,
  "code" text UNIQUE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "pks_sites_pkey" PRIMARY KEY ("id")
);

-- Table: contracts
CREATE TABLE IF NOT EXISTS "contracts" (
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
);

-- Table: contract_programs
CREATE TABLE IF NOT EXISTS "contract_programs" (
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
);

-- Table: cycle_policies
CREATE TABLE IF NOT EXISTS "cycle_policies" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "contract_program_id" uuid NOT NULL REFERENCES "contract_programs" ("id") ON DELETE CASCADE,
  "cadence" text NOT NULL,
  "target_quantity" numeric(15, 2),
  "generation_mode" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "cycle_policies_pkey" PRIMARY KEY ("id")
);

-- Table: projects
CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "contract_program_id" uuid NOT NULL REFERENCES "contract_programs" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "status" "project_status" NOT NULL DEFAULT 'draft',
  "quantity_tranche" numeric(15, 2),
  "settlement_unit" text NOT NULL,
  "target_quantity" numeric(15, 2) NOT NULL,
  "status" "project_status" NOT NULL DEFAULT 'draft',
  "started_at" timestamp WITH TIME ZONE,
  "closed_at" timestamp WITH TIME ZONE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- Table: project_versions
CREATE TABLE IF NOT EXISTS "project_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "effective_date" timestamp WITH TIME ZONE,
  "changes_summary" text,
  "config_snapshot" jsonb,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "project_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_versions_project_version_unique" UNIQUE ("project_id", "version_number")
);

-- Table: project_change_requests
CREATE TABLE IF NOT EXISTS "project_change_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "change_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "approved_by" uuid REFERENCES "users" ("id"),
  "effective_date" timestamp WITH TIME ZONE,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "project_change_requests_pkey" PRIMARY KEY ("id")
);

-- Table: approval_events
CREATE TABLE IF NOT EXISTS "approval_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "action" text NOT NULL,
  "approved_by" uuid REFERENCES "users" ("id"),
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "approval_events_pkey" PRIMARY KEY ("id")
);

-- Table: warehouses
CREATE TABLE IF NOT EXISTS "warehouses" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "location" text,
  "code" text UNIQUE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- Table: ports
CREATE TABLE IF NOT EXISTS "ports" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "location" text,
  "code" text UNIQUE,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "ports_pkey" PRIMARY KEY ("id")
);

-- Table: vessels
CREATE TABLE IF NOT EXISTS "vessels" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "imo_number" text,
  "capacity" numeric(15, 2),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "vessels_pkey" PRIMARY KEY ("id")
);

-- Table: truck_trips
CREATE TABLE IF NOT EXISTS "truck_trips" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "trip_id" text NOT NULL UNIQUE,
  "pks_site_id" uuid REFERENCES "pks_sites" ("id"),
  "transporter" text,
  "driver_name" text,
  "plate_number" text,
  "origin" text,
  "destination" text,
  "quantity" numeric(15, 2),
  "departure_time" timestamp WITH TIME ZONE,
  "arrival_time" timestamp WITH TIME ZONE,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "truck_trips_pkey" PRIMARY KEY ("id")
);

-- Table: tracking_events
CREATE TABLE IF NOT EXISTS "tracking_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "truck_trip_id" uuid NOT NULL REFERENCES "truck_trips" ("id") ON DELETE CASCADE,
  "event_type" tracking_event_type NOT NULL,
  "description" text,
  "latitude" numeric(10, 6),
  "longitude" numeric(10, 6),
  "accuracy" numeric(5, 2),
  "server_timestamp" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "checker_id" uuid REFERENCES "users" ("id"),
  "evidence_url" text,
  "notes" text,
  CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- Table: inventory_lots
CREATE TABLE IF NOT EXISTS "inventory_lots" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "pks_site_id" uuid REFERENCES "pks_sites" ("id"),
  "quantity" numeric(15, 2) NOT NULL,
  "unit" text NOT NULL DEFAULT 'MT',
  "location" text,
  "status" text NOT NULL DEFAULT 'incoming',
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id")
);

-- Table: packing_batches
CREATE TABLE IF NOT EXISTS "packing_batches" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "lot_id" uuid REFERENCES "inventory_lots" ("id") ON DELETE SET NULL,
  "quantity" numeric(15, 2) NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "packing_batches_pkey" PRIMARY KEY ("id")
);

-- Table: loading_operations
CREATE TABLE IF NOT EXISTS "loading_operations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "vessel_id" uuid REFERENCES "vessels" ("id"),
  "port_id" uuid REFERENCES "ports" ("id"),
  "quantity" numeric(15, 2) NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "started_at" timestamp WITH TIME ZONE,
  "completed_at" timestamp WITH TIME ZONE,
  CONSTRAINT "loading_operations_pkey" PRIMARY KEY ("id")
);

-- Table: voyages
CREATE TABLE IF NOT EXISTS "voyages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "vessel_id" uuid REFERENCES "vessels" ("id"),
  "port_id" uuid REFERENCES "ports" ("id"),
  "start_date" timestamp WITH TIME ZONE,
  "end_date" timestamp WITH TIME ZONE,
  "status" text NOT NULL DEFAULT 'planned',
  CONSTRAINT "voyages_pkey" PRIMARY KEY ("id")
);

-- Table: shipments
CREATE TABLE IF NOT EXISTS "shipments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "voyage_id" uuid REFERENCES "voyages" ("id"),
  "pks_site_id" uuid REFERENCES "pks_sites" ("id"),
  "quantity" numeric(15, 2) NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- Table: fx_rates
CREATE TABLE IF NOT EXISTS "fx_rates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "from_currency" text NOT NULL,
  "to_currency" text NOT NULL,
  "rate" numeric(15, 6) NOT NULL,
  "rate_type" text NOT NULL DEFAULT 'reference',
  "source" text,
  "effective_date" timestamp WITH TIME ZONE NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- Table: rab
CREATE TABLE IF NOT EXISTS "rab" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "amount" numeric(18, 2) NOT NULL,
  "category" "rab_category" NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "rab_pkey" PRIMARY KEY ("id")
);

-- Table: fx_exposure
CREATE TABLE IF NOT EXISTS "fx_exposure" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "amount_idr" numeric(18, 2) NOT NULL,
  "amount_fx" numeric(15, 6) NOT NULL,
  "fx_rate" numeric(15, 6) NOT NULL,
  "exposure_type" "fx_exposure_type" NOT NULL DEFAULT 'open',
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "fx_exposure_pkey" PRIMARY KEY ("id")
);