-- Migration 111: P18 regulatory source/rule governance and immutable approval lifecycle.
-- Candidate only: requires reviewed release approval before any Production application.
BEGIN;

ALTER TABLE public.regulatory_sources
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);
ALTER TABLE public.regulatory_rule_versions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);

INSERT INTO public.permissions(name,code,description,is_active)
VALUES
 ('View Regulatory Sources','regulatory.source.view','View verified regulatory source metadata and reviewable drafts.',true),
 ('Manage Regulatory Sources','regulatory.source.manage','Create and maintain regulatory source metadata and submit verification for independent review.',true),
 ('View Regulatory Rules','regulatory.rule.view','View approved/effective regulatory rules and their versions.',true),
 ('Manage Regulatory Rules','regulatory.rule.manage','Create and maintain regulatory rule lifecycle and independent review decisions.',true),
 ('Create Regulatory Rule Versions','regulatory.rule.version.create','Create immutable draft versions of regulatory rules.',true),
 ('Assess Regulatory Compliance','compliance.assess','Run and persist Project-scoped deterministic regulatory assessments.',true),
 ('View Regulatory Compliance','compliance.view','View Project-scoped regulatory assessments and results.',true)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_active=true;

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
SELECT 'regulatory_compliance_officer',p.code
FROM public.permissions p
WHERE p.code IN ('project.view','documents.view','compliance.view','compliance.assess',
 'regulatory.source.view','regulatory.source.manage','regulatory.rule.view',
 'regulatory.rule.manage','regulatory.rule.version.create')
ON CONFLICT(role_code,permission_code) DO NOTHING;

DROP POLICY IF EXISTS pke_regulatory_sources_read ON public.regulatory_sources;
CREATE POLICY pke_regulatory_sources_read ON public.regulatory_sources
FOR SELECT TO app_runtime_secure
USING (
  (verification_status IN ('verified','approved') AND (
    public.pke_has_any_project_permission('regulatory.source.view')
    OR public.pke_has_any_project_permission('regulatory.rule.view')
    OR public.pke_has_any_project_permission('compliance.view')
  ))
  OR public.pke_has_any_project_permission('regulatory.source.manage')
);

DROP POLICY IF EXISTS p18_regulatory_sources_insert ON public.regulatory_sources;
CREATE POLICY p18_regulatory_sources_insert ON public.regulatory_sources
FOR INSERT TO app_runtime_secure
WITH CHECK (
  public.pke_has_any_project_permission('regulatory.source.manage')
  AND verification_status='pending' AND status='draft'
  AND reviewer_id IS NULL
  AND (created_by IS NULL OR created_by=public.pke_current_user_id())
);

DROP POLICY IF EXISTS p18_regulatory_sources_update ON public.regulatory_sources;
CREATE POLICY p18_regulatory_sources_update ON public.regulatory_sources
FOR UPDATE TO app_runtime_secure
USING (public.pke_has_any_project_permission('regulatory.source.manage'))
WITH CHECK (public.pke_has_any_project_permission('regulatory.source.manage'));

DROP POLICY IF EXISTS pke_scope_select ON public.regulatory_rules;
CREATE POLICY pke_scope_select ON public.regulatory_rules
FOR SELECT TO app_runtime_secure
USING (
  (status IN ('approved','effective') AND (
    public.pke_has_any_project_permission('regulatory.rule.view')
    OR public.pke_has_any_project_permission('compliance.view')
  ))
  OR public.pke_has_any_project_permission('regulatory.rule.manage')
);

DROP POLICY IF EXISTS p18_regulatory_rules_insert ON public.regulatory_rules;
CREATE POLICY p18_regulatory_rules_insert ON public.regulatory_rules
FOR INSERT TO app_runtime_secure
WITH CHECK (public.pke_has_any_project_permission('regulatory.rule.manage'));

DROP POLICY IF EXISTS p18_regulatory_rules_update ON public.regulatory_rules;
CREATE POLICY p18_regulatory_rules_update ON public.regulatory_rules
FOR UPDATE TO app_runtime_secure
USING (public.pke_has_any_project_permission('regulatory.rule.manage'))
WITH CHECK (public.pke_has_any_project_permission('regulatory.rule.manage'));

DROP POLICY IF EXISTS pke_scope_select ON public.regulatory_rule_versions;
CREATE POLICY pke_scope_select ON public.regulatory_rule_versions
FOR SELECT TO app_runtime_secure
USING (
  (status IN ('approved','effective') AND (
    public.pke_has_any_project_permission('regulatory.rule.view')
    OR public.pke_has_any_project_permission('compliance.view')
  ))
  OR public.pke_has_any_project_permission('regulatory.rule.manage')
);

DROP POLICY IF EXISTS p18_regulatory_rule_versions_insert ON public.regulatory_rule_versions;
CREATE POLICY p18_regulatory_rule_versions_insert ON public.regulatory_rule_versions
FOR INSERT TO app_runtime_secure
WITH CHECK (
  public.pke_has_any_project_permission('regulatory.rule.version.create')
  AND status='draft'
  AND approved_by IS NULL AND approved_at IS NULL
  AND (created_by IS NULL OR created_by=public.pke_current_user_id())
);

