-- Migration 108: remove recursive Buyer mapping RLS dependency.
-- The mapping self-read policy must not query public.buyers because the Buyer
-- self-read policy queries mappings. Buyer activation is enforced by the
-- buyers_verified_mapping_self_read policy on public.buyers itself.
BEGIN;

DROP POLICY IF EXISTS buyer_auth_mapping_self_read
  ON public.buyer_auth_user_mappings;

CREATE POLICY buyer_auth_mapping_self_read
  ON public.buyer_auth_user_mappings
  FOR SELECT TO app_runtime_secure
  USING (
    user_id = public.pke_current_user_id()
    AND mapping_status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = buyer_auth_user_mappings.user_id
        AND u.is_active IS TRUE
        AND u.neon_auth_user_id IS NOT NULL
    )
  );

COMMENT ON POLICY buyer_auth_mapping_self_read
  ON public.buyer_auth_user_mappings
  IS 'Self mapping is visible only for the active authenticated user; Buyer active-state enforcement remains on the Buyer row policy to avoid recursive RLS.';

COMMIT;
