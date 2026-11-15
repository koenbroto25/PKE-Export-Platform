-- Migration: 005_inventory_and_receipts
-- Phase 5: Inventory & Warehouse Receipts

-- ============================================
-- Table: warehouse_receipts
-- ============================================
CREATE TABLE IF NOT EXISTS "warehouse_receipts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "truck_trip_id" uuid REFERENCES "truck_trips" ("id"),
  "lot_id" uuid REFERENCES "inventory_lots" ("id"),
  "received_quantity" numeric(15, 2) NOT NULL,
  "unit" text NOT NULL,
  "condition_status" text,
  "exception_reason" text,
  "weighbridge_ticket_key" text,
  "checker_id" uuid NOT NULL REFERENCES "users" ("id"),
  "gps_latitude" numeric(9, 6),
  "gps_longitude" numeric(10, 6),
  "gps_accuracy" numeric(5, 2),
  "check_timestamp" timestamp WITH TIME ZONE NOT NULL,
  "received_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'verified', 'partial')),
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "warehouse_receipts_pkey" PRIMARY KEY ("id")
);

-- Indices for receipt-based queries
CREATE INDEX IF NOT EXISTS "idx_warehouse_receipts_project_id" ON "warehouse_receipts" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_warehouse_receipts_trip_id" ON "warehouse_receipts" ("truck_trip_id");
CREATE INDEX IF NOT EXISTS "idx_warehouse_receipts_lot_id" ON "warehouse_receipts" ("lot_id");
CREATE INDEX IF NOT EXISTS "idx_warehouse_receipts_checker_id" ON "warehouse_receipts" ("checker_id");

-- ============================================
-- Table: inventory_movements
-- ============================================
CREATE TABLE IF NOT EXISTS "inventory_movements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "lot_id" uuid NOT NULL REFERENCES "inventory_lots" ("id"),
  "warehouse_receipt_id" uuid REFERENCES "warehouse_receipts" ("id"),
  "movement_type" text NOT NULL CHECK ("movement_type" IN ('receipt', 'issue', 'transfer', 'adjustment')),
  "quantity" numeric(15, 2) NOT NULL,
  "unit" text NOT NULL,
  "source_location" text,
  "destination_location" text,
  "reason" text,
  "actor_id" uuid NOT NULL REFERENCES "users" ("id"),
  "timestamp" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "reference_id" uuid,
  "reference_type" text,
  "status" text NOT NULL DEFAULT 'posted' CHECK ("status" IN ('posted', 'reversed', 'adjusted')),
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- Indices for movement-based queries
CREATE INDEX IF NOT EXISTS "idx_inventory_movements_lot_id" ON "inventory_movements" ("lot_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_movements_actor_id" ON "inventory_movements" ("actor_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_movements_type" ON "inventory_movements" ("movement_type");
CREATE INDEX IF NOT EXISTS "idx_inventory_movements_status" ON "inventory_movements" ("status");

-- ============================================
-- Table: shipment_allocations
-- ============================================
-- Junction table for many-to-many relationship between shipments and lots
-- ============================================
CREATE TABLE IF NOT EXISTS "shipment_allocations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "shipment_id" uuid NOT NULL REFERENCES "shipments" ("id") ON DELETE CASCADE,
  "lot_id" uuid NOT NULL REFERENCES "inventory_lots" ("id") ON DELETE CASCADE,
  "allocated_quantity" numeric(15, 2) NOT NULL,
  "unit" text NOT NULL,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "shipment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shipment_allocations_unique" UNIQUE ("shipment_id", "lot_id")
);

-- Index for allocation queries
CREATE INDEX IF NOT EXISTS "idx_shipment_allocations_shipment_id" ON "shipment_allocations" ("shipment_id");
CREATE INDEX IF NOT EXISTS "idx_shipment_allocations_lot_id" ON "shipment_allocations" ("lot_id");