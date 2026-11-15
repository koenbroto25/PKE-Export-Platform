-- Migration 034: Regulatory document engine tables
-- Tables: export_document_types, country_export_document_requirements,
--         project_export_document_requirements, project_export_documents

-- Export document types catalog
CREATE TABLE IF NOT EXISTS "export_document_types" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "document_type_id" text NOT NULL UNIQUE,
  "document_name" text NOT NULL,
  "document_category" text,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "export_document_types_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_export_document_types_document_type_id" ON "export_document_types" ("document_type_id");
CREATE INDEX IF NOT EXISTS "idx_export_document_types_is_active" ON "export_document_types" ("is_active");

-- Country export document requirements
CREATE TABLE IF NOT EXISTS "country_export_document_requirements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "country_code" text NOT NULL,
  "document_type_id" uuid NOT NULL REFERENCES "export_document_types" ("id") ON DELETE CASCADE,
  "importing_authority" text,
  "mandatory" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'active',
  "effective_from" timestamp WITH TIME ZONE,
  "effective_to" timestamp WITH TIME ZONE,
  "official_source_url" text,
  "notes" text,
  "last_verified_at" timestamp WITH TIME ZONE,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "country_export_document_requirements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_country_export_document_requirements_country_code" ON "country_export_document_requirements" ("country_code");
CREATE INDEX IF NOT EXISTS "idx_country_export_document_requirements_document_type_id" ON "country_export_document_requirements" ("document_type_id");
CREATE INDEX IF NOT EXISTS "idx_country_export_document_requirements_status" ON "country_export_document_requirements" ("status");

-- Project export document requirements
CREATE TABLE IF NOT EXISTS "project_export_document_requirements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "country_requirement_id" uuid NOT NULL REFERENCES "country_export_document_requirements" ("id") ON DELETE CASCADE,
  "is_required" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'required',
  "override_reason" text,
  "overridden_by" uuid REFERENCES "users" ("id"),
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "project_export_document_requirements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_project_export_document_requirements_project_id" ON "project_export_document_requirements" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_export_document_requirements_country_requirement_id" ON "project_export_document_requirements" ("country_requirement_id");

-- Project export documents
CREATE TABLE IF NOT EXISTS "project_export_documents" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "project_requirement_id" uuid NOT NULL REFERENCES "project_export_document_requirements" ("id") ON DELETE CASCADE,
  "file_reference" text NOT NULL,
  "object_key" text NOT NULL,
  "original_filename" text NOT NULL,
  "mime_type" text,
  "sha256_checksum" text,
  "version_no" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'uploaded',
  "uploaded_by" uuid NOT NULL REFERENCES "users" ("id"),
  "reviewed_by" uuid REFERENCES "users" ("id"),
  "uploaded_at" timestamp WITH TIME ZONE,
  "reviewed_at" timestamp WITH TIME ZONE,
  "expiry_date" timestamp WITH TIME ZONE,
  "notes" text,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "project_export_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_project_export_documents_project_id" ON "project_export_documents" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_project_export_documents_project_requirement_id" ON "project_export_documents" ("project_requirement_id");
CREATE INDEX IF NOT EXISTS "idx_project_export_documents_object_key" ON "project_export_documents" ("object_key");
CREATE INDEX IF NOT EXISTS "idx_project_export_documents_sha256_checksum" ON "project_export_documents" ("sha256_checksum");