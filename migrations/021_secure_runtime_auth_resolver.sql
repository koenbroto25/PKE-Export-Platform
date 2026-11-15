-- PKE Migration 021: enforce least-privilege backend role and identity resolver access.
-- Run only after 017-020. Runtime connections must use app_runtime_secure.

BEGIN;

DO $$
DECLARE
  v_bypass boolean;
  v_super boolean;
  v_createdb boolean;
  v_createrole boolean;
BEGIN
  SELECT rolbypassrls, rolsuper, rolcreatedb, rolcreaterole
    INTO v_bypass, v_super, v_createdb, v_createrole
  FROM pg_roles
  WHERE rolname = 'app_runtime_secure';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'app_runtime_secure is missing';
  END IF;

  IF v_bypass OR v_super OR v_createdb OR v_createrole THEN
    RAISE EXCEPTION 'app_runtime_secure must be NOBYPASSRLS, NOSUPERUSER, NOCREATEDB, NOCREATEROLE';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.resolve_pke_user_by_neon_auth_user_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_pke_user_by_neon_auth_user_id(uuid) FROM app_runtime;
GRANT EXECUTE ON FUNCTION public.resolve_pke_user_by_neon_auth_user_id(uuid) TO app_runtime_secure;

COMMIT;
