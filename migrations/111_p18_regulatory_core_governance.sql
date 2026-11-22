-- Migration 111: P18 regulatory source/rule governance and immutable approval lifecycle.
-- Candidate only: requires reviewed release approval before any Production application.
BEGIN;

ALTER TABLE public.regulatory_sources
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);
ALTER TABLE public.regulatory_rule_versions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);
ALTER TABLE public.country_export_document_requirements
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id);

ALTER TABLE public.regulatory_rule_versions DROP CONSTRAINT IF EXISTS regulatory_rule_versions_status_check;
ALTER TABLE public.regulatory_rule_versions ADD CONSTRAINT regulatory_rule_versions_status_check
  CHECK (status IN ('draft','under_review','approved','effective','rejected','superseded','repealed'));

INSERT INTO public.permissions(name,code,description,is_active)
VALUES
 ('View Regulatory Sources','regulatory.source.view','View verified regulatory source metadata and reviewable drafts.',true),
 ('Manage Regulatory Sources','regulatory.source.manage','Create and maintain regulatory source metadata and submit verification for independent review.',true),
 ('View Regulatory Rules','regulatory.rule.view','View approved/effective regulatory rules and their versions.',true),
 ('Manage Regulatory Rules','regulatory.rule.manage','Create and maintain regulatory rule lifecycle and independent review decisions.',true),
 ('Create Regulatory Rule Versions','regulatory.rule.version.create','Create immutable draft versions of regulatory rules.',true),
 ('Assess Regulatory Compliance','compliance.assess','Run and persist Project-scoped deterministic regulatory assessments.',true),
 ('View Regulatory Compliance','compliance.view','View Project-scoped regulatory assessments and results.',true),
 ('View Regulatory Document Catalog','regulatory.document.view','View export document types and verified country requirements.',true),
 ('Manage Regulatory Document Catalog','regulatory.document.manage','Create and maintain document catalog and country requirements for independent verification.',true)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_active=true;

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
SELECT 'regulatory_compliance_officer',p.code
FROM public.permissions p
WHERE p.code IN ('project.view','documents.view','shipment.view','shipping.view','inventory.view','product.view','compliance.view','compliance.assess',
 'regulatory.source.view','regulatory.source.manage','regulatory.rule.view',
 'regulatory.rule.manage','regulatory.rule.version.create','regulatory.document.view','regulatory.document.manage')
