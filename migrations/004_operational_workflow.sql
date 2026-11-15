-- Migration: 004_operational_workflow
-- Phase 4: Operational Workflow - Truck Checkpoint Tracking & Inventory

-- Enable UUID extension (idempotent)
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto"; END $$;

-- ============================================
-- Table: transport_legs
-- ============================================
CREATE TABLE IF NOT EXISTS "transport_legs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "origin" text NOT NULL,
  "destination" text NOT NULL,
  "distance_km" numeric(10, 2),
  "status" text NOT NULL DEFAULT 'planned',
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "transport_legs_pkey" PRIMARY KEY ("id")
);

-- Index for project-based queries
CREATE INDEX IF NOT EXISTS "idx_transport_legs_project_id" ON "transport_legs" ("project_id");

-- ============================================
-- Table: truck_trips
-- ============================================
DROP TABLE IF EXISTS "truck_trips" CASCADE;
CREATE TABLE "truck_trips" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "transport_leg_id" uuid NOT NULL REFERENCES "transport_legs" ("id") ON DELETE CASCADE,
  "pks_site_id" uuid REFERENCES "pks_sites" ("id"),
  "vehicle_id" uuid REFERENCES "service_vendors" ("id"),
  "driver_name" text,
  "license_plate" text NOT NULL,
  "departure_time" timestamp WITH TIME ZONE,
  "arrival_time" timestamp WITH TIME ZONE,
  "status" text NOT NULL DEFAULT 'scheduled',
  "gps_latitude" numeric(9, 6),
  "gps_longitude" numeric(10, 6),
  "gps_accuracy" numeric(5, 2),
  "checker_id" uuid REFERENCES "users" ("id"),
  "departure_checkpoint_id" uuid REFERENCES "tracking_events" ("id"),
  "arrival_checkpoint_id" uuid REFERENCES "tracking_events" ("id"),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "truck_trips_pkey" PRIMARY KEY ("id")
);

-- Indices for trip-based queries
CREATE INDEX IF NOT EXISTS "idx_truck_trips_project_id" ON "truck_trips" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_truck_trips_vehicle_id" ON "truck_trips" ("vehicle_id");

-- ============================================
-- Table: tracking_events
-- ============================================
DROP TABLE IF EXISTS "tracking_events" CASCADE;
CREATE TABLE "tracking_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "truck_trip_id" uuid NOT NULL REFERENCES "truck_trips" ("id") ON DELETE CASCADE,
  "event_type" text NOT NULL CHECK ("event_type" IN ('departure', 'checkpoint', 'arrival')),
  "checker_id" uuid NOT NULL REFERENCES "users" ("id"),
  "latitude" numeric(9, 6) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  "longitude" numeric(10, 6) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  "gps_accuracy" numeric(5, 2) NOT NULL CHECK (gps_accuracy > 0),
  "source" text NOT NULL DEFAULT 'checker_device',
  "capture_timestamp" timestamp WITH TIME ZONE NOT NULL,
  "server_received_timestamp" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "qr_scanned" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'verified' CHECK ("status" IN ('verified', 'needs_review', 'location_mismatch', 'unverified')),
  "notes" text,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "tracking_events_pkey" PRIMARY KEY ("id")
);

-- Indices for event-based queries
CREATE INDEX IF NOT EXISTS "idx_tracking_events_trip_id" ON "tracking_events" ("truck_trip_id");
CREATE INDEX IF NOT EXISTS "idx_tracking_events_checker_id" ON "tracking_events" ("checker_id");
CREATE INDEX IF NOT EXISTS "idx_tracking_events_status" ON "tracking_events" ("status");
CREATE INDEX IF NOT EXISTS "idx_tracking_events_type" ON "tracking_events" ("event_type");
CREATE INDEX IF NOT EXISTS "idx_truck_trips_leg_id" ON "truck_trips" ("transport_leg_id");
CREATE INDEX IF NOT EXISTS "idx_truck_trips_checker_id" ON "truck_trips" ("checker_id");
-- ============================================
-- Table: tracking_evidence
-- ============================================
CREATE TABLE IF NOT EXISTS "tracking_evidence" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tracking_event_id" uuid NOT NULL REFERENCES "tracking_events" ("id") ON DELETE CASCADE,
  "object_key" text NOT NULL UNIQUE,
  "original_filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size" numeric(10, 2) NOT NULL,
  "sha256_checksum" text NOT NULL,
  "supersedes_document_id" uuid REFERENCES "tracking_evidence" ("id"),
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'superseded', 'deleted')),
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "tracking_evidence_pkey" PRIMARY KEY ("id")
);

-- Index for evidence retrieval
CREATE INDEX IF NOT EXISTS "idx_tracking_evidence_event_id" ON "tracking_evidence" ("tracking_event_id");
CREATE INDEX IF NOT EXISTS "idx_tracking_evidence_checksum" ON "tracking_evidence" ("sha256_checksum");