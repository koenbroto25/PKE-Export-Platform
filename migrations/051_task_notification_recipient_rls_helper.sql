-- Migration 051: fix task-notification recipient validation under forced RLS.
-- Use the SECURITY DEFINER membership helper so the policy does not self-filter project_members.
BEGIN;
DROP POLICY IF EXISTS pke_user_notifications_task_assignment_insert ON public.user_notifications;
CREATE POLICY pke_user_notifications_task_assignment_insert ON public.user_notifications
  FOR INSERT TO app_runtime_secure
  WITH CHECK (
    created_by = public.pke_current_user_id()
    AND work_item_id IS NOT NULL
    AND project_id IS NOT NULL
    AND (
      public.pke_has_project_permission(project_id, 'project.tasks.assign')
      OR public.pke_has_project_permission(project_id, 'project.tasks.escalate')
      OR public.pke_has_project_permission(project_id, 'project.tasks.resolve')
      OR EXISTS (
        SELECT 1 FROM public.project_work_items wi
         WHERE wi.id = user_notifications.work_item_id
           AND wi.project_id = user_notifications.project_id
           AND public.pke_user_has_active_project_role(wi.project_id, wi.owner_role_code)
           AND (wi.assignee_user_id IS NULL OR wi.assignee_user_id = public.pke_current_user_id())
      )
    )
    AND public.pke_is_active_project_member(project_id, recipient_user_id)
  );
COMMIT;
