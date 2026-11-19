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
  IF coalesce(current_setting('app.migration_context', true), '') = '043' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

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

DROP TRIGGER IF EXISTS trg_project_role_assignment_guard ON public.project_role_assignments;
CREATE TRIGGER trg_project_role_assignment_guard
BEFORE INSERT OR UPDATE ON public.project_role_assignments
FOR EACH ROW EXECUTE FUNCTION public.pke_project_role_assignment_guard();

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
    v_type := CASE WHEN coalesce(current_setting('app.migration_context', true), '') = '043' THEN 'legacy_backfill' ELSE 'assigned' END;
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

DROP TRIGGER IF EXISTS trg_project_role_assignment_event ON public.project_role_assignments;
CREATE TRIGGER trg_project_role_assignment_event
AFTER INSERT OR UPDATE ON public.project_role_assignments
FOR EACH ROW EXECUTE FUNCTION public.pke_project_role_assignment_event();

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

-- Preserve every existing legacy role assignment; do not resolve PM conflicts here.
SELECT set_config('app.migration_context', '043', true);
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
