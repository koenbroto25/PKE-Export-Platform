-- PKE Migration 028: Project foundation - module configuration versioning & readiness
-- CORRECTED VERSION: reflects the SQL changes applied to TEST branch only.
-- Target branch: br-solitary-credit-b3imfofv
-- Production branch: br-calm-glade-b3nrleet (DO NOT APPLY HERE)
--
-- IMPORTANT:
-- This migration has ALREADY been applied to the TEST branch.
-- Do not execute it again through the migration runner.
-- This file is provided for repository parity, review, and checksum verification.
--
-- Changes:
-- 1. Adds project_module_configuration_versions with immutable version snapshots.
-- 2. Adds configuration_version to project_operating_profiles.
-- 3. Adds project.configuration.manage permission.
-- 4. Adds project_module_readiness as a security-invoker view.
-- 5. Enables RLS and restricts runtime history access to SELECT and INSERT.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Module configuration version history / audit trail
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_module_configuration_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  configuration_version integer NOT NULL DEFAULT 1,
  schema_version integer NOT NULL DEFAULT 1,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  activated_by uuid REFERENCES public.users(id),
  activated_at timestamptz NOT NULL DEFAULT now(),
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_module_configuration_versions_configuration_object
    CHECK (jsonb_typeof(configuration) = 'object'),
  CONSTRAINT project_module_configuration_versions_project_version_unique
    UNIQUE (project_id, configuration_version)
);

CREATE INDEX IF NOT EXISTS project_module_configuration_versions_project_idx
  ON public.project_module_configuration_versions(project_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. Version tracking column on project_operating_profiles
-- -----------------------------------------------------------------------------
ALTER TABLE public.project_operating_profiles
  ADD COLUMN IF NOT EXISTS configuration_version integer NOT NULL DEFAULT 1;

-- -----------------------------------------------------------------------------
-- 3. Permission required to manage module configuration
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions (name, code, description, is_active)
VALUES (
  'Manage Project Module Configuration',
  'project.configuration.manage',
  'Enable, disable, and update module configuration for an assigned project',
  true
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- 4. Module readiness view
--    Uses security_invoker so underlying table RLS applies to the caller.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.project_module_readiness
WITH (security_invoker = true)
AS
WITH module_rows AS (
  SELECT
    p.id AS project_id,
    kv.module_name,
    (kv.enabled_text = 'true') AS enabled
  FROM public.projects p
  LEFT JOIN LATERAL jsonb_each_text(
    COALESCE(
      (
        SELECT pop.configuration
        FROM public.project_operating_profiles pop
        WHERE pop.project_id = p.id
      ),
      '{}'::jsonb
    )
  ) AS kv(module_name, enabled_text) ON true
  WHERE kv.module_name IS NOT NULL
),
enabled_modules AS (
  SELECT project_id, module_name
  FROM module_rows
  WHERE enabled = true
  UNION
  SELECT pop.project_id, 'logistics_mode'::text
  FROM public.project_operating_profiles pop
  WHERE pop.logistics_mode <> 'unspecified'
),
dependencies AS (
  SELECT * FROM (VALUES
    ('procurement', 'pks'),
    ('inventory', 'pks'),
    ('trucking', 'logistics_mode'),
    ('warehouse', 'inventory'),
    ('port_operations', 'logistics_mode'),
    ('loading', 'warehouse'),
    ('vessel', 'port_operations'),
    ('voyage', 'vessel'),
    ('shipment', 'loading'),
    ('tracking', 'shipment'),
    ('finance', 'procurement'),
    ('accounting', 'finance'),
    ('fx', 'finance'),
    ('financing', 'finance'),
    ('reporting', 'documents'),
    ('visual_reporting', 'reporting'),
    ('workflow', 'documents'),
    ('approvals', 'workflow')
  ) AS d(module_name, depends_on)
)
SELECT
  m.project_id,
  m.module_name,
  m.enabled,
  CASE
    WHEN NOT m.enabled THEN 'disabled'
    WHEN d.depends_on IS NULL THEN 'ready'
    WHEN EXISTS (
      SELECT 1
      FROM enabled_modules em
      WHERE em.project_id = m.project_id
        AND em.module_name = d.depends_on
    ) THEN 'ready'
    ELSE 'blocked'
  END AS readiness,
  d.depends_on
FROM module_rows m
LEFT JOIN dependencies d ON d.module_name = m.module_name;

-- -----------------------------------------------------------------------------
-- 5. Runtime grants. History is append-only for app_runtime_secure.
-- -----------------------------------------------------------------------------
REVOKE ALL PRIVILEGES
  ON public.project_module_configuration_versions
  FROM app_runtime_secure;

GRANT SELECT, INSERT
  ON public.project_module_configuration_versions
  TO app_runtime_secure;

GRANT SELECT
  ON public.project_module_readiness
  TO app_runtime_secure;

-- -----------------------------------------------------------------------------
-- 6. Row-level security for configuration history
-- -----------------------------------------------------------------------------
ALTER TABLE public.project_module_configuration_versions
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pke_module_config_versions_select
  ON public.project_module_configuration_versions;

CREATE POLICY pke_module_config_versions_select
  ON public.project_module_configuration_versions
  FOR SELECT
  TO app_runtime_secure
  USING (
    public.pke_has_project_permission(project_id, 'operations.view')
    OR public.pke_has_project_permission(project_id, 'project.configuration.manage')
  );

DROP POLICY IF EXISTS pke_module_config_versions_insert
  ON public.project_module_configuration_versions;

CREATE POLICY pke_module_config_versions_insert
  ON public.project_module_configuration_versions
  FOR INSERT
  TO app_runtime_secure
  WITH CHECK (
    public.pke_has_project_permission(project_id, 'project.configuration.manage')
  );

COMMIT;
