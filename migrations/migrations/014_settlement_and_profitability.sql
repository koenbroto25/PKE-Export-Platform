-- Migration: 014_settlement_and_profitability
-- Phase 14: Settlement Checklist & Project Profitability

-- Enable UUID extension (idempotent)
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto"; END $$;

-- ============================================
-- Settlement Checklist Items
-- ============================================
CREATE TABLE IF NOT EXISTS "settlement_checklist_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id"),
  "checklist_type" text NOT NULL,
  "is_completed" boolean NOT NULL DEFAULT false,
  "completed_by" uuid REFERENCES "users" ("id"),
  "completed_at" timestamp WITH TIME ZONE,
  "notes" text,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "settlement_checklist_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settlement_checklist_project_type_unique" UNIQUE ("project_id", "checklist_type")
);

-- Index for settlement checklist queries
CREATE INDEX IF NOT EXISTS "idx_settlement_checklist_project_id" ON "settlement_checklist_items" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_settlement_checklist_type" ON "settlement_checklist_items" ("checklist_type");

-- ============================================
-- Project Profitability
-- ============================================
CREATE TABLE IF NOT EXISTS "project_profitability" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id"),
  "snapshot_date" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Revenue
  "contract_revenue" numeric(18, 2) DEFAULT 0,
  "accepted_revenue" numeric(18, 2) DEFAULT 0,
  
  -- Costs
  "approved_budget" numeric(18, 2) DEFAULT 0,
  "procurement_cost" numeric(18, 2) DEFAULT 0,
  "operational_cost" numeric(18, 2) DEFAULT 0,
  "logistics_cost" numeric(18, 2) DEFAULT 0,
  "port_handling_cost" numeric(18, 2) DEFAULT 0,
  "financing_cost" numeric(18, 2) DEFAULT 0,
  "other_cost" numeric(18, 2) DEFAULT 0,
  "accrued_expenses" numeric(18, 2) DEFAULT 0,
  
  -- Payables & Receivables
  "accounts_payable" numeric(18, 2) DEFAULT 0,
  "accounts_receivable" numeric(18, 2) DEFAULT 0,
  "amount_paid" numeric(18, 2) DEFAULT 0,
  "outstanding_payment" numeric(18, 2) DEFAULT 0,
  
  -- Margin
  "realized_margin" numeric(18, 2) DEFAULT 0,
  "forecast_margin" numeric(18, 2) DEFAULT 0,
  
  -- FX
  "fx_exposure" numeric(18, 2) DEFAULT 0,
  
  -- Working capital
  "working_capital_requirement" numeric(18, 2) DEFAULT 0,
  
  -- Realized vs Forecast flag
  "is_realized" boolean NOT NULL DEFAULT false,
  
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "project_profitability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_profitability_project_id_unique" UNIQUE ("project_id")
);

-- Index for project profitability queries
CREATE INDEX IF NOT EXISTS "idx_project_profitability_project_id" ON "project_profitability" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_profitability_is_realized" ON "project_profitability" ("is_realized");