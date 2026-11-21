-- Migration 040: Finance reporting-only workflow and PM/Admin notifications.
-- No payment execution, transfer instruction, approval, or reconciliation is implemented.
ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS report_payload jsonb,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

ALTER TABLE public.report_runs
  ADD CONSTRAINT report_runs_financial_period_check
  CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end);

CREATE INDEX IF NOT EXISTS report_runs_financial_project_period_idx
  ON public.report_runs(project_id, period_start, period_end)
  WHERE template_id = 'tpl-financial-report';

DROP POLICY IF EXISTS pke_user_notifications_finance_report_insert ON public.user_notifications;
CREATE POLICY pke_user_notifications_finance_report_insert
  ON public.user_notifications
  FOR INSERT TO app_runtime_secure
  WITH CHECK (
    created_by = public.pke_current_user_id()
    AND project_id IS NOT NULL
    AND public.pke_has_project_permission(project_id, 'reports.create')
    AND (
      EXISTS (
        SELECT 1
          FROM public.project_members pm
          JOIN public.project_roles pr
            ON pr.id = pm.project_role_id AND pr.project_id = pm.project_id
          JOIN public.users recipient
            ON recipient.id = pm.user_id
         WHERE pm.project_id = user_notifications.project_id
           AND pm.user_id = user_notifications.recipient_user_id
           AND pm.is_active = true
           AND pm.deactivated_at IS NULL
           AND (pm.expires_at IS NULL OR pm.expires_at > now())
           AND pr.is_active = true
           AND pr.role_code = 'pm'
           AND recipient.is_active = true
      )
      OR EXISTS (
        SELECT 1 FROM public.users recipient
         WHERE recipient.id = user_notifications.recipient_user_id
           AND recipient.is_active = true
           AND recipient.role::text = 'admin'
      )
    )
  );
