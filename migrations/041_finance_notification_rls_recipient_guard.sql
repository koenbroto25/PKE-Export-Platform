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

-- Submit notifications through a narrowly scoped definer function. The Finance caller
-- cannot enumerate other users' memberships under RLS, so recipient resolution and
-- insertion must happen together inside this permission-checked function.
CREATE OR REPLACE FUNCTION public.pke_submit_finance_report_notifications(
  p_project_id uuid,
  p_actor_id uuid,
  p_title text,
  p_message text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF p_actor_id IS NULL OR p_actor_id <> public.pke_current_user_id() THEN
    RAISE EXCEPTION 'Finance report actor does not match the authenticated database principal'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.pke_has_project_permission(p_project_id, 'reports.create') THEN
    RAISE EXCEPTION 'Finance report permission required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.project_members pm
      JOIN public.project_roles pr
        ON pr.id = pm.project_role_id AND pr.project_id = pm.project_id
      JOIN public.projects project ON project.id = pm.project_id
      JOIN public.users actor ON actor.id = pm.user_id
     WHERE pm.project_id = p_project_id
       AND pm.user_id = p_actor_id
       AND pm.is_active = true
       AND pm.deactivated_at IS NULL
       AND (pm.expires_at IS NULL OR pm.expires_at > now())
       AND pr.is_active = true
       AND pr.role_code = 'finance'
       AND project.is_active = true
       AND actor.is_active = true
  ) THEN
    RAISE EXCEPTION 'Only an active Finance Project member can submit reports'
      USING ERRCODE = '42501';
  END IF;

  WITH recipients AS (
    SELECT pm.user_id AS recipient_id
      FROM public.project_members pm
      JOIN public.project_roles pr
        ON pr.id = pm.project_role_id AND pr.project_id = pm.project_id
      JOIN public.projects project ON project.id = pm.project_id
      JOIN public.users recipient ON recipient.id = pm.user_id
     WHERE pm.project_id = p_project_id
       AND pm.is_active = true
       AND pm.deactivated_at IS NULL
       AND (pm.expires_at IS NULL OR pm.expires_at > now())
       AND pr.is_active = true
       AND pr.role_code = 'pm'
       AND project.is_active = true
       AND recipient.is_active = true
    UNION
    SELECT recipient.id
      FROM public.users recipient
     WHERE recipient.is_active = true
       AND recipient.role::text = 'admin'
  )
  INSERT INTO public.user_notifications
    (id, event_id, project_id, recipient_user_id, created_by, title, message, priority, category, created_at)
  SELECT gen_random_uuid(), gen_random_uuid(), p_project_id, recipient_id, p_actor_id,
         left(coalesce(p_title, 'Laporan keuangan baru'), 240),
         left(coalesce(p_message, 'Laporan keuangan baru tersedia.'), 2000),
         'normal', 'finance_report', now()
    FROM recipients;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END
$function$;

REVOKE ALL ON FUNCTION public.pke_submit_finance_report_notifications(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_submit_finance_report_notifications(uuid, uuid, text, text) TO app_runtime_secure;
