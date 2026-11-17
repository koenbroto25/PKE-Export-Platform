-- 036_validate_production_schema_invariants.sql
-- Read-only validation gate. No DDL/DML and no business-data changes.
DO $migration$
DECLARE
  v_public_tables integer;
  v_rls_tables integer;
  v_unvalidated_fks integer;
  v_missing_policy_tables integer;
  v_bad_definer_functions integer;
  v_runtime_ok boolean;
  v_history_max integer;
  v_history_count integer;
BEGIN
  SELECT count(*) INTO v_public_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p');

  SELECT count(*) INTO v_rls_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity;

  IF v_public_tables = 0 OR v_public_tables <> v_rls_tables THEN
    RAISE EXCEPTION '036 invariant failed: public tables %, RLS-enabled tables %', v_public_tables, v_rls_tables;
  END IF;

  SELECT count(*) INTO v_missing_policy_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid);

  IF v_missing_policy_tables <> 0 THEN
    RAISE EXCEPTION '036 invariant failed: % RLS tables have no policies', v_missing_policy_tables;
  END IF;

  SELECT count(*) INTO v_unvalidated_fks
  FROM pg_constraint WHERE contype='f' AND NOT convalidated;

  IF v_unvalidated_fks <> 0 THEN
    RAISE EXCEPTION '036 invariant failed: % unvalidated foreign keys', v_unvalidated_fks;
  END IF;

  SELECT count(*) INTO v_bad_definer_functions
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
      WHERE cfg LIKE 'search_path=%'
    );

  IF v_bad_definer_functions <> 0 THEN
    RAISE EXCEPTION '036 invariant failed: % SECURITY DEFINER functions lack fixed search_path', v_bad_definer_functions;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='app_runtime_secure'
      AND NOT rolsuper AND NOT rolbypassrls
      AND NOT rolcreatedb AND NOT rolcreaterole AND rolcanlogin
  ) INTO v_runtime_ok;

  IF NOT v_runtime_ok THEN
    RAISE EXCEPTION '036 invariant failed: app_runtime_secure missing or has unsafe role attributes';
  END IF;

  SELECT count(*), COALESCE(max(id),0) INTO v_history_count, v_history_max
  FROM public.migration_history;

  IF v_history_count <> 35 OR v_history_max <> 35 THEN
    RAISE EXCEPTION '036 invariant failed: expected exactly migrations 001-035; found count %, max id %', v_history_count, v_history_max;
  END IF;
END
$migration$;
