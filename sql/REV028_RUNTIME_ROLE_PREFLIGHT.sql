-- Read-only verification for PKE Revision 028.
-- Run against the p03-backend-hardening-test branch as an operator with role visibility.
-- This script does not modify roles, credentials, policies, or application data.

SELECT
  current_database() AS database_name,
  current_user AS inspecting_role,
  r.rolname AS runtime_role,
  r.rolcanlogin AS can_login,
  r.rolsuper AS is_superuser,
  r.rolbypassrls AS bypasses_rls,
  r.rolcreatedb AS can_create_database,
  r.rolcreaterole AS can_create_roles,
  pg_has_role(r.rolname, 'neon_superuser', 'MEMBER') AS has_neon_superuser_membership,
  has_function_privilege(
    r.rolname,
    'public.resolve_pke_user_by_neon_auth_user_id(uuid)',
    'EXECUTE'
  ) AS can_resolve_verified_auth_identity
FROM pg_roles AS r
WHERE r.rolname = 'app_runtime_secure';

SELECT
  r.rolname AS legacy_role,
  r.rolcanlogin AS can_login,
  r.rolbypassrls AS bypasses_rls,
  pg_has_role(r.rolname, 'neon_superuser', 'MEMBER') AS has_neon_superuser_membership,
  (SELECT count(*)::int FROM pg_stat_activity AS a WHERE a.usename = r.rolname) AS active_sessions
FROM pg_roles AS r
WHERE r.rolname = 'app_runtime';

SELECT
  count(*) FILTER (WHERE c.relrowsecurity)::int AS tables_with_rls,
  count(*) FILTER (WHERE c.relkind = 'r')::int AS public_base_tables,
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public') AS public_rls_policies
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';
