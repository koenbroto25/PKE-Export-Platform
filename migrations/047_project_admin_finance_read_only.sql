-- Migration 047: Finance permissions are Finance-role-only; Project Admin is read-only for Finance.
-- PREPARED ONLY. Do not apply without separate owner approval of this exact SQL and SHA-256.

CREATE OR REPLACE FUNCTION public.pke_guard_finance_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_role_code text;
  v_permission_code text;
BEGIN
  SELECT pr.role_code, perm.code
    INTO v_role_code, v_permission_code
    FROM public.project_roles pr
    JOIN public.permissions perm ON perm.id = NEW.permission_id
   WHERE pr.id = NEW.project_role_id
     AND pr.project_id = NEW.project_id;

  IF v_role_code IS NULL OR v_permission_code IS NULL THEN
    RAISE EXCEPTION 'Project role permission must reference a valid Project role and permission.'
      USING ERRCODE = '23503';
  END IF;

  IF v_role_code = 'project_admin'
     AND v_permission_code LIKE 'finance.%'
     AND v_permission_code <> 'finance.view' THEN
    RAISE EXCEPTION 'Project Admin is read-only for Finance; only finance.view may be assigned.'
      USING ERRCODE = '42501';
  END IF;

  IF v_permission_code IN ('finance.create', 'finance.update', 'finance.delete')
     AND v_role_code <> 'finance' THEN
    RAISE EXCEPTION 'Finance create, update and delete permissions may only be assigned to the Finance Project role.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pke_guard_finance_role_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_guard_finance_role_permissions() TO app_runtime_secure;

DROP TRIGGER IF EXISTS pke_project_role_finance_permission_guard ON public.project_role_permissions;
CREATE TRIGGER pke_project_role_finance_permission_guard
BEFORE INSERT OR UPDATE OF project_id, project_role_id, permission_id
ON public.project_role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.pke_guard_finance_role_permissions();

-- Remove all Finance capabilities from Project Admin except view.
-- Also remove Finance transaction mutation capabilities from every non-Finance role.
DELETE FROM public.project_role_permissions prp
USING public.project_roles pr, public.permissions perm
WHERE prp.project_role_id = pr.id
  AND prp.project_id = pr.project_id
  AND prp.permission_id = perm.id
  AND (
    (pr.role_code = 'project_admin'
      AND perm.code LIKE 'finance.%'
      AND perm.code <> 'finance.view')
    OR
    (pr.role_code <> 'finance'
      AND perm.code IN ('finance.create', 'finance.update', 'finance.delete'))
  );

-- Ensure every Project Admin role retains Finance read access.
INSERT INTO public.project_role_permissions
  (project_id, project_role_id, permission_id, granted_at)
SELECT pr.project_id, pr.id, perm.id, now()
  FROM public.project_roles pr
  JOIN public.permissions perm ON perm.code = 'finance.view' AND perm.is_active = true
 WHERE pr.role_code = 'project_admin'
ON CONFLICT (project_role_id, permission_id) DO NOTHING;

-- Ensure every Finance role has the full Finance transaction capability set.
INSERT INTO public.project_role_permissions
  (project_id, project_role_id, permission_id, granted_at)
SELECT pr.project_id, pr.id, perm.id, now()
  FROM public.project_roles pr
  JOIN public.permissions perm ON perm.code = 'finance.delete' AND perm.is_active = true
 WHERE pr.role_code = 'finance'
ON CONFLICT (project_role_id, permission_id) DO NOTHING;
