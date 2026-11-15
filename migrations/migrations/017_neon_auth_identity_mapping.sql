-- P03: Explicit identity mapping between Neon Managed Auth and PKE users.
-- REVIEW REQUIRED. This file is intentionally NOT applied by the patch script.
-- Existing users remain unlinked until an authorized operator verifies each mapping.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS neon_auth_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS users_neon_auth_user_id_uidx
  ON public.users (neon_auth_user_id)
  WHERE neon_auth_user_id IS NOT NULL;

COMMENT ON COLUMN public.users.neon_auth_user_id IS
  'Verified Neon Managed Auth user UUID. Must be linked explicitly; never auto-match by email.';

-- Narrow identity resolver so a future NOBYPASSRLS runtime role can authenticate
-- before an app.current_user_id transaction context has been established.
-- The function reveals only the mapped PKE principal fields, never password_hash.
CREATE OR REPLACE FUNCTION public.resolve_pke_user_by_neon_auth_user_id(p_neon_auth_user_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  role text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT u.id, u.email, u.name, u.role::text, u.is_active
    FROM public.users AS u
   WHERE u.neon_auth_user_id = p_neon_auth_user_id
     AND u.is_active = true
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.resolve_pke_user_by_neon_auth_user_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_pke_user_by_neon_auth_user_id(uuid) TO app_runtime;

COMMIT;