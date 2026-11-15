-- Migration: 006_workflows_and_stages
-- Phase 6: Project Workflows & Stages

-- ============================================
-- Table: project_workflows
-- ============================================
CREATE TABLE IF NOT EXISTS "project_workflows" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE CASCADE,
  "workflow_template_id" uuid REFERENCES "project_templates" ("id"),
  "version" text NOT NULL DEFAULT '1.0',
  "status" text NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'archived', 'paused')),
  "config_snapshot" jsonb,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "project_workflows_pkey" PRIMARY KEY ("id")
);

-- Index for workflow queries
CREATE INDEX IF NOT EXISTS "idx_project_workflows_project_id" ON "project_workflows" ("project_id");

-- ============================================
-- Table: workflow_stages
-- ============================================
CREATE TABLE IF NOT EXISTS "workflow_stages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workflow_id" uuid NOT NULL REFERENCES "project_workflows" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "stage_order" integer NOT NULL,
  "is_optional" boolean NOT NULL DEFAULT false,
  "is_parallel" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'active', 'completed', 'skipped')),
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "updated_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "workflow_stages_pkey" PRIMARY KEY ("id")
);

-- Index for stage queries
CREATE INDEX IF NOT EXISTS "idx_workflow_stages_workflow_id" ON "workflow_stages" ("workflow_id");
CREATE INDEX IF NOT EXISTS "idx_workflow_stages_order" ON "workflow_stages" ("stage_order");

-- ============================================
-- Table: stage_transitions
-- ============================================
CREATE TABLE IF NOT EXISTS "stage_transitions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "stage_id" uuid NOT NULL REFERENCES "workflow_stages" ("id") ON DELETE CASCADE,
  "from_status" text,
  "to_status" text NOT NULL CHECK ("to_status" IN ('pending', 'active', 'completed', 'skipped')),
  "triggered_by" uuid NOT NULL REFERENCES "users" ("id"),
  "triggered_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  "event_type" text,
  "notes" text,
  "created_at" timestamp WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "stage_transitions_pkey" PRIMARY KEY ("id")
);

-- Index for transition queries
CREATE INDEX IF NOT EXISTS "idx_stage_transitions_stage_id" ON "stage_transitions" ("stage_id");
CREATE INDEX IF NOT EXISTS "idx_stage_transitions_triggered_at" ON "stage_transitions" ("triggered_at");