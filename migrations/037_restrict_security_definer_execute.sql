-- PKE Migration 037: least-privilege public-schema privilege and execution ACLs.
-- REVIEW REQUIRED. This is a forward-only security correction; it does not reopen
-- or modify migrations 001-036. Do not apply without owner approval of this exact SQL
-- and its SHA-256. Target: the single mandated Neon Production database.
--
-- Finding: Production catalog currently exposes 80 public SECURITY DEFINER functions
-- to PUBLIC and authenticated. It also grants authenticated SELECT/INSERT/UPDATE/DELETE
-- on 153 public relations and carries matching default table/sequence grants. The deployed
-- application accesses business data through the backend as app_runtime_secure; frontend
-- code does not use the Neon Data API for public application relations.
--
-- Correct the global function default ACL (a per-schema REVOKE cannot cancel the
-- built-in global PUBLIC EXECUTE default), remove schema-level authenticated defaults,
-- revoke authenticated access to public application relations/sequences, and retain
-- explicit backend-runtime access to callable SECURITY DEFINER helpers.

BEGIN;

DO $migration$
DECLARE
  f record;
  v_owner oid;
  v_authenticated oid;
BEGIN
  -- Keep catalog resolution and dynamic REVOKE/GRANT statements schema-qualified.
  PERFORM set_config('search_path', 'pg_catalog', true);

  IF current_user <> 'neondb_owner' THEN
    RAISE EXCEPTION 'Migration 037 must run as neondb_owner; current role is %', current_user;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'app_runtime_secure'
      AND rolcanlogin = true
      AND rolsuper = false
      AND rolbypassrls = false
      AND rolcreatedb = false
      AND rolcreaterole = false
  ) THEN
    RAISE EXCEPTION 'Required least-privilege role app_runtime_secure is missing or unsafe';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'Expected Neon Auth role authenticated is missing';
  END IF;

  SELECT oid INTO v_owner FROM pg_roles WHERE rolname = 'neondb_owner';
  SELECT oid INTO v_authenticated FROM pg_roles WHERE rolname = 'authenticated';

  -- The deployed frontend calls the PKE backend API; it does not query public
  -- application tables through Neon Data API. Keep the Neon Auth role isolated
  -- from the public business schema. app_runtime_secure grants are unchanged.
  EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated';
  EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated';

  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
       AND p.proowner <> v_owner
  ) THEN
    RAISE EXCEPTION 'Migration 037 found SECURITY DEFINER functions not owned by neondb_owner';
  END IF;

  -- Existing functions: SECURITY DEFINER routines are private backend internals.
  -- Keep explicit app_runtime_secure execution for callable non-trigger helpers.
  FOR f IN
    SELECT p.oid::regprocedure AS signature,
           (p.prorettype <> 'trigger'::regtype) AS callable
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
     ORDER BY p.oid
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', f.signature);

    IF f.callable THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_runtime_secure', f.signature);
    END IF;
  END LOOP;

  -- Fix the global default, not just the public-schema overlay. PostgreSQL's
  -- global default grants PUBLIC EXECUTE on functions unless revoked globally.
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';

  -- Neon Auth's schema-level default currently grants EXECUTE to authenticated.
  -- Future public-schema functions must be explicitly exposed if a real use case exists.
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated';

  -- Fail atomically if any existing public SECURITY DEFINER function remains
  -- executable by PUBLIC/authenticated or any non-trigger helper lacks runtime EXECUTE.
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
       AND a.privilege_type = 'EXECUTE'
       AND a.grantee IN (0, v_authenticated)
  ) THEN
    RAISE EXCEPTION 'Migration 037 postcondition failed: public/authenticated EXECUTE remains';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
       AND p.prorettype <> 'trigger'::regtype
       AND NOT has_function_privilege('app_runtime_secure', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Migration 037 postcondition failed: app_runtime_secure cannot execute an internal helper';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
     WHERE d.defaclrole = v_owner
       AND d.defaclobjtype = 'f'
       AND d.defaclnamespace IN (0, 'public'::regnamespace)
       AND a.privilege_type = 'EXECUTE'
       AND a.grantee IN (0, v_authenticated)
  ) THEN
    RAISE EXCEPTION 'Migration 037 postcondition failed: unsafe function default ACL remains';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND (
         has_table_privilege('authenticated', c.oid, 'SELECT')
         OR has_table_privilege('authenticated', c.oid, 'INSERT')
         OR has_table_privilege('authenticated', c.oid, 'UPDATE')
         OR has_table_privilege('authenticated', c.oid, 'DELETE')
         OR has_table_privilege('authenticated', c.oid, 'TRUNCATE')
         OR has_table_privilege('authenticated', c.oid, 'REFERENCES')
         OR has_table_privilege('authenticated', c.oid, 'TRIGGER')
       )
  ) THEN
    RAISE EXCEPTION 'Migration 037 postcondition failed: authenticated retains public relation privileges';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'S'
       AND (
         has_sequence_privilege('authenticated', c.oid, 'USAGE')
         OR has_sequence_privilege('authenticated', c.oid, 'SELECT')
         OR has_sequence_privilege('authenticated', c.oid, 'UPDATE')
       )
  ) THEN
    RAISE EXCEPTION 'Migration 037 postcondition failed: authenticated retains public sequence privileges';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
     WHERE d.defaclrole = v_owner
       AND d.defaclnamespace = 'public'::regnamespace
       AND d.defaclobjtype IN ('r', 'S')
       AND a.grantee = v_authenticated
  ) THEN
    RAISE EXCEPTION 'Migration 037 postcondition failed: authenticated public relation defaults remain';
  END IF;
END;
$migration$;

COMMIT;
