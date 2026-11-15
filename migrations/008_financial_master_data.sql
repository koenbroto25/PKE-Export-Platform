-- Migration: 008_financial_master_data
-- Phase 8: Financial Master Data

-- Enable UUID extension (idempotent)
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto"; END $$;

-- ============================================
-- Cost Categories
-- ============================================
CREATE TABLE IF NOT EXISTS "cost_categories" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "subcategory" text,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "cost_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cost_categories_name_unique" UNIQUE ("name")
);

-- Index for project-based queries
CREATE INDEX IF NOT EXISTS "idx_cost_categories_active" ON "cost_categories" ("is_active");

-- ============================================
-- Vendors/Suppliers Reference
-- ============================================
CREATE TABLE IF NOT EXISTS "vendors" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "code" text UNIQUE,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "vendors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vendors_code_unique" UNIQUE ("code")
);

-- Index for vendor queries
CREATE INDEX IF NOT EXISTS "idx_vendors_active" ON "vendors" ("is_active");

-- ============================================
-- Payment Methods
-- ============================================
CREATE TABLE IF NOT EXISTS "payment_methods" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "code" text UNIQUE,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_methods_code_unique" UNIQUE ("code")
);

-- Index for payment method queries
CREATE INDEX IF NOT EXISTS "idx_payment_methods_active" ON "payment_methods" ("is_active");

-- ============================================
-- Currencies
-- ============================================
CREATE TABLE IF NOT EXISTS "currencies" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" text NOT NULL,
  "name" text NOT NULL,
  "is_functional" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "currencies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "currencies_code_unique" UNIQUE ("code")
);

-- Index for currency queries
CREATE INDEX IF NOT EXISTS "idx_currencies_functional" ON "currencies" ("is_functional");

-- ============================================
-- Chart of Accounts
-- ============================================
CREATE TABLE IF NOT EXISTS "chart_of_accounts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "parent_id" uuid REFERENCES "chart_of_accounts" ("id") ON DELETE SET NULL,
  "account_type" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chart_of_accounts_code_unique" UNIQUE ("code")
);

-- Index for account queries
CREATE INDEX IF NOT EXISTS "idx_chart_of_accounts_active" ON "chart_of_accounts" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_chart_of_accounts_parent" ON "chart_of_accounts" ("parent_id");