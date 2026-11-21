-- P16: resolve active Project permission context through a SECURITY DEFINER boundary.
-- Runtime queries must not depend on direct SELECT visibility of role-assignment tables under RLS.

CREATE OR REPLACE FUNCTION public.pke_resolve_project_permission_context(
  p_project_id uuid,
  p_permission_codes text[]
)
RETURNS TABLE (
  project_role_assignment_id uuid,
  project_role_id uuid,
  role_code text,
  permission_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT a.id, pr.id, pr.role_code, perm.code
    FROM public.project_role_assignments a
    JOIN public.project_members pm
      ON pm.id = a.project_member_id
     AND pm.project_id = a.project_id
     AND pm.user_id = a.user_id
    JOIN public.project_roles pr
      ON pr.id = a.project_role_id
     AND pr.project_id = a.project_id
     AND pr.is_active = true
    JOIN public.project_role_permissions prp
      ON prp.project_role_id = pr.id
     AND prp.project_id = pr.project_id
    JOIN public.permissions perm
      ON perm.id = prp.permission_id
     AND perm.is_active = true
    JOIN public.projects proj
      ON proj.id = a.project_id
     AND proj.is_active = true
    JOIN public.users u
      ON u.id = a.user_id
     AND u.is_active = true
   WHERE a.project_id = p_project_id
     AND a.user_id = public.pke_current_user_id()
     AND a.is_active = true
     AND a.revoked_at IS NULL
     AND (a.expires_at IS NULL OR a.expires_at > now())
     AND pm.is_active = true
     AND pm.deactivated_at IS NULL
     AND (pm.expires_at IS NULL OR pm.expires_at > now())
     AND perm.code = ANY(COALESCE(p_permission_codes, ARRAY[]::text[]))
     AND NOT (
       pr.role_code = 'funder'
       AND (
         perm.code LIKE 'finance.%'
         OR perm.code LIKE 'accounting.%'
         OR perm.code LIKE 'reports.%'
         OR perm.code LIKE 'payment.%'
         OR perm.code IN ('report.view', 'view_financial', 'view_rab')
       )
     )
   ORDER BY array_position(p_permission_codes, perm.code), a.assigned_at DESC
   LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.pke_resolve_project_permission_context(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_resolve_project_permission_context(uuid, text[]) TO app_runtime_secure;
