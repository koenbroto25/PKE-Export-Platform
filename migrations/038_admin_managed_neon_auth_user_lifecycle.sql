-- Migration 038: Admin-managed global user lifecycle and verified Neon Auth identity linking.
-- Additive only. Must be applied only after owner approval of this exact SQL and SHA-256.
-- All functions are SECURITY DEFINER with a pinned search_path and narrow EXECUTE grants.

CREATE OR REPLACE FUNCTION public.pke_admin_list_users(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  email text,
  name text,
  role text,
  is_active boolean,
  neon_auth_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT public.pke_is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT u.id, u.email, u.name, u.role::text, u.is_active,
           u.neon_auth_user_id, u.created_at, u.updated_at
      FROM public.users AS u
     ORDER BY u.created_at DESC, u.id
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$function$;


CREATE OR REPLACE FUNCTION public.pke_admin_get_user(
  p_user_id uuid
)
RETURNS TABLE (
  user_id uuid,
  email text,
  name text,
  role text,
  is_active boolean,
  neon_auth_user_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT public.pke_is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email, u.name, u.role::text, u.is_active,
           u.neon_auth_user_id, u.created_at, u.updated_at
      FROM public.users AS u
     WHERE u.id = p_user_id
     LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pke_admin_provision_user(
  p_email text,
  p_name text,
  p_reason text
)
RETURNS TABLE (
  user_id uuid,
  email text,
  name text,
  role text,
  is_active boolean,
  neon_auth_user_id uuid,
  provisioning_state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor_id uuid := public.pke_current_user_id();
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_name text := btrim(COALESCE(p_name, ''));
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_user public.users%ROWTYPE;
  v_count integer;
BEGIN
  IF NOT public.pke_is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin required' USING ERRCODE = '42501';
  END IF;
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'admin actor context is required' USING ERRCODE = '42501';
  END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'valid email is required' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 160 THEN
    RAISE EXCEPTION 'name length must be 2 to 160 characters' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 5 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'audit reason length must be 5 to 500 characters' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_count
    FROM public.users AS existing_user
   WHERE lower(existing_user.email) = v_email;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'email matches multiple existing PKE accounts' USING ERRCODE = '23505';
  END IF;

  SELECT existing_user.* INTO v_user
    FROM public.users AS existing_user
   WHERE lower(existing_user.email) = v_email
   FOR UPDATE;

  IF FOUND THEN
    IF v_user.neon_auth_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'email is already linked to an Auth identity' USING ERRCODE = '23505';
    END IF;
    IF v_user.is_active IS DISTINCT FROM false OR v_user.password_hash IS NOT NULL THEN
      RAISE EXCEPTION 'existing PKE account is not an eligible pending account' USING ERRCODE = '23505';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.approval_events ae
       WHERE ae.entity_type = 'user'
         AND ae.entity_id = v_user.id
         AND ae.action = 'admin_user_provisioned'
         AND ae.status = 'pending'
    ) THEN
      RAISE EXCEPTION 'pending account lacks its provisioning audit record' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT v_user.id, v_user.email, v_user.name, v_user.role::text,
                        v_user.is_active, v_user.neon_auth_user_id, 'pending_auth'::text;
    RETURN;
  END IF;

  INSERT INTO public.users (email, name, role, password_hash, is_active, created_at, updated_at)
  VALUES (v_email, v_name, 'viewer', NULL, false, now(), now())
  RETURNING * INTO v_user;

  INSERT INTO public.approval_events
    (entity_type, entity_id, action, approved_by, status, project_id, created_at, updated_at)
  VALUES
    ('user', v_user.id, 'admin_user_provisioned', v_actor_id, 'pending', NULL, now(), now());

  RETURN QUERY SELECT v_user.id, v_user.email, v_user.name, v_user.role::text,
                      v_user.is_active, v_user.neon_auth_user_id, 'pending_auth'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pke_is_preprovisioned_email(
  p_email text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.users u
      JOIN public.approval_events ae
        ON ae.entity_type = 'user'
       AND ae.entity_id = u.id
       AND ae.action = 'admin_user_provisioned'
       AND ae.status = 'pending'
     WHERE lower(u.email) = lower(btrim(COALESCE(p_email, '')))
       AND u.neon_auth_user_id IS NULL
       AND u.is_active = false
       AND u.password_hash IS NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.pke_link_neon_auth_identity_from_webhook(
  p_neon_auth_user_id uuid,
  p_email text,
  p_name text,
  p_event_id uuid
)
RETURNS TABLE (
  user_id uuid,
  link_state text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_name text := btrim(COALESCE(p_name, ''));
  v_user public.users%ROWTYPE;
  v_count integer;
  v_actor_id uuid;
BEGIN
  IF p_neon_auth_user_id IS NULL OR p_event_id IS NULL THEN
    RAISE EXCEPTION 'Auth user id and event id are required' USING ERRCODE = '22023';
  END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'valid email is required' USING ERRCODE = '22023';
  END IF;

  -- Idempotent replay: the exact provider identity is already linked.
  SELECT * INTO v_user
    FROM public.users
   WHERE neon_auth_user_id = p_neon_auth_user_id
   LIMIT 1;
  IF FOUND THEN
    IF lower(v_user.email) <> v_email THEN
      RAISE EXCEPTION 'Auth identity is already linked to a different email' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT v_user.id, 'already_linked'::text;
    RETURN;
  END IF;

  SELECT count(*)::integer INTO v_count
    FROM public.users
   WHERE lower(email) = v_email;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'exactly one pre-provisioned PKE account is required' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_user
    FROM public.users
   WHERE lower(email) = v_email
   FOR UPDATE;

  IF v_user.neon_auth_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'PKE account is already linked to a different Auth identity' USING ERRCODE = '23505';
  END IF;
  IF v_user.is_active IS DISTINCT FROM false OR v_user.password_hash IS NOT NULL THEN
    RAISE EXCEPTION 'PKE account is not in the eligible pending state' USING ERRCODE = '23514';
  END IF;

  SELECT ae.approved_by INTO v_actor_id
    FROM public.approval_events ae
   WHERE ae.entity_type = 'user'
     AND ae.entity_id = v_user.id
     AND ae.action = 'admin_user_provisioned'
     AND ae.status = 'pending'
   ORDER BY ae.created_at DESC
   LIMIT 1;
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'pending PKE provisioning audit record was not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.users
     SET neon_auth_user_id = p_neon_auth_user_id,
         name = COALESCE(NULLIF(v_name, ''), name),
         updated_at = now()
   WHERE id = v_user.id
     AND neon_auth_user_id IS NULL
     AND is_active = false
     AND password_hash IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pending PKE account changed during identity linking' USING ERRCODE = '40001';
  END IF;

  UPDATE public.approval_events
     SET status = 'succeeded', updated_at = now()
   WHERE entity_type = 'user'
     AND entity_id = v_user.id
     AND action = 'admin_user_provisioned'
     AND status = 'pending';

  INSERT INTO public.approval_events
    (entity_type, entity_id, action, approved_by, status, project_id, created_at, updated_at)
  VALUES
    ('user', v_user.id, 'neon_auth_identity_linked:' || p_event_id::text,
     v_actor_id, 'succeeded', NULL, now(), now());

  RETURN QUERY SELECT v_user.id, 'linked'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pke_admin_set_user_active(
  p_user_id uuid,
  p_is_active boolean,
  p_reason text
)
RETURNS TABLE (
  user_id uuid,
  is_active boolean,
  neon_auth_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor_id uuid := public.pke_current_user_id();
  v_user public.users%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF NOT public.pke_is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin required' USING ERRCODE = '42501';
  END IF;
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'admin actor context is required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_is_active IS NULL THEN
    RAISE EXCEPTION 'user id and active state are required' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) < 5 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'audit reason length must be 5 to 500 characters' USING ERRCODE = '22023';
  END IF;
  IF p_user_id = v_actor_id AND p_is_active = false THEN
    RAISE EXCEPTION 'admin cannot deactivate their own account' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PKE user not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_is_active AND v_user.neon_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'verified Neon Auth identity is required before activation' USING ERRCODE = '23514';
  END IF;

  IF v_user.is_active IS DISTINCT FROM p_is_active THEN
    UPDATE public.users SET is_active = p_is_active, updated_at = now()
     WHERE id = p_user_id;

    INSERT INTO public.approval_events
      (entity_type, entity_id, action, approved_by, status, project_id, created_at, updated_at)
    VALUES
      ('user', p_user_id,
       CASE WHEN p_is_active THEN 'global_user_activated' ELSE 'global_user_deactivated' END,
       v_actor_id, 'succeeded', NULL, now(), now());
  END IF;

  RETURN QUERY SELECT p_user_id, p_is_active, v_user.neon_auth_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.pke_admin_list_users(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pke_admin_get_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pke_admin_provision_user(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pke_link_neon_auth_identity_from_webhook(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pke_is_preprovisioned_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pke_admin_set_user_active(uuid, boolean, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.pke_admin_list_users(integer, integer) TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_admin_get_user(uuid) TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_admin_provision_user(text, text, text) TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_link_neon_auth_identity_from_webhook(uuid, text, text, uuid) TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_is_preprovisioned_email(text) TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_admin_set_user_active(uuid, boolean, text) TO app_runtime_secure;