DROP POLICY IF EXISTS p18_regulatory_rule_versions_update ON public.regulatory_rule_versions;
CREATE POLICY p18_regulatory_rule_versions_update ON public.regulatory_rule_versions
FOR UPDATE TO app_runtime_secure
USING (public.pke_has_any_project_permission('regulatory.rule.manage'))
WITH CHECK (public.pke_has_any_project_permission('regulatory.rule.manage'));

DROP POLICY IF EXISTS p18_regulatory_rule_conditions_insert ON public.regulatory_rule_conditions;
CREATE POLICY p18_regulatory_rule_conditions_insert ON public.regulatory_rule_conditions
FOR INSERT TO app_runtime_secure
WITH CHECK (
  public.pke_has_any_project_permission('regulatory.rule.version.create')
  AND EXISTS (SELECT 1 FROM public.regulatory_rule_versions v WHERE v.id=rule_version_id AND v.status='draft')
);

DROP POLICY IF EXISTS p18_regulatory_rule_documents_insert ON public.regulatory_rule_documents;
CREATE POLICY p18_regulatory_rule_documents_insert ON public.regulatory_rule_documents
FOR INSERT TO app_runtime_secure
WITH CHECK (
  public.pke_has_any_project_permission('regulatory.rule.version.create')
  AND EXISTS (SELECT 1 FROM public.regulatory_rule_versions v WHERE v.id=rule_version_id AND v.status='draft')
);

CREATE OR REPLACE FUNCTION public.p18_guard_regulatory_source_verification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verification_status='verified' THEN
    IF NEW.reviewer_id IS NULL OR NEW.reviewer_id=NEW.created_by THEN
      RAISE EXCEPTION 'Independent reviewer required to verify a regulatory source' USING ERRCODE='23514';
    END IF;
    IF NEW.official_url IS NULL OR length(trim(NEW.official_url))=0
       OR COALESCE(NULLIF(NEW.source_checksum,''),NULLIF(NEW.source_checksum_sha256,'')) IS NULL THEN
      RAISE EXCEPTION 'Verified source requires official URL and SHA-256 checksum' USING ERRCODE='23514';
    END IF;
    NEW.last_reviewed=COALESCE(NEW.last_reviewed,now());
  END IF;
  NEW.updated_at=now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS p18_regulatory_source_verification_guard ON public.regulatory_sources;
CREATE TRIGGER p18_regulatory_source_verification_guard
BEFORE INSERT OR UPDATE ON public.regulatory_sources
FOR EACH ROW EXECUTE FUNCTION public.p18_guard_regulatory_source_verification();

CREATE OR REPLACE FUNCTION public.p18_guard_regulatory_rule_version_lifecycle()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.rule_id,NEW.version_number,NEW.regulatory_source_id,NEW.source_locator,
      NEW.source_url_snapshot,NEW.source_checksum,NEW.rule_summary,NEW.condition_schema,
      NEW.outcome,NEW.risk_category,NEW.effective_from,NEW.effective_to)
      IS DISTINCT FROM
      ROW(OLD.rule_id,OLD.version_number,OLD.regulatory_source_id,OLD.source_locator,
      OLD.source_url_snapshot,OLD.source_checksum,OLD.rule_summary,OLD.condition_schema,
      OLD.outcome,OLD.risk_category,OLD.effective_from,OLD.effective_to) THEN
      RAISE EXCEPTION 'Regulatory rule version content is immutable; create a new version' USING ERRCODE='23514';
    END IF;
    IF NEW.status='approved' AND OLD.status='under_review' THEN
      IF NEW.approved_by IS NULL OR NEW.approved_by=OLD.created_by THEN
        RAISE EXCEPTION 'Independent maker-checker approval required' USING ERRCODE='23514';
      END IF;
      NEW.approved_at=COALESCE(NEW.approved_at,now());
    ELSIF NEW.status='effective' AND OLD.status='approved' THEN
      IF OLD.approved_by IS NULL OR OLD.approved_at IS NULL THEN
        RAISE EXCEPTION 'Only independently approved versions may become effective' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status
      AND NOT (OLD.status='draft' AND NEW.status='under_review')
      AND NOT (OLD.status='under_review' AND NEW.status='rejected')
      AND NOT (OLD.status='approved' AND NEW.status IN ('effective','superseded','repealed'))
      AND NOT (OLD.status='effective' AND NEW.status IN ('superseded','repealed')) THEN
      RAISE EXCEPTION 'Invalid regulatory rule version lifecycle transition' USING ERRCODE='23514';
    END IF;
  END IF;
  NEW.updated_at=now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS p18_regulatory_rule_version_lifecycle_guard ON public.regulatory_rule_versions;
CREATE TRIGGER p18_regulatory_rule_version_lifecycle_guard
BEFORE UPDATE ON public.regulatory_rule_versions
FOR EACH ROW EXECUTE FUNCTION public.p18_guard_regulatory_rule_version_lifecycle();

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='regulatory_sources' AND policyname='p18_regulatory_sources_insert') THEN RAISE EXCEPTION 'P18 source insert policy missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='regulatory_rules' AND policyname='p18_regulatory_rules_insert') THEN RAISE EXCEPTION 'P18 rule insert policy missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='regulatory_rule_versions' AND policyname='p18_regulatory_rule_versions_insert') THEN RAISE EXCEPTION 'P18 version insert policy missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='p18_regulatory_rule_version_lifecycle_guard' AND NOT tgisinternal) THEN RAISE EXCEPTION 'P18 immutable version trigger missing'; END IF;
END
$verify$;

COMMIT;
