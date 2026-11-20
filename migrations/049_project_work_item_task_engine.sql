-- Migration 049: Project-scoped task, instruction, acknowledgement and escalation engine.
-- PREPARED ONLY. Do not apply to Neon Production without separate owner approval
-- of this exact SQL and SHA-256.
BEGIN;

INSERT INTO public.permissions (name, code, description, is_active)
VALUES
  ('View Project task control tower', 'project.tasks.view', 'View all operational work items and task roll-up within an assigned Project.', true),
  ('Create Project work instructions', 'project.tasks.create', 'Create Project-scoped work items and operational instructions.', true),
  ('Assign Project work items', 'project.tasks.assign', 'Assign or reassign work items to active Project role assignments.', true),
  ('Update assigned Project work items', 'project.tasks.update', 'Acknowledge, start, block, comment on and submit assigned work items.', true),
  ('Resolve Project work items', 'project.tasks.resolve', 'Resolve, close or reopen Project work items after review.', true),
  ('Escalate Project work items', 'project.tasks.escalate', 'Escalate an assigned or managed work item to the Project Manager.', true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = now();

-- Only the canonical PM role receives Project-wide task governance capabilities.
INSERT INTO public.project_role_permissions (project_id, project_role_id, permission_id, granted_at)
SELECT pr.project_id, pr.id, perm.id, now()
  FROM public.project_roles pr
  JOIN public.permissions perm
    ON perm.code IN (
      'project.tasks.view', 'project.tasks.create', 'project.tasks.assign',
      'project.tasks.update', 'project.tasks.resolve', 'project.tasks.escalate'
    )
   AND perm.is_active = true
 WHERE pr.role_code = 'pm'
   AND pr.is_active = true
ON CONFLICT (project_role_id, permission_id) DO NOTHING;

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS work_item_id uuid;

CREATE TABLE IF NOT EXISTS public.project_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_entity_type text,
  source_entity_id uuid,
  work_item_type text NOT NULL DEFAULT 'task'
    CHECK (work_item_type IN ('task','instruction','exception','approval_request','follow_up')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 240),
  description text,
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','critical')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','in_progress','blocked','submitted','resolved','closed','cancelled')),
  owner_role_code text NOT NULL,
  assignee_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  due_at timestamptz,
  acknowledged_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.users(id),
  closed_at timestamptz,
  closed_by uuid REFERENCES public.users(id),
  escalation_level integer NOT NULL DEFAULT 0 CHECK (escalation_level >= 0),
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_work_items_source_pair_check
    CHECK ((source_entity_type IS NULL) = (source_entity_id IS NULL)),
  CONSTRAINT project_work_items_dedupe_unique
    UNIQUE (project_id, dedupe_key),
  CONSTRAINT project_work_items_id_project_unique
    UNIQUE (id, project_id)
);

CREATE INDEX IF NOT EXISTS project_work_items_project_status_due_idx
  ON public.project_work_items (project_id, status, due_at);
CREATE INDEX IF NOT EXISTS project_work_items_assignee_status_idx
  ON public.project_work_items (project_id, assignee_user_id, status);
CREATE INDEX IF NOT EXISTS project_work_items_role_status_idx
  ON public.project_work_items (project_id, owner_role_code, status);

CREATE TABLE IF NOT EXISTS public.project_work_item_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'created','assigned','reassigned','acknowledged','started','commented',
      'blocked','submitted','resolved','reopened','escalated','closed','cancelled'
    )),
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_work_item_events_same_project_fkey
    FOREIGN KEY (work_item_id, project_id)
    REFERENCES public.project_work_items(id, project_id) ON DELETE CASCADE
);
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_notifications_work_item_fkey'
  ) THEN
    ALTER TABLE public.user_notifications
      ADD CONSTRAINT user_notifications_work_item_fkey
      FOREIGN KEY (work_item_id) REFERENCES public.project_work_items(id) ON DELETE SET NULL;
  END IF;
