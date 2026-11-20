-- Migration 053: Project Admin is read-only for Accounting and Reports.
-- Prepared from the approved role-governance design; Production application requires
-- separate owner approval of this exact SQL artifact and SHA-256.

BEGIN;

CREATE OR REPLACE FUNCTION public.pke_guard_project_admin_accounting_reports_read_only()
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
     AND (
       v_permission_code LIKE 'accounting.%'
       OR v_permission_code LIKE 'reports.%'
       OR v_permission_code = 'report.view'
     )
     AND v_permission_code NOT IN ('accounting.view', 'reports.view', 'report.view') THEN
    RAISE EXCEPTION 'Project Admin is read-only for Accounting and Reports.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.pke_guard_project_admin_accounting_reports_read_only() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_guard_project_admin_accounting_reports_read_only() TO app_runtime_secure;

DROP TRIGGER IF EXISTS pke_project_admin_accounting_reports_read_only_guard
  ON public.project_role_permissions;
CREATE TRIGGER pke_project_admin_accounting_reports_read_only_guard
BEFORE INSERT OR UPDATE OF project_id, project_role_id, permission_id
ON public.project_role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.pke_guard_project_admin_accounting_reports_read_only();

-- Remove Accounting/Reports write and posting grants from every Project Admin role.
-- Preserve only the explicit read-only surface.
DELETE FROM public.project_role_permissions prp
USING public.project_roles pr, public.permissions perm
WHERE prp.project_role_id = pr.id
  AND prp.project_id = pr.project_id
  AND prp.permission_id = perm.id
  AND pr.role_code = 'project_admin'
  AND (
    (perm.code LIKE 'accounting.%' AND perm.code <> 'accounting.view')
    OR (perm.code LIKE 'reports.%' AND perm.code <> 'reports.view')
  );

-- Ensure Project Admin can inspect Accounting and Reports without mutation authority.
INSERT INTO public.project_role_permissions
  (project_id, project_role_id, permission_id, granted_at)
SELECT pr.project_id, pr.id, perm.id, now()
  FROM public.project_roles pr
  JOIN public.permissions perm
    ON perm.code IN ('accounting.view', 'reports.view', 'report.view')
   AND perm.is_active = true
 WHERE pr.role_code = 'project_admin'
ON CONFLICT (project_role_id, permission_id) DO NOTHING;

COMMIT;