ON CONFLICT(role_code,permission_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.p18_has_regulatory_permission(permission_code text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.pke_is_platform_admin() OR public.pke_has_any_project_permission(permission_code)
$$;

DROP POLICY IF EXISTS pke_regulatory_sources_read ON public.regulatory_sources;
CREATE POLICY pke_regulatory_sources_read ON public.regulatory_sources
FOR SELECT TO app_runtime_secure
USING (
  (verification_status IN ('verified','approved') AND (
    public.p18_has_regulatory_permission('regulatory.source.view')
    OR public.p18_has_regulatory_permission('regulatory.rule.view')
    OR public.p18_has_regulatory_permission('compliance.view')
  ))
  OR public.p18_has_regulatory_permission('regulatory.source.manage')
);

DROP POLICY IF EXISTS p18_regulatory_sources_insert ON public.regulatory_sources;
CREATE POLICY p18_regulatory_sources_insert ON public.regulatory_sources
FOR INSERT TO app_runtime_secure
WITH CHECK (
  public.p18_has_regulatory_permission('regulatory.source.manage')
  AND verification_status='pending' AND status='draft'
  AND reviewer_id IS NULL
  AND (created_by IS NULL OR created_by=public.pke_current_user_id())
);

DROP POLICY IF EXISTS p18_regulatory_sources_update ON public.regulatory_sources;
CREATE POLICY p18_regulatory_sources_update ON public.regulatory_sources
FOR UPDATE TO app_runtime_secure
USING (public.p18_has_regulatory_permission('regulatory.source.manage'))
WITH CHECK (public.p18_has_regulatory_permission('regulatory.source.manage'));

DROP POLICY IF EXISTS pke_scope_select ON public.regulatory_rules;
CREATE POLICY pke_scope_select ON public.regulatory_rules
FOR SELECT TO app_runtime_secure
USING (
  (status IN ('approved','effective') AND (
    public.p18_has_regulatory_permission('regulatory.rule.view')
    OR public.p18_has_regulatory_permission('compliance.view')
  ))
  OR public.p18_has_regulatory_permission('regulatory.rule.manage')
);

DROP POLICY IF EXISTS p18_regulatory_rules_insert ON public.regulatory_rules;
CREATE POLICY p18_regulatory_rules_insert ON public.regulatory_rules
FOR INSERT TO app_runtime_secure
WITH CHECK (public.p18_has_regulatory_permission('regulatory.rule.manage'));

DROP POLICY IF EXISTS p18_regulatory_rules_update ON public.regulatory_rules;
CREATE POLICY p18_regulatory_rules_update ON public.regulatory_rules
FOR UPDATE TO app_runtime_secure
USING (public.p18_has_regulatory_permission('regulatory.rule.manage'))
WITH CHECK (public.p18_has_regulatory_permission('regulatory.rule.manage'));

DROP POLICY IF EXISTS pke_scope_select ON public.regulatory_rule_versions;
CREATE POLICY pke_scope_select ON public.regulatory_rule_versions
FOR SELECT TO app_runtime_secure
USING (
  (status IN ('approved','effective') AND (
    public.p18_has_regulatory_permission('regulatory.rule.view')
    OR public.p18_has_regulatory_permission('compliance.view')
  ))
  OR public.p18_has_regulatory_permission('regulatory.rule.manage')
);

DROP POLICY IF EXISTS p18_regulatory_rule_versions_insert ON public.regulatory_rule_versions;
CREATE POLICY p18_regulatory_rule_versions_insert ON public.regulatory_rule_versions
FOR INSERT TO app_runtime_secure
WITH CHECK (
  public.p18_has_regulatory_permission('regulatory.rule.version.create')
  AND status='draft'
  AND approved_by IS NULL AND approved_at IS NULL
  AND (created_by IS NULL OR created_by=public.pke_current_user_id())
);

DROP POLICY IF EXISTS p18_regulatory_rule_versions_update ON public.regulatory_rule_versions;
CREATE POLICY p18_regulatory_rule_versions_update ON public.regulatory_rule_versions
FOR UPDATE TO app_runtime_secure
USING (public.p18_has_regulatory_permission('regulatory.rule.manage'))
WITH CHECK (public.p18_has_regulatory_permission('regulatory.rule.manage'));

DROP POLICY IF EXISTS p18_regulatory_rule_conditions_insert ON public.regulatory_rule_conditions;
CREATE POLICY p18_regulatory_rule_conditions_insert ON public.regulatory_rule_conditions
FOR INSERT TO app_runtime_secure
WITH CHECK (
  public.p18_has_regulatory_permission('regulatory.rule.version.create')
  AND EXISTS (SELECT 1 FROM public.regulatory_rule_versions v WHERE v.id=rule_version_id AND v.status='draft')
);

DROP POLICY IF EXISTS p18_regulatory_rule_documents_insert ON public.regulatory_rule_documents;
CREATE POLICY p18_regulatory_rule_documents_insert ON public.regulatory_rule_documents
FOR INSERT TO app_runtime_secure
WITH CHECK (
  public.p18_has_regulatory_permission('regulatory.rule.version.create')
  AND EXISTS (SELECT 1 FROM public.regulatory_rule_versions v WHERE v.id=rule_version_id AND v.status='draft')
);

DROP POLICY IF EXISTS pke_scope_select ON public.regulatory_rule_conditions;
CREATE POLICY pke_scope_select ON public.regulatory_rule_conditions
FOR SELECT TO app_runtime_secure
USING (
  (
    EXISTS (SELECT 1 FROM public.regulatory_rule_versions v WHERE v.id=rule_version_id AND v.status IN ('approved','effective'))
    AND (public.p18_has_regulatory_permission('regulatory.rule.view') OR public.p18_has_regulatory_permission('compliance.view'))
  )
  OR (
    EXISTS (SELECT 1 FROM public.regulatory_rule_versions v WHERE v.id=rule_version_id AND v.status IN ('draft','under_review','rejected'))
    AND public.p18_has_regulatory_permission('regulatory.rule.manage')
  )
);

DROP POLICY IF EXISTS pke_scope_select ON public.regulatory_rule_documents;
CREATE POLICY pke_scope_select ON public.regulatory_rule_documents
FOR SELECT TO app_runtime_secure
USING (
  (EXISTS (SELECT 1 FROM public.regulatory_rule_versions v WHERE v.id=rule_version_id AND v.status IN ('approved','effective')))
  AND (public.p18_has_regulatory_permission('regulatory.rule.view')
    OR public.p18_has_regulatory_permission('compliance.view')
    OR public.p18_has_regulatory_permission('regulatory.rule.manage'))
);

DROP POLICY IF EXISTS pke_country_document_requirements_read ON public.country_export_document_requirements;
CREATE POLICY pke_country_document_requirements_read ON public.country_export_document_requirements
FOR SELECT TO app_runtime_secure
USING (
  (status IN ('verified','active') AND (public.pke_is_platform_admin() OR public.pke_has_any_project_access()))
  OR public.p18_has_regulatory_permission('regulatory.document.manage')
);

DROP POLICY IF EXISTS pke_export_document_types_member_read ON public.export_document_types;
CREATE POLICY pke_export_document_types_member_read ON public.export_document_types
FOR SELECT TO app_runtime_secure
USING (public.pke_is_platform_admin() OR public.pke_has_any_project_access() OR public.p18_has_regulatory_permission('regulatory.document.manage'));

DROP POLICY IF EXISTS p18_export_document_types_insert ON public.export_document_types;
CREATE POLICY p18_export_document_types_insert ON public.export_document_types
FOR INSERT TO app_runtime_secure
WITH CHECK (public.p18_has_regulatory_permission('regulatory.document.manage'));

DROP POLICY IF EXISTS p18_export_document_types_update ON public.export_document_types;
CREATE POLICY p18_export_document_types_update ON public.export_document_types
FOR UPDATE TO app_runtime_secure
USING (public.p18_has_regulatory_permission('regulatory.document.manage'))
WITH CHECK (public.p18_has_regulatory_permission('regulatory.document.manage'));

DROP POLICY IF EXISTS p18_country_document_requirements_insert ON public.country_export_document_requirements;
CREATE POLICY p18_country_document_requirements_insert ON public.country_export_document_requirements
FOR INSERT TO app_runtime_secure
WITH CHECK (
  public.p18_has_regulatory_permission('regulatory.document.manage')
  AND status='draft' AND verification_status='pending' AND verified_by IS NULL
  AND (created_by IS NULL OR created_by=public.pke_current_user_id())
);

DROP POLICY IF EXISTS p18_country_document_requirements_update ON public.country_export_document_requirements;
CREATE POLICY p18_country_document_requirements_update ON public.country_export_document_requirements
FOR UPDATE TO app_runtime_secure
USING (public.p18_has_regulatory_permission('regulatory.document.manage'))
WITH CHECK (public.p18_has_regulatory_permission('regulatory.document.manage'));

DROP POLICY IF EXISTS p18_regulatory_audit_read ON public.audit_events;
CREATE POLICY p18_regulatory_audit_read ON public.audit_events
FOR SELECT TO app_runtime_secure
USING (
  source='p18_regulatory_core'
  AND (
    public.p18_has_regulatory_permission('regulatory.source.view')
    OR public.p18_has_regulatory_permission('regulatory.rule.view')
    OR public.p18_has_regulatory_permission('regulatory.document.view')
    OR public.p18_has_regulatory_permission('compliance.view')
  )
);

CREATE OR REPLACE FUNCTION public.p18_guard_regulatory_source_verification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.verification_status='verified' AND
     ROW(NEW.source_id,NEW.title,NEW.issuing_authority,NEW.jurisdiction,NEW.document_type,
         NEW.regulation_number,NEW.article_annex_section,NEW.publication_date,NEW.effective_date,
         NEW.expiry_repeal_date,NEW.official_url,NEW.source_checksum,NEW.source_checksum_sha256)
     IS DISTINCT FROM
     ROW(OLD.source_id,OLD.title,OLD.issuing_authority,OLD.jurisdiction,OLD.document_type,
         OLD.regulation_number,OLD.article_annex_section,OLD.publication_date,OLD.effective_date,
         OLD.expiry_repeal_date,OLD.official_url,OLD.source_checksum,OLD.source_checksum_sha256) THEN
    RAISE EXCEPTION 'Verified regulatory source metadata is immutable; create a new source version' USING ERRCODE='23514';
  END IF;
  IF NEW.verification_status='verified' THEN
    IF NEW.reviewer_id IS NULL OR NEW.reviewer_id=NEW.created_by THEN
      RAISE EXCEPTION 'Independent reviewer required to verify a regulatory source' USING ERRCODE='23514';
    END IF;
    IF NEW.official_url IS NULL OR NEW.official_url !~* '^https://'
       OR COALESCE(NULLIF(NEW.source_checksum_sha256,''),NULLIF(NEW.source_checksum,'')) !~* '^[0-9a-f]{64}$' THEN
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

CREATE OR REPLACE FUNCTION public.p18_guard_country_requirement_verification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.verification_status='verified' AND
     ROW(NEW.country_code,NEW.product_id,NEW.document_type_id,NEW.regulatory_source_id,
         NEW.importing_authority,NEW.mandatory,NEW.effective_from,NEW.effective_to,
         NEW.official_source_url,NEW.condition_schema)
     IS DISTINCT FROM
     ROW(OLD.country_code,OLD.product_id,OLD.document_type_id,OLD.regulatory_source_id,
         OLD.importing_authority,OLD.mandatory,OLD.effective_from,OLD.effective_to,
         OLD.official_source_url,OLD.condition_schema) THEN
    RAISE EXCEPTION 'Verified country requirement is immutable; create a new version' USING ERRCODE='23514';
  END IF;
  IF NEW.verification_status='verified' THEN
    IF NEW.verified_by IS NULL OR NEW.verified_by=NEW.created_by THEN
      RAISE EXCEPTION 'Independent reviewer required for country requirement verification' USING ERRCODE='23514';
    END IF;
    IF NEW.regulatory_source_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.regulatory_sources s WHERE s.id=NEW.regulatory_source_id AND s.verification_status='verified'
        AND (NEW.official_source_url IS NULL OR NEW.official_source_url=s.official_url)
    ) THEN
      RAISE EXCEPTION 'Country requirement must reference a verified regulatory source' USING ERRCODE='23514';
    END IF;
    NEW.last_verified_at=COALESCE(NEW.last_verified_at,now());
  END IF;
  NEW.updated_at=now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS p18_country_requirement_verification_guard ON public.country_export_document_requirements;
CREATE TRIGGER p18_country_requirement_verification_guard
BEFORE INSERT OR UPDATE ON public.country_export_document_requirements
FOR EACH ROW EXECUTE FUNCTION public.p18_guard_country_requirement_verification();

CREATE OR REPLACE FUNCTION public.p18_guard_regulatory_rule_version_lifecycle()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.rule_id,NEW.version_number,NEW.regulatory_source_id,NEW.source_locator,
      NEW.source_url_snapshot,NEW.source_checksum,NEW.rule_summary,NEW.condition_schema,
      NEW.outcome,NEW.risk_category,NEW.effective_from,NEW.effective_to,NEW.created_by)
      IS DISTINCT FROM
      ROW(OLD.rule_id,OLD.version_number,OLD.regulatory_source_id,OLD.source_locator,
      OLD.source_url_snapshot,OLD.source_checksum,OLD.rule_summary,OLD.condition_schema,
      OLD.outcome,OLD.risk_category,OLD.effective_from,OLD.effective_to,OLD.created_by) THEN
      RAISE EXCEPTION 'Regulatory rule version content is immutable; create a new version' USING ERRCODE='23514';
    END IF;
    IF OLD.approved_by IS NOT NULL AND NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
      RAISE EXCEPTION 'Regulatory rule approval identity is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.approved_at IS NOT NULL AND NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
      RAISE EXCEPTION 'Regulatory rule approval timestamp is immutable' USING ERRCODE='23514';
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

