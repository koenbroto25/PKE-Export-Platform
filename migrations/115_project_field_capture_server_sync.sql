-- Migration 115: authoritative server-side Field Capture submissions (offline-first sync).
BEGIN;

CREATE TABLE IF NOT EXISTS public.project_field_capture_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  work_item_id uuid NOT NULL REFERENCES public.project_work_items(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  local_capture_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  capture_kind text NOT NULL CHECK (capture_kind IN ('checkpoint','warehouse','inspection','exception')),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 4000),
  captured_at timestamptz NOT NULL,
  latitude numeric(10,7),
  longitude numeric(10,7),
  gps_accuracy_m numeric(10,2),
  gps_captured_at timestamptz,
  evidence_object_key text,
  evidence_sha256 text,
  evidence_size_bytes bigint,
  evidence_mime_type text,
  evidence_original_filename text,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','needs_review','accepted','rejected')),
  server_received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_field_capture_local_id_unique UNIQUE (project_id,actor_user_id,local_capture_id),
  CONSTRAINT project_field_capture_idempotency_unique UNIQUE (project_id,actor_user_id,idempotency_key),
  CONSTRAINT project_field_capture_gps_all_or_none CHECK (
    (latitude IS NULL AND longitude IS NULL AND gps_accuracy_m IS NULL AND gps_captured_at IS NULL) OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND gps_accuracy_m>0 AND gps_captured_at IS NOT NULL)
  ),
  CONSTRAINT project_field_capture_evidence_all_or_none CHECK (
    (evidence_object_key IS NULL AND evidence_sha256 IS NULL AND evidence_size_bytes IS NULL AND evidence_mime_type IS NULL AND evidence_original_filename IS NULL) OR
    (evidence_object_key IS NOT NULL AND evidence_sha256 ~ '^[0-9a-f]{64}$' AND evidence_size_bytes BETWEEN 1 AND 15728640 AND evidence_mime_type IN ('image/jpeg','image/png','image/webp') AND length(btrim(evidence_original_filename))>0)
  ),
  CONSTRAINT project_field_capture_evidence_project_namespace CHECK (
    evidence_object_key IS NULL OR evidence_object_key LIKE ('projects/'||project_id::text||'/field-captures/'||local_capture_id::text||'/%')
  )
);

CREATE INDEX IF NOT EXISTS project_field_capture_project_received_idx
  ON public.project_field_capture_submissions(project_id,server_received_at DESC);
CREATE INDEX IF NOT EXISTS project_field_capture_work_item_received_idx
  ON public.project_field_capture_submissions(work_item_id,server_received_at DESC);
CREATE INDEX IF NOT EXISTS project_field_capture_actor_project_idx
  ON public.project_field_capture_submissions(actor_user_id,project_id,server_received_at DESC);

ALTER TABLE public.project_field_capture_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_field_capture_submissions FORCE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON public.project_field_capture_submissions TO app_runtime_secure;

DROP POLICY IF EXISTS project_field_capture_select ON public.project_field_capture_submissions;
CREATE POLICY project_field_capture_select ON public.project_field_capture_submissions
  FOR SELECT TO app_runtime_secure
  USING (
    actor_user_id=public.pke_current_user_id()
    OR public.pke_has_project_permission(project_id,'project.tasks.view')
  );

DROP POLICY IF EXISTS project_field_capture_insert ON public.project_field_capture_submissions;
CREATE POLICY project_field_capture_insert ON public.project_field_capture_submissions
  FOR INSERT TO app_runtime_secure
  WITH CHECK (
    actor_user_id=public.pke_current_user_id()
    AND public.pke_has_project_permission(project_id,'project.tasks.update')
    AND EXISTS (
      SELECT 1 FROM public.project_work_items wi
      WHERE wi.id=project_field_capture_submissions.work_item_id AND wi.project_id=project_field_capture_submissions.project_id
        AND wi.assignee_user_id=project_field_capture_submissions.actor_user_id
        AND wi.status NOT IN ('resolved','closed','cancelled')
    )
  );

COMMENT ON TABLE public.project_field_capture_submissions IS
  'Immutable server-accepted Field Capture submissions. Local offline drafts are not authoritative until a row is created after task-scope and evidence verification.';

COMMIT;
