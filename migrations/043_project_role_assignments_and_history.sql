-- Migration 043: independent Project role assignments with immutable history.
-- Membership remains the user's Project access container; each role is an independently
-- expiring/revocable assignment. Existing project_members roles are backfilled.
-- No PM is selected, revoked, or replaced by this migration.

CREATE TABLE IF NOT EXISTS public.project_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  project_member_id uuid NOT NULL REFERENCES public.project_members(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  project_role_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES public.users(id),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.users(id),
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_role_assignments_role_project_fk
    FOREIGN KEY (project_role_id, project_id)
    REFERENCES public.project_roles(id, project_id),
  CONSTRAINT project_role_assignments_revocation_consistency
    CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR
           (revoked_at IS NOT NULL AND revoked_by IS NOT NULL)),
  CONSTRAINT project_role_assignments_revoke_reason_check
    CHECK (revoked_at IS NULL OR length(trim(coalesce(revoke_reason, ''))) >= 5)
);

CREATE INDEX IF NOT EXISTS idx_project_role_assignments_user_project_active
  ON public.project_role_assignments(project_id, user_id)
  WHERE is_active = true AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_role_assignments_role_active
  ON public.project_role_assignments(project_role_id, project_id)
  WHERE is_active = true AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_role_assignments_member_role_active
  ON public.project_role_assignments(project_member_id, project_role_id)
  WHERE is_active = true AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.project_role_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.project_role_assignments(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  project_role_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('legacy_backfill','assigned','renewed','revoked','expired','reactivated')),
  actor_user_id uuid REFERENCES public.users(id),
  reason text,
  before_snapshot jsonb,
  after_snapshot jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_role_assignment_events_project_time
  ON public.project_role_assignment_events(project_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.pke_project_role_assignment_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_member public.project_members%ROWTYPE;
  v_role public.project_roles%ROWTYPE;
BEGIN
  SELECT * INTO v_member
    FROM public.project_members
   WHERE id = NEW.project_member_id
     AND project_id = NEW.project_id
     AND user_id = NEW.user_id
   FOR KEY SHARE;
  IF NOT FOUND OR v_member.is_active IS DISTINCT FROM true
     OR v_member.deactivated_at IS NOT NULL
     OR (v_member.expires_at IS NOT NULL AND v_member.expires_at <= now()) THEN
    RAISE EXCEPTION 'Active Project membership required for role assignment'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_role
    FROM public.project_roles
   WHERE id = NEW.project_role_id
     AND project_id = NEW.project_id
     AND is_active = true
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active Project role template required'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.revoked_at IS NOT NULL AND
     (NEW.is_active = true OR NEW.revoked_by IS NULL OR
      length(trim(coalesce(NEW.revoke_reason,''))) < 5) THEN
    RAISE EXCEPTION 'Revoked assignments require inactive state, Admin actor, and reason'
      USING ERRCODE = '23514';
  END IF;

  IF v_role.role_code = 'pm' AND NOT public.pke_is_platform_admin() THEN
    RAISE EXCEPTION 'PM role assignment and revocation require an explicit Platform Admin decision'
      USING ERRCODE = '42501';
  END IF;

  IF v_role.role_code = 'pm' AND NEW.is_active = true AND NEW.revoked_at IS NULL
     AND (NEW.expires_at IS NULL OR NEW.expires_at > now()) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.project_id::text || ':pm-appointment', 0));
  END IF;

  IF v_role.role_code = 'pm' AND NEW.is_active = true AND NEW.revoked_at IS NULL
     AND (NEW.expires_at IS NULL OR NEW.expires_at > now())
     AND EXISTS (
       SELECT 1
         FROM public.project_role_assignments other_assignment
         JOIN public.project_roles other_role
           ON other_role.id = other_assignment.project_role_id
          AND other_role.project_id = other_assignment.project_id
        WHERE other_assignment.project_id = NEW.project_id
          AND other_assignment.id <> NEW.id
          AND other_role.role_code = 'pm'
          AND other_assignment.is_active = true
          AND other_assignment.revoked_at IS NULL
          AND (other_assignment.expires_at IS NULL OR other_assignment.expires_at > now())
     ) THEN
    RAISE EXCEPTION 'Only one active PM assignment is allowed per Project; Admin must resolve the existing appointment'
      USING ERRCODE = '23505';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.project_id <> NEW.project_id OR OLD.project_member_id <> NEW.project_member_id
       OR OLD.user_id <> NEW.user_id OR OLD.project_role_id <> NEW.project_role_id THEN
      RAISE EXCEPTION 'Assignment identity is immutable; revoke and create a new assignment'
        USING ERRCODE = '23514';
    END IF;
    IF OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Revoked assignments are immutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.pke_project_role_assignment_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_type := 'assigned';
    INSERT INTO public.project_role_assignment_events
      (assignment_id, project_id, user_id, project_role_id, event_type, actor_user_id, after_snapshot)
    VALUES
      (NEW.id, NEW.project_id, NEW.user_id, NEW.project_role_id, v_type, NEW.assigned_by, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
    v_type := 'revoked';
  ELSIF OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    v_type := 'renewed';
  ELSIF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    v_type := CASE WHEN NEW.is_active THEN 'reactivated' ELSE 'expired' END;
  ELSE
    v_type := 'renewed';
  END IF;

  INSERT INTO public.project_role_assignment_events
    (assignment_id, project_id, user_id, project_role_id, event_type, actor_user_id, reason, before_snapshot, after_snapshot)
  VALUES
    (NEW.id, NEW.project_id, NEW.user_id, NEW.project_role_id, v_type,
     coalesce(NEW.revoked_by, NEW.assigned_by), NEW.revoke_reason, to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.pke_project_role_assignment_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'Project role assignment history is append-only'
    USING ERRCODE = '23514';
END
$function$;

DROP TRIGGER IF EXISTS trg_project_role_assignment_event_immutable ON public.project_role_assignment_events;
CREATE TRIGGER trg_project_role_assignment_event_immutable
BEFORE UPDATE OR DELETE ON public.project_role_assignment_events
FOR EACH ROW EXECUTE FUNCTION public.pke_project_role_assignment_event_immutable();

-- Preserve every existing legacy role assignment, including existing duplicate PM QA fixtures.
-- Backfill runs before runtime triggers are installed; no user-settable migration bypass is needed.
INSERT INTO public.project_role_assignments
  (project_id, project_member_id, user_id, project_role_id, is_active,
   assigned_at, expires_at, revoked_at, revoked_by, revoke_reason)
SELECT pm.project_id, pm.id, pm.user_id, pm.project_role_id,
       (pm.is_active = true AND pm.deactivated_at IS NULL),
       coalesce(pm.joined_at, now()), pm.expires_at,
       CASE WHEN pm.deactivated_by IS NOT NULL THEN pm.deactivated_at ELSE NULL END,
       CASE WHEN pm.deactivated_by IS NOT NULL THEN pm.deactivated_by ELSE NULL END,
       CASE WHEN pm.deactivated_by IS NOT NULL THEN 'Legacy membership deactivation preserved during migration 043' ELSE NULL END
  FROM public.project_members pm
 WHERE pm.project_role_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.project_role_assignments a
      WHERE a.project_member_id = pm.id
        AND a.project_role_id = pm.project_role_id
   );

INSERT INTO public.project_role_assignment_events
  (assignment_id, project_id, user_id, project_role_id, event_type, actor_user_id, reason, after_snapshot)
SELECT a.id, a.project_id, a.user_id, a.project_role_id, 'legacy_backfill',
       a.assigned_by, a.revoke_reason, to_jsonb(a)
  FROM public.project_role_assignments a
 WHERE NOT EXISTS (
   SELECT 1 FROM public.project_role_assignment_events e WHERE e.assignment_id = a.id
 );

-- Runtime enforcement begins only after the legacy backfill has preserved every prior assignment.
DROP TRIGGER IF EXISTS trg_project_role_assignment_guard ON public.project_role_assignments;
CREATE TRIGGER trg_project_role_assignment_guard
BEFORE INSERT OR UPDATE ON public.project_role_assignments
FOR EACH ROW EXECUTE FUNCTION public.pke_project_role_assignment_guard();

DROP TRIGGER IF EXISTS trg_project_role_assignment_event ON public.project_role_assignments;
CREATE TRIGGER trg_project_role_assignment_event
AFTER INSERT OR UPDATE ON public.project_role_assignments
FOR EACH ROW EXECUTE FUNCTION public.pke_project_role_assignment_event();

CREATE OR REPLACE FUNCTION public.pke_has_project_permission(
  p_project_id uuid,
  p_permission_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT public.pke_is_platform_admin()
    OR EXISTS (
      SELECT 1
        FROM public.project_role_assignments a
        JOIN public.project_members pm
          ON pm.id = a.project_member_id
         AND pm.project_id = a.project_id
         AND pm.user_id = a.user_id
        JOIN public.project_roles pr
          ON pr.id = a.project_role_id
         AND pr.project_id = a.project_id
        JOIN public.project_role_permissions prp
          ON prp.project_role_id = pr.id
         AND prp.project_id = pr.project_id
        JOIN public.permissions perm ON perm.id = prp.permission_id
        JOIN public.projects proj ON proj.id = a.project_id
        JOIN public.users u ON u.id = a.user_id
       WHERE a.project_id = p_project_id
         AND a.user_id = NULLIF(current_setting('app.current_user_id', true),'')::uuid
         AND a.is_active = true
         AND a.revoked_at IS NULL
         AND (a.expires_at IS NULL OR a.expires_at > now())
         AND pm.is_active = true
         AND pm.deactivated_at IS NULL
         AND (pm.expires_at IS NULL OR pm.expires_at > now())
         AND pr.is_active = true
         AND proj.is_active = true
         AND u.is_active = true
         AND perm.is_active = true
         AND perm.code = p_permission_code
    )
$function$;

REVOKE ALL ON FUNCTION public.pke_has_project_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_has_project_permission(uuid, text) TO app_runtime_secure;

ALTER TABLE public.project_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_role_assignment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pke_project_role_assignments_select ON public.project_role_assignments;
CREATE POLICY pke_project_role_assignments_select
  ON public.project_role_assignments FOR SELECT TO app_runtime_secure
  USING (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id, 'project.members.view'));

DROP POLICY IF EXISTS pke_project_role_assignments_insert ON public.project_role_assignments;
CREATE POLICY pke_project_role_assignments_insert
  ON public.project_role_assignments FOR INSERT TO app_runtime_secure
  WITH CHECK (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id, 'project.members.manage'));

