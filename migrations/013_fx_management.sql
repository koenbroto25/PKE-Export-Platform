-- Migration: 013_fx_management
-- Phase 13: FX Management

-- Enable UUID extension (idempotent)
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto"; END $$;

-- ============================================
-- FX Rates
-- ============================================
DROP TABLE IF EXISTS "fx_rates" CASCADE;
CREATE TABLE "fx_rates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "from_currency_id" uuid NOT NULL REFERENCES "currencies" ("id"),
  "to_currency_id" uuid NOT NULL REFERENCES "currencies" ("id"),
  "rate" numeric(15, 6) NOT NULL,
  "rate_type" text NOT NULL, -- contract_baseline, external_reference, actual_execution, accounting_valuation
  "rate_date" timestamp WITH TIME ZONE NOT NULL,
  "rate_source" text, -- e.g., "bank", "BI JISDOR", "external_provider", "manual_entry"
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fx_rates_from_to_unique" UNIQUE ("from_currency_id", "to_currency_id", "rate_type", "rate_date")
);

-- Index for FX rate queries
CREATE INDEX IF NOT EXISTS "idx_fx_rates_from_to" ON "fx_rates" ("from_currency_id", "to_currency_id");
CREATE INDEX IF NOT EXISTS "idx_fx_rates_rate_type" ON "fx_rates" ("rate_type");
CREATE INDEX IF NOT EXISTS "idx_fx_rates_rate_date" ON "fx_rates" ("rate_date");

-- ============================================
-- FX Exposures
-- ============================================
CREATE TABLE IF NOT EXISTS "fx_exposures" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects" ("id"),
  "exposure_type" text NOT NULL, -- net_receivable, net_payable, open_position
  "original_currency_id" uuid NOT NULL REFERENCES "currencies" ("id"),
  "original_amount" numeric(18, 2) NOT NULL,
  "functional_amount" numeric(18, 2) NOT NULL,
  "fx_rate" numeric(15, 6) NOT NULL,
  "fx_date" timestamp WITH TIME ZONE NOT NULL,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "fx_exposures_pkey" PRIMARY KEY ("id")
);

-- Index for FX exposure queries
CREATE INDEX IF NOT EXISTS "idx_fx_exposures_project_id" ON "fx_exposures" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_fx_exposures_exposure_type" ON "fx_exposures" ("exposure_type");

-- ============================================
-- FX History
-- ============================================
DROP TABLE IF EXISTS "fx_history" CASCADE;
CREATE TABLE "fx_history" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "from_currency_id" uuid NOT NULL REFERENCES "currencies" ("id"),
  "to_currency_id" uuid NOT NULL REFERENCES "currencies" ("id"),
  "rate" numeric(15, 6) NOT NULL,
  "rate_type" text NOT NULL, -- contract_baseline, external_reference, actual_execution, manual
  "rate_date" timestamp WITH TIME ZONE NOT NULL,
  "triggered_by" text, -- "contract", "payment", "revaluation", "manual"
  "triggered_id" uuid, -- ID transaksi yang memicu
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "fx_history_pkey" PRIMARY KEY ("id")
);

-- Index for FX history queries
CREATE INDEX IF NOT EXISTS "idx_fx_history_from_to" ON "fx_history" ("from_currency_id", "to_currency_id");
CREATE INDEX IF NOT EXISTS "idx_fx_history_rate_type" ON "fx_history" ("rate_type");
CREATE INDEX IF NOT EXISTS "idx_fx_history_triggered_id" ON "fx_history" ("triggered_id");