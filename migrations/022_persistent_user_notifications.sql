-- PKE Migration 022: persistent in-app notifications with recipient-scoped access.
-- Delivery through email/SMS/WhatsApp remains a separate provider integration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users(id),
  title text NOT NULL,
  message text NOT NULL,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  category text NOT NULL DEFAULT 'system',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_recipient_created_idx
  ON public.user_notifications(recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_notifications_project_created_idx
  ON public.user_notifications(project_id, created_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY pke_user_notifications_admin_all
  ON public.user_notifications FOR ALL TO app_runtime_secure
  USING (public.pke_is_platform_admin())
  WITH CHECK (public.pke_is_platform_admin());

CREATE POLICY pke_user_notifications_recipient_select
  ON public.user_notifications FOR SELECT TO app_runtime_secure
  USING (recipient_user_id = public.pke_current_user_id());

CREATE POLICY pke_user_notifications_manager_insert
  ON public.user_notifications FOR INSERT TO app_runtime_secure
  WITH CHECK (
    created_by = public.pke_current_user_id()
    AND project_id IS NOT NULL
    AND public.pke_has_project_permission(project_id, 'project.members.manage')
    AND EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = user_notifications.project_id
        AND pm.user_id = user_notifications.recipient_user_id
        AND pm.is_active = true
        AND pm.deactivated_at IS NULL
        AND (pm.expires_at IS NULL OR pm.expires_at > now())
    )
  );

CREATE POLICY pke_user_notifications_recipient_update
  ON public.user_notifications FOR UPDATE TO app_runtime_secure
  USING (recipient_user_id = public.pke_current_user_id())
  WITH CHECK (recipient_user_id = public.pke_current_user_id());

GRANT SELECT, INSERT ON public.user_notifications TO app_runtime_secure;
REVOKE UPDATE ON public.user_notifications FROM app_runtime_secure;
GRANT UPDATE (read_at) ON public.user_notifications TO app_runtime_secure;

COMMIT;