DROP POLICY IF EXISTS pke_project_role_assignments_update ON public.project_role_assignments;
CREATE POLICY pke_project_role_assignments_update
  ON public.project_role_assignments FOR UPDATE TO app_runtime_secure
  USING (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id, 'project.members.manage'))
  WITH CHECK (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id, 'project.members.manage'));

DROP POLICY IF EXISTS pke_project_role_assignment_events_select ON public.project_role_assignment_events;
CREATE POLICY pke_project_role_assignment_events_select
  ON public.project_role_assignment_events FOR SELECT TO app_runtime_secure
  USING (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id, 'project.members.view'));

GRANT SELECT, INSERT, UPDATE ON public.project_role_assignments TO app_runtime_secure;
GRANT SELECT ON public.project_role_assignment_events TO app_runtime_secure;
REVOKE DELETE ON public.project_role_assignments FROM app_runtime_secure;
REVOKE INSERT, UPDATE, DELETE ON public.project_role_assignment_events FROM app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_project_role_assignment_guard() TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_project_role_assignment_event() TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_project_role_assignment_event_immutable() TO app_runtime_secure;


-- Reconcile every database-side permission/notification/invitation path that
-- previously inferred a single role from project_members.project_role_id.
CREATE OR REPLACE FUNCTION public.pke_has_any_project_permission(p_permission_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT public.pke_is_platform_admin()
    OR EXISTS (
      SELECT 1
        FROM public.project_role_assignments a
        JOIN public.project_members pm
          ON pm.id = a.project_member_id AND pm.project_id = a.project_id AND pm.user_id = a.user_id
        JOIN public.project_roles pr
          ON pr.id = a.project_role_id AND pr.project_id = a.project_id
        JOIN public.project_role_permissions prp
          ON prp.project_role_id = pr.id AND prp.project_id = pr.project_id
        JOIN public.permissions perm ON perm.id = prp.permission_id
        JOIN public.projects proj ON proj.id = a.project_id
        JOIN public.users u ON u.id = a.user_id
       WHERE a.user_id = NULLIF(current_setting('app.current_user_id', true),'')::uuid
         AND a.is_active = true AND a.revoked_at IS NULL
         AND (a.expires_at IS NULL OR a.expires_at > now())
         AND pm.is_active = true AND pm.deactivated_at IS NULL
         AND (pm.expires_at IS NULL OR pm.expires_at > now())
         AND pr.is_active = true AND proj.is_active = true
         AND u.is_active = true AND perm.is_active = true
         AND perm.code = p_permission_code
    )
$function$;

REVOKE ALL ON FUNCTION public.pke_has_any_project_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_has_any_project_permission(text) TO app_runtime_secure;

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
             FROM public.project_role_assignments a
             JOIN public.project_members pm
               ON pm.id = a.project_member_id AND pm.project_id = a.project_id AND pm.user_id = a.user_id
             JOIN public.project_roles pr
               ON pr.id = a.project_role_id AND pr.project_id = a.project_id
             JOIN public.projects project ON project.id = a.project_id
            WHERE a.project_id = p_project_id
              AND a.user_id = recipient.id
              AND a.is_active = true AND a.revoked_at IS NULL
              AND (a.expires_at IS NULL OR a.expires_at > now())
              AND pm.is_active = true AND pm.deactivated_at IS NULL
              AND (pm.expires_at IS NULL OR pm.expires_at > now())
              AND pr.is_active = true AND pr.role_code = 'pm'
              AND project.is_active = true
         )
       )
  )
