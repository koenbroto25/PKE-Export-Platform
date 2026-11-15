-- PKE Migration 023: secure invitation acceptance for an already authenticated PKE identity.
-- Neon Auth account creation/invitation is handled separately; this function only
-- binds an authenticated, email-matched PKE identity to an existing project invitation.

BEGIN;

CREATE OR REPLACE FUNCTION public.accept_pke_project_invitation(p_token_hash text)
RETURNS TABLE (
  membership_id uuid,
  project_id uuid,
  project_role_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_invitation_id uuid;
  v_project_id uuid;
  v_project_role_id uuid;
  v_invited_at timestamptz;
  v_membership_id uuid;
BEGIN
  v_user_id := public.pke_current_user_id();
  IF v_user_id IS NULL OR p_token_hash IS NULL OR length(p_token_hash) <> 64 THEN
    RAISE EXCEPTION 'Invitation is invalid or expired' USING ERRCODE = 'P0001';
  END IF;

  SELECT u.email
    INTO v_user_email
    FROM public.users u
   WHERE u.id = v_user_id AND u.is_active = true;

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Invitation is invalid or expired' USING ERRCODE = 'P0001';
  END IF;

  SELECT i.id, i.project_id, i.project_role_id, i.invited_at
    INTO v_invitation_id, v_project_id, v_project_role_id, v_invited_at
    FROM public.project_invitations i
    JOIN public.projects p ON p.id = i.project_id AND p.is_active = true
    JOIN public.project_roles pr
      ON pr.id = i.project_role_id AND pr.project_id = i.project_id AND pr.is_active = true
   WHERE i.token_hash = p_token_hash
     AND lower(i.invitation_email) = lower(v_user_email)
     AND i.status = 'pending'
     AND i.expires_at > now()
   FOR UPDATE OF i;

  IF v_invitation_id IS NULL THEN
    RAISE EXCEPTION 'Invitation is invalid or expired' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.project_members
    (project_id, user_id, project_role_id, joined_at, is_active, invited_at, updated_at)
  VALUES
    (v_project_id, v_user_id, v_project_role_id, now(), true, v_invited_at, now())
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET
    project_role_id = EXCLUDED.project_role_id,
    is_active = true,
    deactivated_at = NULL,
    deactivated_by = NULL,
    expires_at = NULL,
    updated_at = now()
  RETURNING id INTO v_membership_id;

  UPDATE public.project_invitations
     SET status = 'accepted',
         accepted_user_id = v_user_id,
         accepted_at = now()
   WHERE id = v_invitation_id;

  RETURN QUERY SELECT v_membership_id, v_project_id, v_project_role_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_pke_project_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_pke_project_invitation(text) TO app_runtime_secure;

COMMIT;
