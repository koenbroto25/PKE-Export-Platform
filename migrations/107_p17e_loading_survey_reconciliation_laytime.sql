-- Migration 107: Project loading survey, ticket reconciliation and laytime evidence lifecycle.
BEGIN;

ALTER TABLE public.loading_operations
  ADD COLUMN IF NOT EXISTS unit_code text;
CREATE UNIQUE INDEX IF NOT EXISTS loading_operations_project_id_uq
  ON public.loading_operations(project_id,id);

CREATE TABLE public.loading_operation_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  loading_operation_id uuid NOT NULL,
  acceptance_type text NOT NULL CHECK(acceptance_type IN ('survey','quantity_reconciliation','laytime')),
  version_no integer NOT NULL DEFAULT 1 CHECK(version_no>0),
  quantity numeric,
  unit_code text,
  quantity_variance numeric,
  notice_of_readiness_at timestamptz,
  laytime_start_at timestamptz,
  laytime_end_at timestamptz,
  allowed_hours numeric,
  excluded_hours numeric NOT NULL DEFAULT 0 CHECK(excluded_hours>=0),
  evidence_object_key text,
  evidence_sha256 text,
  submitted_by uuid NOT NULL REFERENCES public.users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','accepted','rejected','superseded')),
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loading_acceptance_project_operation_fk FOREIGN KEY(project_id,loading_operation_id)
    REFERENCES public.loading_operations(project_id,id) ON DELETE CASCADE,
  CONSTRAINT loading_acceptance_evidence_ck CHECK(
    evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT loading_acceptance_payload_ck CHECK(
    (acceptance_type IN ('survey','quantity_reconciliation') AND quantity IS NOT NULL AND quantity>0
      AND NULLIF(btrim(COALESCE(unit_code,'')),'') IS NOT NULL
      AND NULLIF(btrim(COALESCE(evidence_object_key,'')),'') IS NOT NULL
      AND evidence_sha256 ~ '^[0-9a-f]{64}$')
    OR
    (acceptance_type='laytime' AND notice_of_readiness_at IS NOT NULL
      AND laytime_start_at IS NOT NULL AND laytime_end_at IS NOT NULL
      AND laytime_end_at>=laytime_start_at AND allowed_hours IS NOT NULL AND allowed_hours>=0
      AND NULLIF(btrim(COALESCE(evidence_object_key,'')),'') IS NOT NULL
      AND evidence_sha256 ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT loading_acceptance_review_ck CHECK(
    (review_status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR
    (review_status IN ('accepted','rejected','superseded') AND reviewed_by IS NOT NULL
      AND reviewed_at IS NOT NULL AND reviewed_by<>submitted_by
      AND length(btrim(COALESCE(review_note,'')))>=5)
  ),
  CONSTRAINT loading_acceptance_version_uq UNIQUE(loading_operation_id,acceptance_type,version_no)
);
CREATE INDEX loading_acceptance_project_type_idx
  ON public.loading_operation_acceptances(project_id,loading_operation_id,acceptance_type,review_status,version_no DESC);

INSERT INTO public.permissions(name,code,description,is_active)
VALUES
 ('Review loading survey evidence','shipping.survey.review','Independently review loading survey evidence',true),
 ('Verify laytime evidence','shipping.laytime.verify','Independently verify actual laytime evidence',true),
 ('Reconcile loading quantity','loading.quantity.reconcile','Reconcile verified tickets, segments and loading quantity',true)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_active=true,updated_at=now();

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
VALUES
 ('pm','shipping.survey.review'),('pm','shipping.laytime.verify'),('pm','loading.quantity.reconcile'),
 ('loading_supervisor','loading.quantity.reconcile')
ON CONFLICT(role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,p.id
FROM public.project_roles pr
JOIN public.permissions p ON p.code IN ('shipping.survey.review','shipping.laytime.verify','loading.quantity.reconcile')
WHERE pr.is_active=true AND (
  (pr.role_code='pm' AND p.code IN ('shipping.survey.review','shipping.laytime.verify','loading.quantity.reconcile'))
  OR (pr.role_code='loading_supervisor' AND p.code='loading.quantity.reconcile')
)
ON CONFLICT(project_role_id,permission_id) DO NOTHING;

ALTER TABLE public.loading_operation_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loading_operation_acceptances FORCE ROW LEVEL SECURITY;
CREATE POLICY loading_acceptance_project_read
  ON public.loading_operation_acceptances FOR SELECT TO app_runtime_secure
  USING (
    project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
    AND (public.pke_has_project_permission(project_id,'shipping.view')
      OR public.pke_has_project_permission(project_id,'shipping.survey.view')
      OR public.pke_has_project_permission(project_id,'shipping.laytime.view')
      OR public.pke_has_project_permission(project_id,'loading.quantity.reconcile'))
  );
CREATE POLICY loading_acceptance_project_insert
  ON public.loading_operation_acceptances FOR INSERT TO app_runtime_secure
  WITH CHECK (
    project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
    AND submitted_by=public.pke_current_user_id()
    AND ((acceptance_type='survey' AND public.pke_has_project_permission(project_id,'shipping.survey.submit'))
      OR (acceptance_type='quantity_reconciliation' AND public.pke_has_project_permission(project_id,'loading.quantity.reconcile'))
      OR (acceptance_type='laytime' AND public.pke_has_project_permission(project_id,'shipping.laytime.manage')))
  );
CREATE POLICY loading_acceptance_project_update
  ON public.loading_operation_acceptances FOR UPDATE TO app_runtime_secure
  USING (
    project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
    AND ((acceptance_type='survey' AND public.pke_has_project_permission(project_id,'shipping.survey.review'))
      OR (acceptance_type='quantity_reconciliation' AND public.pke_has_project_permission(project_id,'loading.quantity.reconcile'))
      OR (acceptance_type='laytime' AND public.pke_has_project_permission(project_id,'shipping.laytime.verify')))
  )
  WITH CHECK (
    project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
    AND ((acceptance_type='survey' AND public.pke_has_project_permission(project_id,'shipping.survey.review'))
      OR (acceptance_type='quantity_reconciliation' AND public.pke_has_project_permission(project_id,'loading.quantity.reconcile'))
      OR (acceptance_type='laytime' AND public.pke_has_project_permission(project_id,'shipping.laytime.verify')))
  );
GRANT SELECT,INSERT,UPDATE ON public.loading_operation_acceptances TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.pke_guard_loading_operation_acceptance()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.loading_operation_id IS DISTINCT FROM OLD.loading_operation_id
    OR NEW.acceptance_type IS DISTINCT FROM OLD.acceptance_type
    OR NEW.version_no IS DISTINCT FROM OLD.version_no
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.unit_code IS DISTINCT FROM OLD.unit_code
    OR NEW.quantity_variance IS DISTINCT FROM OLD.quantity_variance
    OR NEW.notice_of_readiness_at IS DISTINCT FROM OLD.notice_of_readiness_at
    OR NEW.laytime_start_at IS DISTINCT FROM OLD.laytime_start_at
    OR NEW.laytime_end_at IS DISTINCT FROM OLD.laytime_end_at
    OR NEW.allowed_hours IS DISTINCT FROM OLD.allowed_hours
    OR NEW.excluded_hours IS DISTINCT FROM OLD.excluded_hours
    OR NEW.evidence_object_key IS DISTINCT FROM OLD.evidence_object_key
    OR NEW.evidence_sha256 IS DISTINCT FROM OLD.evidence_sha256
    OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
  ) THEN
    RAISE EXCEPTION 'Loading acceptance submission is immutable; create a new version'
      USING ERRCODE='23514';
  END IF;
  IF NEW.review_status<>'pending' THEN
    IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL
       OR NEW.reviewed_by=NEW.submitted_by
       OR length(btrim(COALESCE(NEW.review_note,'')))<5 THEN
      RAISE EXCEPTION 'Independent loading acceptance review is required'
        USING ERRCODE='42501';
    END IF;
    IF NEW.acceptance_type='survey' AND NOT public.pke_has_project_permission(NEW.project_id,'shipping.survey.review') THEN
      RAISE EXCEPTION 'Survey reviewer permission required' USING ERRCODE='42501';
    ELSIF NEW.acceptance_type='quantity_reconciliation' AND NOT public.pke_has_project_permission(NEW.project_id,'loading.quantity.reconcile') THEN
      RAISE EXCEPTION 'Quantity reconciliation permission required' USING ERRCODE='42501';
    ELSIF NEW.acceptance_type='laytime' AND NOT public.pke_has_project_permission(NEW.project_id,'shipping.laytime.verify') THEN
      RAISE EXCEPTION 'Laytime verifier permission required' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_loading_operation_acceptance() FROM PUBLIC;
CREATE TRIGGER loading_operation_acceptance_guard
BEFORE INSERT OR UPDATE ON public.loading_operation_acceptances
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_loading_operation_acceptance();

COMMENT ON TABLE public.loading_operation_acceptances IS
'P17-E: versioned, immutable survey, verified ticket quantity reconciliation and laytime evidence with independent review.';

COMMIT;
