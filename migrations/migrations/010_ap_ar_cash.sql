-- Migration: 010_ap_ar_cash
-- Phase 10: AP/AR Invoices & Cash Management (Part 1: AP Invoices & AR Invoices)

-- Enable UUID extension (idempotent)
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto"; END $$;

-- ============================================
-- AP Invoices
-- ============================================
CREATE TABLE IF NOT EXISTS "ap_invoices" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "supplier_id" uuid NOT NULL REFERENCES "vendors" ("id"),
  "invoice_number" text NOT NULL,
  "invoice_date" timestamp WITH TIME ZONE NOT NULL,
  "due_date" timestamp WITH TIME ZONE,
  "currency_id" uuid NOT NULL REFERENCES "currencies" ("id"),
  "invoice_amount" numeric(18, 2) NOT NULL,
  "tax_amount" numeric(15, 2) DEFAULT 0,
  "total_amount" numeric(18, 2) NOT NULL,
  "project_id" uuid REFERENCES "projects" ("id"),
  "related_cost_obligation_id" uuid REFERENCES "cost_obligations" ("id"),
  "related_payment_obligation_id" uuid REFERENCES "payment_obligations" ("id"),
  "verification_status" text NOT NULL DEFAULT 'pending', -- pending, verified, disputed
  "three_way_match" boolean DEFAULT false,
  "purchase_order_id" uuid,
  "goods_receipt_id" uuid,
  "dispute_reason" text,
  "credit_note_ref" text,
  "debit_note_ref" text,
  "payment_allocation_id" uuid,
  "paid_amount" numeric(18, 2) DEFAULT 0,
  "outstanding_amount" numeric(18, 2) NOT NULL,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "ap_invoices_pkey" PRIMARY KEY ("id")
);

-- Index for AP invoice queries
CREATE INDEX IF NOT EXISTS "idx_ap_invoices_supplier_id" ON "ap_invoices" ("supplier_id");
CREATE INDEX IF NOT EXISTS "idx_ap_invoices_project_id" ON "ap_invoices" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_ap_invoices_verification_status" ON "ap_invoices" ("verification_status");
CREATE INDEX IF NOT EXISTS "idx_ap_invoices_outstanding" ON "ap_invoices" ("outstanding_amount");

-- ============================================
-- AR Invoices
-- ============================================
CREATE TABLE IF NOT EXISTS "ar_invoices" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "buyer_id" uuid NOT NULL REFERENCES "users" ("id"),
  "invoice_number" text NOT NULL,
  "invoice_date" timestamp WITH TIME ZONE NOT NULL,
  "due_date" timestamp WITH TIME ZONE,
  "currency_id" uuid NOT NULL REFERENCES "currencies" ("id"),
  "invoice_amount" numeric(18, 2) NOT NULL,
  "accepted_quantity" numeric(15, 2),
  "unit" text,
  "selling_price" numeric(15, 2),
  "total_amount" numeric(18, 2) NOT NULL,
  "project_id" uuid REFERENCES "projects" ("id"),
  "related_shipment_id" uuid REFERENCES "shipments" ("id"),
  "approval_status" text NOT NULL DEFAULT 'pending',
  "settlement_status" text NOT NULL DEFAULT 'open', -- open, partial, settled
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "ar_invoices_pkey" PRIMARY KEY ("id")
);

-- Index for AR invoice queries
CREATE INDEX IF NOT EXISTS "idx_ar_invoices_buyer_id" ON "ar_invoices" ("buyer_id");
CREATE INDEX IF NOT EXISTS "idx_ar_invoices_project_id" ON "ar_invoices" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_ar_invoices_settlement_status" ON "ar_invoices" ("settlement_status");