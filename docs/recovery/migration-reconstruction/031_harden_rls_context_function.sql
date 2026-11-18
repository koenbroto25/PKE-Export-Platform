-- RECONSTRUCTED CANDIDATE; NOT AUTHENTIC SOURCE; REVIEW ONLY
-- Historical SHA-256: 90a07b35c9b40758ad33c4e6c28407c341dcdd67310c8ead76fe5fe965bde788
-- Based on pg_get_functiondef() from legacy source branch.
BEGIN;
CREATE OR REPLACE FUNCTION public.set_rls_context(user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF user_id IS NULL THEN
    RAISE EXCEPTION 'RLS context user_id cannot be null'
      USING ERRCODE = '22004';
  END IF;
  PERFORM pg_catalog.set_config('app.current_user_id', user_id::text, true);
  PERFORM pg_catalog.set_config('app.current_role', 'user', true);
  PERFORM pg_catalog.set_config(
    'app.current_project_id',
    '00000000-0000-0000-0000-000000000000',
    true
  );
END;
$function$;
REVOKE ALL PRIVILEGES ON FUNCTION public.set_rls_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_rls_context(uuid) TO app_runtime_secure;
COMMIT;
