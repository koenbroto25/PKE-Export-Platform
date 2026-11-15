-- Migration: 011_cash_advances_and_schedules
-- Phase 11: Cash Schedules & Cash Advances

-- Enable UUID extension (idempotent)
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto"; END $$;

-- ============================================
-- Cash Schedules
-- ============================================
CREATE TABLE IF NOT EXISTS "cash_schedules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "source_type" text NOT NULL, -- "payment_obligation", "cost_obligation", "advance"
  "source_id" uuid NOT NULL,
  "cash_classification" text NOT NULL, -- cash_critical, cash_operational, deferred_credit
  "amount" numeric(18, 2) NOT NULL,
  "currency_id" uuid NOT NULL REFERENCES "currencies" ("id"),
  "required_date" timestamp WITH TIME ZONE NOT NULL,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "cash_schedules_pkey" PRIMARY KEY ("id")
);

-- Index for cash schedule queries
CREATE INDEX IF NOT EXISTS "idx_cash_schedules_project_id" ON "cash_schedules" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_cash_schedules_classification" ON "cash_schedules" ("cash_classification");
CREATE INDEX IF NOT EXISTS "idx_cash_schedules_required_date" ON "cash_schedules" ("required_date");

-- ============================================
-- Cash Advances
-- ============================================
CREATE TABLE IF NOT EXISTS "cash_advances" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "requestor_id" uuid NOT NULL REFERENCES "users" ("id"),
  "amount" numeric(18, 2) NOT NULL,
  "currency_id" uuid NOT NULL REFERENCES "currencies" ("id"),
  "purpose" text NOT NULL,
  "advance_date" timestamp WITH TIME ZONE NOT NULL,
  "approval_status" text NOT NULL DEFAULT 'draft', -- draft, submitted, approved
  "disbursement_status" text NOT NULL DEFAULT 'pending', -- pending, disbursed, returned
  "evidence_requirement" text,
  "expense_submission_status" text NOT NULL DEFAULT 'pending', -- pending, submitted, approved
  "settled_status" text NOT NULL DEFAULT 'pending', -- pending, settled, refunded
  "remaining_balance" numeric(18, 2) DEFAULT 0,
  "refund_amount" numeric(18, 2) DEFAULT 0,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "cash_advances_pkey" PRIMARY KEY ("id")
);

-- Index for cash advance queries
CREATE INDEX IF NOT EXISTS "idx_cash_advances_project_id" ON "cash_advances" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_cash_advances_requestor_id" ON "cash_advances" ("requestor_id");
CREATE INDEX IF NOT EXISTS "idx_cash_advances_approval_status" ON "cash_advances" ("approval_status");