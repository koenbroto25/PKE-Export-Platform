-- Migration 056: Project context access and explicitly shared Funder reports.
BEGIN;

-- Finance, Accounting and Funder need basic Project context only. This does not
-- confer access to Finance, Accounting, payment or internal report records.
INSERT INTO public.permissions (name, code, description, is_active, created_at, updated_at)
VALUES ('Funder Shared Reports View', 'funder.view',
        'Read only report artifacts explicitly shared with this Funder in this Project.', true, now(), now())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description,
    is_active = true, updated_at = now();

INSERT INTO public.pke_project_role_permission_allowlist (role_code, permission_code)
VALUES ('finance','project.view'),('accounting','project.view'),
       ('funder','project.view'),('funder','funder.view')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Apply the narrowly-scoped permissions to already-installed Project role rows.
INSERT INTO public.project_role_permissions (project_id, project_role_id, permission_id, granted_at)
SELECT pr.project_id, pr.id, perm.id, now()
  FROM public.project_roles pr
  JOIN public.permissions perm
    ON perm.is_active = true
   AND (
     (pr.role_code IN ('finance','accounting','funder') AND perm.code='project.view')
     OR (pr.role_code='funder' AND perm.code='funder.view')
   )
ON CONFLICT (project_role_id, permission_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.project_funder_report_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  report_run_id uuid NOT NULL REFERENCES public.report_runs(id) ON DELETE RESTRICT,
  funder_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  shared_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  shared_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revoke_reason text,
  CONSTRAINT project_funder_report_shares_revoke_state CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL)
    OR
    (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND length(trim(coalesce(revoke_reason,''))) >= 5)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS project_funder_report_shares_active_uq
  ON public.project_funder_report_shares (project_id, report_run_id, funder_user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS project_funder_report_shares_funder_idx
  ON public.project_funder_report_shares (funder_user_id, project_id, shared_at DESC)
  WHERE revoked_at IS NULL;

REVOKE ALL ON public.project_funder_report_shares FROM PUBLIC, app_runtime, app_runtime_secure;
GRANT SELECT, INSERT, UPDATE ON public.project_funder_report_shares TO app_runtime_secure;
ALTER TABLE public.project_funder_report_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_funder_report_shares FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pke_project_funder_report_shares_select ON public.project_funder_report_shares;
CREATE POLICY pke_project_funder_report_shares_select
ON public.project_funder_report_shares FOR SELECT TO app_runtime_secure
USING (
  (
    funder_user_id = public.pke_current_user_id()
    AND revoked_at IS NULL
    AND public.pke_has_project_permission(project_id, 'funder.view')
  )
  OR public.pke_has_project_permission(project_id, 'project.members.manage')
);

DROP POLICY IF EXISTS pke_project_funder_report_shares_insert ON public.project_funder_report_shares;
CREATE POLICY pke_project_funder_report_shares_insert
ON public.project_funder_report_shares FOR INSERT TO app_runtime_secure
WITH CHECK (
  public.pke_has_project_permission(project_id, 'project.members.manage')
  AND shared_by = public.pke_current_user_id()
);

DROP POLICY IF EXISTS pke_project_funder_report_shares_update ON public.project_funder_report_shares;
CREATE POLICY pke_project_funder_report_shares_update
ON public.project_funder_report_shares FOR UPDATE TO app_runtime_secure
USING (public.pke_has_project_permission(project_id, 'project.members.manage'))
WITH CHECK (public.pke_has_project_permission(project_id, 'project.members.manage'));

-- A share can only target an active Funder assignment and a completed private
-- report artifact belonging to the same Project. Share identity is immutable.
CREATE OR REPLACE FUNCTION public.pke_guard_project_funder_report_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.shared_by IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'Funder report share actor must match the authenticated principal.'
        USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.report_runs rr
       WHERE rr.id = NEW.report_run_id
         AND rr.project_id = NEW.project_id
         AND rr.status = 'completed'
         AND NULLIF(btrim(rr.file_reference), '') IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Only a completed report artifact from the same Project can be shared.'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
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
          ON prp.project_id = a.project_id
         AND prp.project_role_id = pr.id
        JOIN public.permissions perm
          ON perm.id = prp.permission_id
         AND perm.code = 'funder.view'
         AND perm.is_active = true
       WHERE a.project_id = NEW.project_id
         AND a.user_id = NEW.funder_user_id
         AND a.is_active = true
         AND a.revoked_at IS NULL
         AND (a.expires_at IS NULL OR a.expires_at > now())
         AND pm.is_active = true
         AND pm.deactivated_at IS NULL
         AND (pm.expires_at IS NULL OR pm.expires_at > now())
         AND pr.role_code = 'funder'
         AND pr.is_active = true
    ) THEN
      RAISE EXCEPTION 'Share recipient must have an active Funder assignment with funder.view.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.project_id IS DISTINCT FROM NEW.project_id
     OR OLD.report_run_id IS DISTINCT FROM NEW.report_run_id
     OR OLD.funder_user_id IS DISTINCT FROM NEW.funder_user_id
     OR OLD.shared_by IS DISTINCT FROM NEW.shared_by
     OR OLD.shared_at IS DISTINCT FROM NEW.shared_at THEN
    RAISE EXCEPTION 'Funder report share identity is immutable.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.revoked_at IS NOT NULL
     OR NEW.revoked_at IS NULL
     OR NEW.revoked_by IS DISTINCT FROM public.pke_current_user_id()
     OR length(trim(coalesce(NEW.revoke_reason,''))) < 5 THEN
    RAISE EXCEPTION 'Funder report shares may only be revoked once with an authenticated actor and reason.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pke_guard_project_funder_report_share() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_guard_project_funder_report_share() TO app_runtime_secure;
DROP TRIGGER IF EXISTS pke_project_funder_report_share_guard ON public.project_funder_report_shares;
CREATE TRIGGER pke_project_funder_report_share_guard
BEFORE INSERT OR UPDATE ON public.project_funder_report_shares
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_project_funder_report_share();

-- The Funder can read only report runs explicitly shared with their own account.
DROP POLICY IF EXISTS pke_report_runs_funder_shared_select ON public.report_runs;
CREATE POLICY pke_report_runs_funder_shared_select
ON public.report_runs FOR SELECT TO app_runtime_secure
USING (
  project_id IS NOT NULL
  AND public.pke_has_project_permission(project_id, 'funder.view')
  AND EXISTS (
    SELECT 1 FROM public.project_funder_report_shares share
     WHERE share.report_run_id = report_runs.id
       AND share.project_id = report_runs.project_id
       AND share.funder_user_id = public.pke_current_user_id()
       AND share.revoked_at IS NULL
  )
);

DO $post$
DECLARE
  v_missing integer;
BEGIN
  SELECT count(*) INTO v_missing
    FROM (VALUES ('finance','project.view'),('accounting','project.view'),
                 ('funder','project.view'),('funder','funder.view')) required(role_code,permission_code)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.pke_project_role_permission_allowlist a
      WHERE a.role_code=required.role_code AND a.permission_code=required.permission_code
   );
  IF v_missing <> 0 THEN
    RAISE EXCEPTION 'Project context/Funder allowlist incomplete: % missing.', v_missing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE code='funder.view' AND is_active=true) THEN
    RAISE EXCEPTION 'funder.view permission is missing or inactive.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname='public' AND tablename='report_runs'
       AND policyname='pke_report_runs_funder_shared_select'
       AND cmd='SELECT'
  ) THEN
    RAISE EXCEPTION 'Funder report RLS policy is missing.';
  END IF;
END;
$post$;

COMMIT;