$function$;

REVOKE ALL ON FUNCTION public.pke_can_receive_finance_report_notification(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_can_receive_finance_report_notification(uuid, uuid) TO app_runtime_secure;

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
    RAISE EXCEPTION 'Finance report permission required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.project_role_assignments a
      JOIN public.project_members pm
        ON pm.id = a.project_member_id AND pm.project_id = a.project_id AND pm.user_id = a.user_id
      JOIN public.project_roles pr
        ON pr.id = a.project_role_id AND pr.project_id = a.project_id
      JOIN public.projects project ON project.id = a.project_id
      JOIN public.users actor ON actor.id = a.user_id
     WHERE a.project_id = p_project_id AND a.user_id = p_actor_id
       AND a.is_active = true AND a.revoked_at IS NULL
       AND (a.expires_at IS NULL OR a.expires_at > now())
       AND pm.is_active = true AND pm.deactivated_at IS NULL
       AND (pm.expires_at IS NULL OR pm.expires_at > now())
       AND pr.is_active = true AND pr.role_code = 'finance'
       AND project.is_active = true AND actor.is_active = true
  ) THEN
    RAISE EXCEPTION 'Only an active Finance Project role assignment can submit reports'
      USING ERRCODE = '42501';
  END IF;

  WITH recipients AS (
    SELECT a.user_id AS recipient_id
      FROM public.project_role_assignments a
      JOIN public.project_members pm
        ON pm.id = a.project_member_id AND pm.project_id = a.project_id AND pm.user_id = a.user_id
      JOIN public.project_roles pr
        ON pr.id = a.project_role_id AND pr.project_id = a.project_id
      JOIN public.projects project ON project.id = a.project_id
      JOIN public.users recipient ON recipient.id = a.user_id
     WHERE a.project_id = p_project_id
       AND a.is_active = true AND a.revoked_at IS NULL
       AND (a.expires_at IS NULL OR a.expires_at > now())
       AND pm.is_active = true AND pm.deactivated_at IS NULL
       AND (pm.expires_at IS NULL OR pm.expires_at > now())
       AND pr.is_active = true AND pr.role_code = 'pm'
       AND project.is_active = true AND recipient.is_active = true
    UNION
    SELECT recipient.id
      FROM public.users recipient
     WHERE recipient.is_active = true AND recipient.role::text = 'admin'
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

CREATE OR REPLACE FUNCTION public.accept_pke_project_invitation(p_token_hash text)
RETURNS TABLE(membership_id uuid, accepted_project_id uuid, accepted_project_role_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_invitation_id uuid;
  v_project_id uuid;
  v_project_role_id uuid;
  v_invited_at timestamptz;
  v_invited_by uuid;
  v_membership_id uuid;
BEGIN
  v_user_id := public.pke_current_user_id();
  IF v_user_id IS NULL OR p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RAISE EXCEPTION 'Invitation is invalid or expired' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.email INTO v_user_email
    FROM public.users u WHERE u.id = v_user_id AND u.is_active = true;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Invitation is invalid or expired' USING ERRCODE = 'P0001';
  END IF;

  SELECT i.id, i.project_id, i.project_role_id, i.invited_at, i.invited_by
    INTO v_invitation_id, v_project_id, v_project_role_id, v_invited_at, v_invited_by
    FROM public.project_invitations i
    JOIN public.projects p ON p.id = i.project_id AND p.is_active = true
    JOIN public.project_roles pr ON pr.id = i.project_role_id AND pr.project_id = i.project_id AND pr.is_active = true
   WHERE i.token_hash = p_token_hash
     AND lower(i.invitation_email) = lower(v_user_email)
     AND i.status = 'pending' AND i.expires_at > now()
   FOR UPDATE OF i;

  IF v_invitation_id IS NULL THEN
    RAISE EXCEPTION 'Invitation is invalid or expired' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.project_members AS pm
    (project_id, user_id, project_role_id, joined_at, is_active, invited_at, updated_at)
  VALUES (v_project_id, v_user_id, NULL, now(), true, v_invited_at, now())
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET is_active = true, deactivated_at = NULL, deactivated_by = NULL,
                expires_at = NULL, updated_at = now()
  RETURNING pm.id INTO v_membership_id;

  INSERT INTO public.project_role_assignments
    (project_id, project_member_id, user_id, project_role_id, is_active, assigned_at, assigned_by)
  SELECT v_project_id, v_membership_id, v_user_id, v_project_role_id, true, now(), v_invited_by
   WHERE NOT EXISTS (
     SELECT 1 FROM public.project_role_assignments existing
      WHERE existing.project_member_id = v_membership_id
        AND existing.project_role_id = v_project_role_id
        AND existing.is_active = true AND existing.revoked_at IS NULL
   );

  UPDATE public.project_invitations
     SET status = 'accepted', accepted_user_id = v_user_id, accepted_at = now()
   WHERE id = v_invitation_id;

  RETURN QUERY SELECT v_membership_id, v_project_id, v_project_role_id;
END
$function$;

REVOKE ALL ON FUNCTION public.accept_pke_project_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_pke_project_invitation(text) TO app_runtime_secure;
