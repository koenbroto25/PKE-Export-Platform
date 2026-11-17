-- RECONSTRUCTED CANDIDATE; INFERRED; NOT AUTHENTIC SOURCE; REVIEW ONLY
-- Historical SHA-256: 6f4425f297202a5618e4914705ea610d2058ef0fe01ebab5468af5824a84fa45
-- Inference: pke_admin_all already covers platform admins; these two predicates
-- redundantly embed pke_is_platform_admin(). Requires policy-owner review.
BEGIN;
ALTER POLICY pke_ai_feedback_select ON public.ai_feedback
  TO app_runtime_secure
  USING (user_id = public.pke_current_user_id());
ALTER POLICY pke_ai_runs_update ON public.ai_runs
  TO app_runtime_secure
  USING (user_id = public.pke_current_user_id())
  WITH CHECK (user_id = public.pke_current_user_id());
COMMIT;
