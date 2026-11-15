-- Migration: 015_regulatory_source_registry (Part 1)
-- Regulatory sources table

DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto"; END $$;

CREATE TABLE IF NOT EXISTS "regulatory_sources" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "source_id" text NOT NULL,
  "title" text NOT NULL,
  "issuing_authority" text NOT NULL,
  "jurisdiction" text NOT NULL,
  "document_type" text,
  "regulation_number" text,
  "article_annex_section" text,
  "publication_date" timestamp WITH TIME ZONE,
  "effective_date" timestamp WITH TIME ZONE NOT NULL,
  "expiry_repeal_date" timestamp WITH TIME ZONE,
  "status" text NOT NULL DEFAULT 'draft',
  "official_url" text,
  "source_file_reference" text,
  "source_checksum" text,
  "date_retrieved" timestamp WITH TIME ZONE,
  "last_reviewed" timestamp WITH TIME ZONE,
  "reviewer_id" uuid REFERENCES "users" ("id"),
  "verification_status" text NOT NULL DEFAULT 'pending',
  "related_regulatory_rules" uuid[] DEFAULT '{}',
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "regulatory_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "regulatory_sources_source_id_unique" UNIQUE ("source_id")
);

CREATE INDEX IF NOT EXISTS "idx_regulatory_sources_jurisdiction" ON "regulatory_sources" ("jurisdiction");
CREATE INDEX IF NOT EXISTS "idx_regulatory_sources_status" ON "regulatory_sources" ("status");
CREATE INDEX IF NOT EXISTS "idx_regulatory_sources_verification_status" ON "regulatory_sources" ("verification_status");