CREATE OR REPLACE FUNCTION public.p18_guard_regulatory_assessment_review()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.project_id,NEW.shipment_id,NEW.product_id,NEW.product_hs_classification_id,
           NEW.origin_country,NEW.destination_country,NEW.assessment_date,NEW.input_snapshot,
           NEW.ruleset_version_snapshot,NEW.assessed_by)
       IS DISTINCT FROM
       ROW(OLD.project_id,OLD.shipment_id,OLD.product_id,OLD.product_hs_classification_id,
           OLD.origin_country,OLD.destination_country,OLD.assessment_date,OLD.input_snapshot,
           OLD.ruleset_version_snapshot,OLD.assessed_by) THEN
      RAISE EXCEPTION 'Regulatory assessment facts and ruleset snapshot are immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.reviewed_by IS NOT NULL THEN
      IF NEW.reviewed_by=NEW.assessed_by THEN
        RAISE EXCEPTION 'Assessment maker cannot review their own assessment' USING ERRCODE='23514';
      END IF;
      NEW.reviewed_at=COALESCE(NEW.reviewed_at,now());
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS p18_regulatory_assessment_review_guard ON public.regulatory_assessments;
CREATE TRIGGER p18_regulatory_assessment_review_guard
BEFORE UPDATE ON public.regulatory_assessments
FOR EACH ROW EXECUTE FUNCTION public.p18_guard_regulatory_assessment_review();

