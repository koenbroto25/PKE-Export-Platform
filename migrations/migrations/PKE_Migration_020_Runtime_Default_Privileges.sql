-- PKE Export Platform
-- Migration 020: secure runtime defaults for objects created by neondb_owner
-- Prepared after inspecting isolated branch p03-backend-hardening-test.
-- This migration does NOT enable RLS automatically on future tables. Every new
-- table still requires an explicit RLS policy and release validation.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime_secure') THEN
    RAISE EXCEPTION 'Required role app_runtime_secure does not exist';
  END IF;

  IF NOT pg_has_role(current_user, 'neondb_owner', 'MEMBER') THEN
    RAISE EXCEPTION 'Migration must be run by neondb_owner or a role allowed to alter its default privileges';
  END IF;
END;
$$;

-- The old default ACL granted new public tables to app_runtime. That role has
-- BYPASSRLS on the audited branch and must not receive privileges on new tables.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  REVOKE ALL ON TABLES FROM app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM app_runtime;

-- New objects created by the migration owner are usable by the restricted API role.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime_secure;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime_secure;

-- Avoid inheriting PUBLIC EXECUTE on newly created functions. Each function
-- required by the API must receive a narrowly scoped explicit GRANT in its migration.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
