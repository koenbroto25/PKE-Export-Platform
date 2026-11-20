-- Migration 052: isolate external Project Funders from generic Finance and Reports access.
-- Funder access must be limited to explicitly shared report artifacts. Until a
-- dedicated Funder permission/API/RLS model exists, generic Finance/Accounting/
-- Reports permissions are denied even if legacy role grants remain in the DB.

BEGIN;

DELETE FROM public.project_role_permissions prp
USING public.project_roles pr, public.permissions perm
WHERE prp.project_id = pr.project_id
  AND prp.project_role_id = pr.id
  AND prp.permission_id = perm.id
  AND pr.role_code = 'funder'
  AND (
    perm.code LIKE 'finance.%'
    OR perm.code LIKE 'accounting.%'
    OR perm.code LIKE 'reports.%'
    OR perm.code LIKE 'payment.%'
    OR perm.code IN ('report.view', 'view_financial', 'view_rab')
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
         AND NOT (
           pr.role_code = 'funder'
           AND (
             p_permission_code LIKE 'finance.%'
             OR p_permission_code LIKE 'accounting.%'
             OR p_permission_code LIKE 'reports.%'
             OR p_permission_code LIKE 'payment.%'
             OR p_permission_code IN ('report.view', 'view_financial', 'view_rab')
           )
         )
    )
$function$;

COMMIT;