CREATE OR REPLACE FUNCTION public.p18_guard_regulatory_assessment_result_review()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assessment_maker uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.assessment_id,NEW.rule_version_id,NEW.required_documents,NEW.missing_documents,
           NEW.evidence,NEW.evaluated_at)
       IS DISTINCT FROM
       ROW(OLD.assessment_id,OLD.rule_version_id,OLD.required_documents,OLD.missing_documents,
           OLD.evidence,OLD.evaluated_at) THEN
      RAISE EXCEPTION 'Regulatory assessment result evidence is immutable' USING ERRCODE='23514';
    END IF;
    SELECT assessed_by INTO assessment_maker FROM public.regulatory_assessments WHERE id=OLD.assessment_id;
    IF OLD.result_status NOT IN ('pending','manual_review')
       OR NEW.result_status NOT IN ('pass','fail','not_applicable')
       OR NEW.reviewer_id IS NULL OR NEW.reviewer_id=assessment_maker THEN
      RAISE EXCEPTION 'Only an independent reviewer may resolve a pending regulatory result' USING ERRCODE='23514';
    END IF;
    IF OLD.reviewer_id IS NOT NULL THEN
      RAISE EXCEPTION 'Regulatory assessment result has already been reviewed' USING ERRCODE='23514';
    END IF;
    NEW.reviewed_at=COALESCE(NEW.reviewed_at,now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS p18_regulatory_assessment_result_review_guard ON public.regulatory_assessment_results;
CREATE TRIGGER p18_regulatory_assessment_result_review_guard
BEFORE UPDATE ON public.regulatory_assessment_results
FOR EACH ROW EXECUTE FUNCTION public.p18_guard_regulatory_assessment_result_review();

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='regulatory_sources' AND policyname='p18_regulatory_sources_insert') THEN RAISE EXCEPTION 'P18 source insert policy missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='regulatory_rules' AND policyname='p18_regulatory_rules_insert') THEN RAISE EXCEPTION 'P18 rule insert policy missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='regulatory_rule_versions' AND policyname='p18_regulatory_rule_versions_insert') THEN RAISE EXCEPTION 'P18 version insert policy missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='p18_regulatory_rule_version_lifecycle_guard' AND NOT tgisinternal) THEN RAISE EXCEPTION 'P18 immutable version trigger missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='p18_country_requirement_verification_guard' AND NOT tgisinternal) THEN RAISE EXCEPTION 'P18 country requirement verification trigger missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_events' AND policyname='p18_regulatory_audit_read') THEN RAISE EXCEPTION 'P18 regulatory audit read policy missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='p18_regulatory_assessment_review_guard' AND NOT tgisinternal) THEN RAISE EXCEPTION 'P18 assessment review guard missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='p18_regulatory_assessment_result_review_guard' AND NOT tgisinternal) THEN RAISE EXCEPTION 'P18 assessment result review guard missing'; END IF;
END
$verify$;

COMMIT;