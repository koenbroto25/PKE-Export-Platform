-- PKE Migration 025: restore authorized read-after-write visibility for project RBAC.
-- Includes SECURITY DEFINER membership lookup to avoid recursive RLS checks.

BEGIN;

CREATE OR REPLACE FUNCTION public.pke_is_active_project_member(
  p_project_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.project_members pm
      JOIN public.projects p ON p.id = pm.project_id
      JOIN public.users u ON u.id = pm.user_id
     WHERE pm.project_id = p_project_id
       AND pm.user_id = p_user_id
       AND pm.is_active = true
       AND pm.deactivated_at IS NULL
       AND (pm.expires_at IS NULL OR pm.expires_at > now())
       AND p.is_active = true
       AND u.is_active = true
  )
$function$;

REVOKE ALL ON FUNCTION public.pke_is_active_project_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_is_active_project_member(uuid, uuid) TO app_runtime_secure;

DROP POLICY IF EXISTS pke_project_members_select ON public.project_members;
CREATE POLICY pke_project_members_select
  ON public.project_members FOR SELECT TO app_runtime_secure
  USING (
    user_id = public.pke_current_user_id()
    OR public.pke_has_project_permission(project_id, 'project.members.view')
    OR public.pke_has_project_permission(project_id, 'project.members.manage')
    OR public.pke_has_project_permission(project_id, 'project.members.invite')
  );

DROP POLICY IF EXISTS pke_project_roles_select ON public.project_roles;
CREATE POLICY pke_project_roles_select
  ON public.project_roles FOR SELECT TO app_runtime_secure
  USING (
    public.pke_has_project_permission(project_id, 'project.view')
    OR public.pke_has_project_permission(project_id, 'project.roles.manage')
  );

DROP POLICY IF EXISTS pke_project_invitations_select ON public.project_invitations;
CREATE POLICY pke_project_invitations_select
  ON public.project_invitations FOR SELECT TO app_runtime_secure
  USING (
    public.pke_has_project_permission(project_id, 'project.members.view')
    OR public.pke_has_project_permission(project_id, 'project.members.invite')
    OR public.pke_has_project_permission(project_id, 'project.members.manage')
  );

CREATE OR REPLACE FUNCTION public.pke_can_view_user(p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT public.pke_is_platform_admin()
    OR p_target_user_id = public.pke_current_user_id()
    OR EXISTS (
      SELECT 1
        FROM public.project_members target_pm
        JOIN public.project_members viewer_pm
          ON viewer_pm.project_id = target_pm.project_id
       WHERE target_pm.user_id = p_target_user_id
         AND viewer_pm.user_id = public.pke_current_user_id()
         AND target_pm.is_active = true
         AND viewer_pm.is_active = true
         AND target_pm.deactivated_at IS NULL
         AND viewer_pm.deactivated_at IS NULL
         AND (target_pm.expires_at IS NULL OR target_pm.expires_at > now())
         AND (viewer_pm.expires_at IS NULL OR viewer_pm.expires_at > now())
         AND (
           public.pke_has_project_permission(viewer_pm.project_id, 'project.members.view')
           OR public.pke_has_project_permission(viewer_pm.project_id, 'project.members.manage')
           OR public.pke_has_project_permission(viewer_pm.project_id, 'project.members.invite')
         )
    )
$function$;

REVOKE ALL ON FUNCTION public.pke_can_view_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_can_view_user(uuid) TO app_runtime_secure;

DROP POLICY IF EXISTS pke_user_notifications_manager_insert ON public.user_notifications;
CREATE POLICY pke_user_notifications_manager_insert
  ON public.user_notifications FOR INSERT TO app_runtime_secure
  WITH CHECK (
    created_by = public.pke_current_user_id()
    AND project_id IS NOT NULL
    AND public.pke_has_project_permission(project_id, 'project.members.manage')
    AND public.pke_is_active_project_member(project_id, recipient_user_id)
  );

COMMIT;
