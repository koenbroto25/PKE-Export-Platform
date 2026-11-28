-- Migration 116: immutable Field Capture review history and maker-checker decision function.
BEGIN;

CREATE TABLE IF NOT EXISTS public.project_field_capture_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.project_field_capture_submissions(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  reviewer_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('accepted','rejected','needs_review')),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT field_capture_review_reason_required CHECK (decision='accepted' OR length(btrim(reason))>=5)
);

CREATE INDEX IF NOT EXISTS field_capture_review_submission_history_idx
  ON public.project_field_capture_review_events(submission_id,created_at DESC);
CREATE INDEX IF NOT EXISTS field_capture_review_project_history_idx
  ON public.project_field_capture_review_events(project_id,created_at DESC);

ALTER TABLE public.project_field_capture_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_field_capture_review_events FORCE ROW LEVEL SECURITY;
GRANT SELECT ON public.project_field_capture_review_events TO app_runtime_secure;

DROP POLICY IF EXISTS field_capture_review_events_select ON public.project_field_capture_review_events;
CREATE POLICY field_capture_review_events_select ON public.project_field_capture_review_events
  FOR SELECT TO app_runtime_secure
  USING (public.pke_has_project_permission(project_id,'project.tasks.view'));

CREATE OR REPLACE FUNCTION public.pke_review_field_capture_submission(
  p_submission_id uuid,
  p_decision text,
  p_reason text DEFAULT ''
)
RETURNS public.project_field_capture_submissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE
  v_actor uuid:=public.pke_current_user_id();
  v_submission public.project_field_capture_submissions%ROWTYPE;
  v_updated public.project_field_capture_submissions%ROWTYPE;
  v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated reviewer context required' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('accepted','rejected','needs_review') THEN RAISE EXCEPTION 'Invalid Field Capture review decision' USING ERRCODE='23514'; END IF;
  IF p_decision<>'accepted' AND length(v_reason)<5 THEN RAISE EXCEPTION 'A review reason of at least 5 characters is required' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_submission FROM public.project_field_capture_submissions WHERE id=p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Field Capture submission not found' USING ERRCODE='P0002'; END IF;
  IF NOT public.pke_has_project_permission(v_submission.project_id,'project.tasks.resolve') THEN RAISE EXCEPTION 'Missing Project task review permission' USING ERRCODE='42501'; END IF;
  IF v_submission.actor_user_id=v_actor THEN RAISE EXCEPTION 'Maker-checker: submitter cannot review their own Field Capture' USING ERRCODE='42501'; END IF;
  IF v_submission.status IN ('accepted','rejected') THEN RAISE EXCEPTION 'Final Field Capture decision cannot be changed' USING ERRCODE='23514'; END IF;
  UPDATE public.project_field_capture_submissions SET status=p_decision WHERE id=p_submission_id RETURNING * INTO v_updated;
  INSERT INTO public.project_field_capture_review_events(submission_id,project_id,reviewer_user_id,decision,reason)
  VALUES(v_submission.id,v_submission.project_id,v_actor,p_decision,v_reason);
  RETURN v_updated;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.pke_review_field_capture_submission(uuid,text,text) TO app_runtime_secure;

DO $verify$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE proname='pke_review_field_capture_submission') THEN RAISE EXCEPTION 'Field Capture review function missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='project_field_capture_review_events' AND policyname='field_capture_review_events_select') THEN RAISE EXCEPTION 'Field Capture review history RLS missing'; END IF;
END;
$verify$;

COMMIT;
