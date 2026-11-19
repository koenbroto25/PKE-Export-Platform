-- Migration 041: make Finance report notification recipient checks RLS-safe.
-- The predicate must inspect active PM membership and active platform Admin recipients
-- without inheriting the caller's row filters on project_members/users.
CREATE OR REPLACE FUNCTION public.pke_can_receive_finance_report_notification(
  p_project_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.users recipient
     WHERE recipient.id = p_user_id
       AND recipient.is_active = true
       AND (
         recipient.role::text = 'admin'
         OR EXISTS (
           SELECT 1
             FROM public.project_members pm
             JOIN public.project_roles pr
               ON pr.id = pm.project_role_id
              AND pr.project_id = pm.project_id
             JOIN public.projects project
               ON project.id = pm.project_id
            WHERE pm.project_id = p_project_id
              AND pm.user_id = recipient.id
              AND pm.is_active = true
              AND pm.deactivated_at IS NULL
              AND (pm.expires_at IS NULL OR pm.expires_at > now())
              AND pr.is_active = true
              AND pr.role_code = 'pm'
              AND project.is_active = true
         )
       )
  )
$function$;

REVOKE ALL ON FUNCTION public.pke_can_receive_finance_report_notification(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_can_receive_finance_report_notification(uuid, uuid) TO app_runtime_secure;

DROP POLICY IF EXISTS pke_user_notifications_finance_report_insert ON public.user_notifications;
CREATE POLICY pke_user_notifications_finance_report_insert
  ON public.user_notifications
  FOR INSERT TO app_runtime_secure
  WITH CHECK (
    created_by = public.pke_current_user_id()
    AND project_id IS NOT NULL
    AND public.pke_has_project_permission(project_id, 'reports.create')
    AND public.pke_can_receive_finance_report_notification(project_id, recipient_user_id)
  );