END $;
CREATE INDEX IF NOT EXISTS user_notifications_work_item_id_idx
  ON public.user_notifications (work_item_id) WHERE work_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_work_item_events_item_time_idx
  ON public.project_work_item_events (work_item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS project_work_item_events_project_time_idx
  ON public.project_work_item_events (project_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.pke_user_has_active_project_role(
  p_project_id uuid,
  p_role_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.project_role_assignments a
      JOIN public.project_members pm
        ON pm.id = a.project_member_id
       AND pm.project_id = a.project_id
       AND pm.user_id = a.user_id
      JOIN public.project_roles pr
        ON pr.id = a.project_role_id
       AND pr.project_id = a.project_id
      JOIN public.projects p ON p.id = a.project_id
      JOIN public.users u ON u.id = a.user_id
     WHERE a.project_id = p_project_id
       AND a.user_id = NULLIF(current_setting('app.current_user_id', true),'')::uuid
       AND pr.role_code = p_role_code
       AND a.is_active = true
       AND a.revoked_at IS NULL
       AND (a.expires_at IS NULL OR a.expires_at > now())
       AND pm.is_active = true
       AND pm.deactivated_at IS NULL
       AND (pm.expires_at IS NULL OR pm.expires_at > now())
       AND pr.is_active = true
       AND p.is_active = true
       AND u.is_active = true
  )
$function$;

REVOKE ALL ON FUNCTION public.pke_user_has_active_project_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_user_has_active_project_role(uuid, text) TO app_runtime_secure;

-- Checker may record a checkpoint only with verify_checkpoints; trip lifecycle events remain record_truck_trips.
DROP POLICY IF EXISTS pke_tracking_events_insert ON public.tracking_events;
CREATE POLICY pke_tracking_events_insert ON public.tracking_events
  FOR INSERT TO app_runtime_secure WITH CHECK (
    public.pke_has_truck_trip_permission(truck_trip_id, 'record_truck_trips')
    OR (event_type = 'checkpoint' AND public.pke_has_truck_trip_permission(truck_trip_id, 'verify_checkpoints'))
    OR (event_type = 'receipt' AND public.pke_has_truck_trip_permission(truck_trip_id, 'warehouse.receipt.create'))
  );

ALTER TABLE public.project_work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_work_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_work_item_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_work_item_events FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.project_work_items TO app_runtime_secure;
REVOKE DELETE ON public.project_work_items FROM app_runtime_secure;
GRANT SELECT, INSERT ON public.project_work_item_events TO app_runtime_secure;
REVOKE UPDATE, DELETE ON public.project_work_item_events FROM app_runtime_secure;

DROP POLICY IF EXISTS pke_project_work_items_select ON public.project_work_items;
CREATE POLICY pke_project_work_items_select ON public.project_work_items
  FOR SELECT TO app_runtime_secure
  USING (
    public.pke_has_project_permission(project_id, 'project.tasks.view')
    OR (
      public.pke_user_has_active_project_role(project_id, owner_role_code)
      AND (assignee_user_id IS NULL OR assignee_user_id = public.pke_current_user_id())
    )
  );

DROP POLICY IF EXISTS pke_project_work_items_insert ON public.project_work_items;
CREATE POLICY pke_project_work_items_insert ON public.project_work_items
  FOR INSERT TO app_runtime_secure
  WITH CHECK (
    created_by = public.pke_current_user_id()
    AND public.pke_has_project_permission(project_id, 'project.tasks.create')
  );

DROP POLICY IF EXISTS pke_project_work_items_update ON public.project_work_items;
CREATE POLICY pke_project_work_items_update ON public.project_work_items
  FOR UPDATE TO app_runtime_secure
  USING (
    public.pke_has_project_permission(project_id, 'project.tasks.update')
    OR public.pke_has_project_permission(project_id, 'project.tasks.resolve')
    OR (
      public.pke_user_has_active_project_role(project_id, owner_role_code)
      AND (assignee_user_id IS NULL OR assignee_user_id = public.pke_current_user_id())
    )
  )
  WITH CHECK (
    public.pke_has_project_permission(project_id, 'project.tasks.update')
    OR public.pke_has_project_permission(project_id, 'project.tasks.resolve')
    OR (
      public.pke_user_has_active_project_role(project_id, owner_role_code)
      AND (assignee_user_id IS NULL OR assignee_user_id = public.pke_current_user_id())
    )
  );

DROP POLICY IF EXISTS pke_project_work_item_events_select ON public.project_work_item_events;
CREATE POLICY pke_project_work_item_events_select ON public.project_work_item_events
  FOR SELECT TO app_runtime_secure
  USING (
    EXISTS (
      SELECT 1 FROM public.project_work_items wi
       WHERE wi.id = project_work_item_events.work_item_id
         AND wi.project_id = project_work_item_events.project_id
    )
  );

DROP POLICY IF EXISTS pke_project_work_item_events_insert ON public.project_work_item_events;
CREATE POLICY pke_project_work_item_events_insert ON public.project_work_item_events
  FOR INSERT TO app_runtime_secure
  WITH CHECK (
    actor_user_id = public.pke_current_user_id()
    AND EXISTS (
      SELECT 1 FROM public.project_work_items wi
       WHERE wi.id = project_work_item_events.work_item_id
         AND wi.project_id = project_work_item_events.project_id
    )
  );

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
      OR EXISTS (
        SELECT 1 FROM public.project_work_items wi
         WHERE wi.id = user_notifications.work_item_id
           AND wi.project_id = user_notifications.project_id
           AND public.pke_user_has_active_project_role(wi.project_id, wi.owner_role_code)
           AND (wi.assignee_user_id IS NULL OR wi.assignee_user_id = public.pke_current_user_id())
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.project_members pm
       WHERE pm.project_id = user_notifications.project_id
         AND pm.user_id = user_notifications.recipient_user_id
         AND pm.is_active = true
         AND pm.deactivated_at IS NULL
         AND (pm.expires_at IS NULL OR pm.expires_at > now())
    )
  );

REVOKE ALL ON FUNCTION public.pke_user_has_active_project_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_user_has_active_project_role(uuid, text) TO app_runtime_secure;

COMMIT;
