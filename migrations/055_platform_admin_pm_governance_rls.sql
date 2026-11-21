-- Migration 055: Platform Admin PM-governance-only RLS for Project staffing tables.
BEGIN;

-- Platform Admin may inspect Project membership candidates, but cannot directly
-- create arbitrary memberships, edit/deactivate members, or delete memberships.
DROP POLICY IF EXISTS pke_admin_all ON public.project_members;
DROP POLICY IF EXISTS pke_platform_admin_project_members_select ON public.project_members;
DROP POLICY IF EXISTS pke_platform_admin_pm_candidate_insert ON public.project_members;
CREATE POLICY pke_platform_admin_project_members_select
ON public.project_members FOR SELECT TO app_runtime_secure
USING (public.pke_is_platform_admin());
CREATE POLICY pke_platform_admin_pm_candidate_insert
ON public.project_members FOR INSERT TO app_runtime_secure
WITH CHECK (
  public.pke_is_platform_admin()
  AND project_role_id IS NULL
  AND is_active = true
);

-- Platform Admin can inspect, create, and reactivate only the canonical PM role.
-- All other Project role administration remains with the Project-scoped roles.
DROP POLICY IF EXISTS pke_admin_all ON public.project_roles;
DROP POLICY IF EXISTS pke_platform_admin_pm_role_select ON public.project_roles;
DROP POLICY IF EXISTS pke_platform_admin_pm_role_insert ON public.project_roles;
DROP POLICY IF EXISTS pke_platform_admin_pm_role_update ON public.project_roles;
CREATE POLICY pke_platform_admin_pm_role_select
ON public.project_roles FOR SELECT TO app_runtime_secure
USING (public.pke_is_platform_admin() AND role_code = 'pm');
CREATE POLICY pke_platform_admin_pm_role_insert
ON public.project_roles FOR INSERT TO app_runtime_secure
WITH CHECK (public.pke_is_platform_admin() AND role_code = 'pm');
CREATE POLICY pke_platform_admin_pm_role_update
ON public.project_roles FOR UPDATE TO app_runtime_secure
USING (public.pke_is_platform_admin() AND role_code = 'pm')
WITH CHECK (public.pke_is_platform_admin() AND role_code = 'pm');

-- Invitations are issued and managed by Project-scoped staffing roles, not Platform Admin.
DROP POLICY IF EXISTS pke_admin_all ON public.project_invitations;

-- Platform Admin may see only PM assignments and their audit events.
DROP POLICY IF EXISTS pke_project_role_assignments_select ON public.project_role_assignments;
CREATE POLICY pke_project_role_assignments_select
ON public.project_role_assignments FOR SELECT TO app_runtime_secure
USING (
  (
    public.pke_is_platform_admin()
    AND EXISTS (
      SELECT 1 FROM public.project_roles role
      WHERE role.id = project_role_assignments.project_role_id
        AND role.project_id = project_role_assignments.project_id
        AND role.role_code = 'pm'
    )
  )
  OR public.pke_has_project_permission(project_id,'project.members.view')
);

DROP POLICY IF EXISTS pke_project_role_assignment_events_select ON public.project_role_assignment_events;
CREATE POLICY pke_project_role_assignment_events_select
ON public.project_role_assignment_events FOR SELECT TO app_runtime_secure
USING (
  (
    public.pke_is_platform_admin()
    AND EXISTS (
      SELECT 1 FROM public.project_roles role
      WHERE role.id = project_role_assignment_events.project_role_id
        AND role.project_id = project_role_assignment_events.project_id
        AND role.role_code = 'pm'
    )
  )
  OR public.pke_has_project_permission(project_id,'project.members.view')
);

-- Role permission inspection is limited to the PM template for Platform Admin.
DROP POLICY IF EXISTS pke_project_role_permissions_select ON public.project_role_permissions;
CREATE POLICY pke_project_role_permissions_select
ON public.project_role_permissions FOR SELECT TO app_runtime_secure
USING (
  (
    public.pke_is_platform_admin()
    AND EXISTS (
      SELECT 1 FROM public.project_roles role
      WHERE role.id = project_role_permissions.project_role_id
        AND role.project_id = project_role_permissions.project_id
        AND role.role_code = 'pm'
    )
  )
  OR public.pke_has_project_permission(project_id,'project.roles.manage')
);

DO $post$
DECLARE v_broad integer;
BEGIN
  SELECT count(*) INTO v_broad
  FROM pg_catalog.pg_policies
  WHERE schemaname='public'
    AND policyname='pke_admin_all'
    AND tablename IN ('project_members','project_roles','project_invitations');
  IF v_broad <> 0 THEN
    RAISE EXCEPTION 'Platform Admin broad staffing policies remain: %.',v_broad;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename='project_members'
      AND policyname='pke_platform_admin_pm_candidate_insert'
      AND cmd='INSERT' AND with_check ILIKE '%project_role_id IS NULL%'
  ) THEN
    RAISE EXCEPTION 'Narrow PM candidate membership insert policy is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename='project_roles'
      AND policyname='pke_platform_admin_pm_role_insert'
      AND cmd='INSERT' AND with_check ILIKE '%role_code = ''pm''%'
  ) THEN
    RAISE EXCEPTION 'Narrow PM role insert policy is missing.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename IN ('project_members','project_roles','project_invitations')
      AND cmd IN ('UPDATE','DELETE','ALL')
      AND (coalesce(qual,'') ILIKE '%pke_is_platform_admin()%' OR coalesce(with_check,'') ILIKE '%pke_is_platform_admin()%')
  ) THEN
    RAISE EXCEPTION 'Platform Admin still has direct staffing UPDATE/DELETE/ALL RLS access.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename='project_role_assignments'
      AND policyname='pke_project_role_assignments_select'
      AND qual ILIKE '%role_code = ''pm''%'
  ) THEN
    RAISE EXCEPTION 'Platform Admin PM-only assignment visibility is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename='project_role_assignment_events'
      AND policyname='pke_project_role_assignment_events_select'
      AND qual ILIKE '%role_code = ''pm''%'
  ) THEN
    RAISE EXCEPTION 'Platform Admin PM-only assignment event visibility is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname='public' AND tablename='project_role_permissions'
      AND policyname='pke_project_role_permissions_select'
      AND qual ILIKE '%role_code = ''pm''%'
  ) THEN
    RAISE EXCEPTION 'Platform Admin PM-only permission visibility is missing.';
  END IF;
END;$post$;

COMMIT;
