-- Migration: 012_accounting_ledger_and_fx
-- Phase 12: Double-Entry Accounting Ledger (Part 1: Journal Entries & Lines)

-- Enable UUID extension (idempotent)
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto"; END $$;

-- ============================================
-- Journal Entries
-- ============================================
CREATE TABLE IF NOT EXISTS "journal_entries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects" ("id"),
  "fiscal_period_id" uuid,
  "entry_type" text NOT NULL,
  "reference_id" uuid,
  "reference_type" text,
  "description" text NOT NULL,
  "entry_date" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "posted_at" timestamp WITH TIME ZONE,
  "status" text NOT NULL DEFAULT 'draft', -- draft, approved, posted
  "posted_by" uuid REFERENCES "users" ("id"),
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- Index for journal entry queries
CREATE INDEX IF NOT EXISTS "idx_journal_entries_project_id" ON "journal_entries" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_journal_entries_fiscal_period_id" ON "journal_entries" ("fiscal_period_id");
CREATE INDEX IF NOT EXISTS "idx_journal_entries_status" ON "journal_entries" ("status");

-- ============================================
-- Journal Lines - must balance: total debit = total credit
-- ============================================
CREATE TABLE IF NOT EXISTS "journal_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "journal_entry_id" uuid NOT NULL REFERENCES "journal_entries" ("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "chart_of_accounts" ("id"),
  "debit" numeric(18, 2) DEFAULT 0, -- in functional currency
  "credit" numeric(18, 2) DEFAULT 0, -- in functional currency
  "description" text,
  "line_order" integer NOT NULL, -- urutan baris jurnal
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- Index for journal line queries
CREATE INDEX IF NOT EXISTS "idx_journal_lines_entry_id" ON "journal_lines" ("journal_entry_id");
CREATE INDEX IF NOT EXISTS "idx_journal_lines_account_id" ON "journal_lines" ("account_id");