-- Migration 109: remove self-recursive Buyer row policy.
-- A policy on public.buyers must validate the outer Buyer row directly;
-- querying public.buyers again from its own policy causes infinite RLS recursion.
BEGIN;

DROP POLICY IF EXISTS buyers_verified_mapping_self_read
  ON public.buyers;

CREATE POLICY buyers_verified_mapping_self_read
  ON public.buyers
  FOR SELECT TO app_runtime_secure
  USING (
    is_active IS TRUE
    AND EXISTS (
      SELECT 1
      FROM public.buyer_auth_user_mappings m
      JOIN public.users u
        ON u.id = m.user_id
       AND u.is_active IS TRUE
       AND u.neon_auth_user_id IS NOT NULL
      WHERE m.buyer_id = buyers.id
        AND m.user_id = public.pke_current_user_id()
        AND m.mapping_status = 'active'
    )
  );

COMMENT ON POLICY buyers_verified_mapping_self_read
  ON public.buyers
  IS 'Buyer self-read requires an active outer Buyer row and verified active user mapping; avoids recursive self-query against public.buyers.';

COMMIT;
