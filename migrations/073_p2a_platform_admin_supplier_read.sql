-- Migration 073: permit Platform Admin to read supplier adapter names for the P2-A Project workspace.
-- UAT only; this adds read access only and does not grant supplier master mutation.
BEGIN;
CREATE POLICY p2a_vendors_platform_admin_read
  ON public.vendors
  FOR SELECT TO app_runtime_secure
  USING (public.pke_is_platform_admin());
COMMIT;
