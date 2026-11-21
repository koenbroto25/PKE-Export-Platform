-- Migration 057: keep basic Project context separate from role and version internals.
BEGIN;

-- project.view is intentionally granted to Finance, Accounting and Funder for
-- basic Project identity/context. It must not expose the Project role catalogue.
DROP POLICY IF EXISTS pke_project_roles_select ON public.project_roles;
CREATE POLICY pke_project_roles_select
ON public.project_roles FOR SELECT TO app_runtime_secure
USING (public.pke_has_project_permission(project_id, 'project.roles.manage'));

-- Version snapshots contain configuration history. Keep them with Project
-- managers/change reviewers, not every role that can view basic Project data.
DROP POLICY IF EXISTS pke_project_versions_select ON public.project_versions;
CREATE POLICY pke_project_versions_select
ON public.project_versions FOR SELECT TO app_runtime_secure
USING (
  public.pke_has_project_permission(project_id, 'project.update')
  OR public.pke_has_project_permission(project_id, 'project.change.view')
);

DO $post$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename='project_roles'
      AND policyname='pke_project_roles_select'
      AND qual NOT ILIKE '%project.view%'
      AND qual ILIKE '%project.roles.manage%'
  ) THEN
    RAISE EXCEPTION 'Project role catalogue is not restricted to role managers.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename='project_versions'
      AND policyname='pke_project_versions_select'
      AND qual NOT ILIKE '%project.view%'
      AND qual ILIKE '%project.update%'
  ) THEN
    RAISE EXCEPTION 'Project version snapshots are not restricted to Project managers/change reviewers.';
  END IF;
END;
$post$;

COMMIT;
