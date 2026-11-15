-- Migration: 009_cost_obligations_and_payment
-- Phase 9: Cost Obligations & Payment Obligations

-- Enable UUID extension (idempotent)
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto"; END $$;

-- ============================================
-- Cost Obligations
-- ============================================
CREATE TABLE IF NOT EXISTS "cost_obligations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "version" text NOT NULL DEFAULT '1.0',
  "cost_category" text NOT NULL,
  "cost_subcategory" text,
  "vendor_id" uuid REFERENCES "vendors" ("id"),
  "description" text NOT NULL,
  "basis" text NOT NULL, -- per_trip, per_ton, per_kilometer, per_shift, per_hour, per_package, fixed_amount
  "quantity" numeric(15, 2) NOT NULL,
  "unit" text NOT NULL,
  "unit_price" numeric(15, 2) NOT NULL,
  "currency_id" uuid NOT NULL REFERENCES "currencies" ("id"),
  "exchange_rate" numeric(15, 6) DEFAULT 1,
  "estimated_total" numeric(18, 2) NOT NULL,
  "basis_description" text,
  "assumptions" text,
  "quotation_ref" text,
  "planned_date" timestamp WITH TIME ZONE,
  "responsible_role" text,
  "approval_status" text NOT NULL DEFAULT 'draft',
  "cash_classification" text NOT NULL DEFAULT 'cash_operational',
  "cash_required_before" timestamp WITH TIME ZONE,
  "cash_gap_alert" numeric(18, 2),
  "created_by" uuid REFERENCES "users" ("id"),
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "cost_obligations_pkey" PRIMARY KEY ("id")
);

-- Index for cost obligation queries
CREATE INDEX IF NOT EXISTS "idx_cost_obligations_project_id" ON "cost_obligations" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_cost_obligations_approval_status" ON "cost_obligations" ("approval_status");
CREATE INDEX IF NOT EXISTS "idx_cost_obligations_cash_classification" ON "cost_obligations" ("cash_classification");

-- ============================================
-- Payment Obligations
-- ============================================
CREATE TABLE IF NOT EXISTS "payment_obligations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "cost_obligation_id" uuid REFERENCES "cost_obligations" ("id"),
  "payee" text NOT NULL,
  "amount" numeric(18, 2) NOT NULL,
  "currency_id" uuid NOT NULL REFERENCES "currencies" ("id"),
  "basis" text NOT NULL, -- per_trip, per_ton, per_kilometer, per_shift, per_hour, per_package, fixed_amount
  "payment_method_id" uuid REFERENCES "payment_methods" ("id"),
  "payment_trigger_event" text,
  "due_date" timestamp WITH TIME ZONE,
  "required_date" timestamp WITH TIME ZONE,
  "cash_classification" text NOT NULL DEFAULT 'cash_operational',
  "approval_status" text NOT NULL DEFAULT 'draft',
  "source_agreement" text,
  "evidence_requirement" text,
  "responsible_person" text,
  "payment_status" text NOT NULL DEFAULT 'draft',
  "source_event_id" uuid,
  "source_event_type" text, -- e.g., "warehouse_receipt", "truck_trip"
  "created_by" uuid REFERENCES "users" ("id"),
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "payment_obligations_pkey" PRIMARY KEY ("id")
);

-- Index for payment obligation queries
CREATE INDEX IF NOT EXISTS "idx_payment_obligations_project_id" ON "payment_obligations" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_payment_obligations_approval_status" ON "payment_obligations" ("approval_status");
CREATE INDEX IF NOT EXISTS "idx_payment_obligations_payment_status" ON "payment_obligations" ("payment_status");
CREATE INDEX IF NOT EXISTS "idx_payment_obligations_cash_classification" ON "payment_obligations" ("cash_classification");