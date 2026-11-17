-- READ-ONLY VERIFICATION QUERIES FOR HISTORICAL MIGRATIONS 029-035
-- SELECT statements only. Run using an authorized read-only inspection identity.
-- Do not paste credentials or connection strings into logs.

-- 1) Historical migration records and checksums.
SELECT id, filename, sha256, status
FROM public.migration_history
WHERE id BETWEEN 29 AND 35
ORDER BY id;

-- 2) RLS coverage and FORCE RLS.
SELECT count(*) AS public_tables,
       count(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled,
       count(*) FILTER (WHERE c.relforcerowsecurity) AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r';

-- 3) Unvalidated foreign keys (expected 0 in the inspected legacy child).
SELECT conrelid::regclass AS table_name, conname,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace='public'::regnamespace
  AND contype='f' AND NOT convalidated
ORDER BY 1,2;

-- 4) Five FK validations associated with migration 030.
SELECT conrelid::regclass AS table_name, conname,
       convalidated, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
 'buyers_country_code_fkey',
 'pks_sites_country_code_fkey',
 'ports_country_code_fkey',
 'project_members_project_role_same_project_fkey',
 'projects_export_country_code_fkey'
)
ORDER BY 1,2;

-- 5) set_rls_context function security attributes.
SELECT p.oid::regprocedure AS signature,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       has_function_privilege('public',p.oid,'EXECUTE') AS public_execute,
       has_function_privilege('app_runtime_secure',p.oid,'EXECUTE') AS runtime_execute,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='set_rls_context';

-- 6) Trigger-function EXECUTE privilege hardening (expected 0/0).
SELECT count(*) AS trigger_functions,
       count(*) FILTER (WHERE has_function_privilege('public',p.oid,'EXECUTE')) AS public_execute,
       count(*) FILTER (WHERE has_function_privilege('app_runtime_secure',p.oid,'EXECUTE')) AS runtime_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prorettype='trigger'::regtype;

-- 7) Reference data seeded by migration 032.
SELECT country_code,country_name,is_active
FROM public.countries WHERE country_code IN ('CN','ID','PK')
ORDER BY country_code;
SELECT code,name,is_functional,is_active
FROM public.currencies WHERE code IN ('CNY','IDR','PKR','USD')
ORDER BY code;

-- 8) AI and regulatory policy state; use to review migration 035 and cumulative delta.
SELECT tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies
WHERE schemaname='public'
  AND (tablename IN ('ai_feedback','ai_runs')
       OR (tablename='regulatory_sources' AND policyname='pke_regulatory_sources_read'))
ORDER BY tablename,policyname;

-- 9) Runtime table privileges on migration_history (expected no INSERT/UPDATE/DELETE).
SELECT privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name='migration_history'
  AND grantee='app_runtime_secure'
ORDER BY privilege_type;
