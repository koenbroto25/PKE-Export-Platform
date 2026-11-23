-- Migration 112: P18 permission-aware regulatory rule lifecycle compatibility.
-- Corrects legacy Platform-Admin-only triggers so the governed Project role can
-- manage draft/review transitions while preserving independent maker-checker controls.
BEGIN;

CREATE OR REPLACE FUNCTION public.pke_regulatory_rule_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $p18_rule$
DECLARE v record;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Regulatory rule identities are retained; supersede or repeal instead.' USING ERRCODE='55000';
  END IF;
  IF jsonb_typeof(NEW.scope)<>'object' OR NULLIF(btrim(NEW.rule_code),'') IS NULL
     OR NULLIF(btrim(NEW.title),'') IS NULL THEN
    RAISE EXCEPTION 'Regulatory rule requires code, title and JSON object scope.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' OR NEW.active_version_id IS NOT NULL
       OR NEW.created_by IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'New regulatory rules must begin as draft and be created by the authenticated user.' USING ERRCODE='55000';
    END IF;
  ELSE
    IF NEW.rule_code IS DISTINCT FROM OLD.rule_code OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.jurisdiction IS DISTINCT FROM OLD.jurisdiction OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
       OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Regulatory rule identity and scope are immutable.' USING ERRCODE='55000';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (public.pke_is_platform_admin() OR public.p18_has_regulatory_permission('regulatory.rule.manage')) THEN
        RAISE EXCEPTION 'Regulatory rule lifecycle permission required.' USING ERRCODE='42501';
      END IF;
      IF NOT (
        (OLD.status='draft' AND NEW.status='under_review')
        OR (OLD.status='under_review' AND NEW.status IN ('approved','draft'))
        OR (OLD.status='approved' AND NEW.status='effective')
        OR (OLD.status='effective' AND NEW.status IN ('suspended','superseded','repealed'))
        OR (OLD.status='suspended' AND NEW.status IN ('effective','superseded','repealed'))
        OR (OLD.status='approved' AND NEW.status IN ('superseded','repealed'))
      ) THEN
        RAISE EXCEPTION 'Invalid regulatory rule transition: % -> %.',OLD.status,NEW.status USING ERRCODE='55000';
      END IF;
      IF NEW.status IN ('approved','effective') THEN
        IF NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()
           OR NEW.reviewed_at IS NULL OR NEW.reviewed_by=NEW.created_by THEN
          RAISE EXCEPTION 'Rule approval/activation requires an independent authenticated reviewer and timestamp.' USING ERRCODE='42501';
        END IF;
      END IF;
    ELSIF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
      IF NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()
         OR NEW.reviewed_at IS NULL OR NEW.reviewed_by=NEW.created_by THEN
        RAISE EXCEPTION 'Rule reviewer changes require an independent authenticated reviewer.' USING ERRCODE='42501';
      END IF;
    END IF;
  END IF;

  IF NEW.status IN ('approved','effective') AND NEW.active_version_id IS NULL THEN
    RAISE EXCEPTION 'An approved/effective regulatory rule must identify its selected version.' USING ERRCODE='23514';
  END IF;
  IF NEW.active_version_id IS NOT NULL THEN
    SELECT rule_id,status,effective_from,effective_to,regulatory_source_id
      INTO v FROM public.regulatory_rule_versions WHERE id=NEW.active_version_id FOR SHARE;
    IF NOT FOUND OR v.rule_id<>NEW.id OR v.status NOT IN ('approved','effective') THEN
      RAISE EXCEPTION 'Selected rule version must belong to this rule and be approved/effective.' USING ERRCODE='23514';
    END IF;
    IF NEW.status='effective' THEN
      IF v.status<>'effective' OR v.effective_from>CURRENT_DATE
         OR (v.effective_to IS NOT NULL AND v.effective_to<CURRENT_DATE) THEN
        RAISE EXCEPTION 'An effective rule must point to a currently effective version.' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END;
$p18_rule$;

CREATE OR REPLACE FUNCTION public.pke_regulatory_rule_version_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $p18_version$
DECLARE src record; max_version integer; parent_status text;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Regulatory rule versions are retained; supersede or repeal them instead.' USING ERRCODE='55000';
  END IF;
  IF jsonb_typeof(NEW.condition_schema)<>'object' OR NULLIF(btrim(NEW.rule_summary),'') IS NULL THEN
    RAISE EXCEPTION 'Rule version requires a JSON condition schema and non-empty summary.' USING ERRCODE='23514';
  END IF;
  SELECT status INTO parent_status FROM public.regulatory_rules WHERE id=NEW.rule_id FOR SHARE;
  IF NOT FOUND OR parent_status IN ('superseded','repealed') THEN
    RAISE EXCEPTION 'Rule version must belong to a live regulatory rule.' USING ERRCODE='23514';
  END IF;
  SELECT status,verification_status,effective_date,expiry_repeal_date,official_url,
         COALESCE(source_checksum_sha256,source_checksum) AS source_hash
    INTO src FROM public.regulatory_sources WHERE id=NEW.regulatory_source_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rule version requires an existing regulatory source.' USING ERRCODE='23503'; END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL
       OR NEW.created_by IS DISTINCT FROM public.pke_current_user_id() THEN
      RAISE EXCEPTION 'New regulatory rule versions must begin as draft, have an authenticated maker and no approval metadata.' USING ERRCODE='55000';
    END IF;
    SELECT COALESCE(max(version_number),0) INTO max_version
      FROM public.regulatory_rule_versions WHERE rule_id=NEW.rule_id;
    IF NEW.version_number<>max_version+1 THEN
      RAISE EXCEPTION 'Rule version number must be sequential within its rule.' USING ERRCODE='23514';
    END IF;
    NEW.source_url_snapshot:=COALESCE(NEW.source_url_snapshot,src.official_url);
    NEW.source_checksum:=COALESCE(NEW.source_checksum,src.source_hash);
  ELSE
    IF OLD.status IN ('approved','effective','superseded','repealed') AND
       (NEW.rule_id IS DISTINCT FROM OLD.rule_id OR NEW.version_number IS DISTINCT FROM OLD.version_number
        OR NEW.regulatory_source_id IS DISTINCT FROM OLD.regulatory_source_id
        OR NEW.source_locator IS DISTINCT FROM OLD.source_locator
        OR NEW.source_url_snapshot IS DISTINCT FROM OLD.source_url_snapshot
        OR NEW.source_checksum IS DISTINCT FROM OLD.source_checksum
        OR NEW.rule_summary IS DISTINCT FROM OLD.rule_summary
        OR NEW.condition_schema IS DISTINCT FROM OLD.condition_schema
        OR NEW.outcome IS DISTINCT FROM OLD.outcome OR NEW.risk_category IS DISTINCT FROM OLD.risk_category
        OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
        OR NEW.effective_to IS DISTINCT FROM OLD.effective_to) THEN
      RAISE EXCEPTION 'Approved/effective rule version content is immutable; create a new version.' USING ERRCODE='55000';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (public.pke_is_platform_admin() OR public.p18_has_regulatory_permission('regulatory.rule.manage')) THEN
        RAISE EXCEPTION 'Regulatory rule version lifecycle permission required.' USING ERRCODE='42501';
      END IF;
      IF NOT (
        (OLD.status='draft' AND NEW.status='under_review'
          AND parent_status IN ('draft','under_review','approved','effective','suspended'))
        OR (OLD.status='under_review' AND NEW.status='approved'
          AND parent_status IN ('under_review','approved','effective','suspended'))
        OR (OLD.status='under_review' AND NEW.status='rejected'
          AND parent_status IN ('under_review','approved','effective','suspended'))
        OR (OLD.status='approved' AND NEW.status='effective'
          AND parent_status IN ('approved','effective','suspended'))
        OR (OLD.status IN ('approved','effective') AND NEW.status IN ('superseded','repealed'))
      ) THEN
        RAISE EXCEPTION 'Invalid regulatory rule version transition or parent rule lifecycle: % -> % (parent %).',
          OLD.status,NEW.status,parent_status USING ERRCODE='55000';
      END IF;
      IF NEW.status='approved' THEN
        IF src.status<>'active' OR src.verification_status<>'verified'
           OR src.effective_date>now() OR (src.expiry_repeal_date IS NOT NULL AND src.expiry_repeal_date<now())
           OR src.official_url IS NULL OR src.official_url !~* '^https://'
           OR COALESCE(src.source_hash,'') !~* '^[0-9a-f]{64}$'
           OR NEW.source_url_snapshot IS DISTINCT FROM src.official_url
           OR NEW.source_checksum IS DISTINCT FROM src.source_hash
           OR NEW.approved_by IS DISTINCT FROM public.pke_current_user_id() OR NEW.approved_at IS NULL
           OR NEW.approved_by IS NOT DISTINCT FROM OLD.created_by THEN
          RAISE EXCEPTION 'Approval requires an independent authenticated reviewer and a currently effective verified source with URL and SHA-256 provenance.' USING ERRCODE='23514';
        END IF;
      ELSIF NEW.status='effective' THEN
        IF src.status<>'active' OR src.verification_status<>'verified'
           OR src.effective_date>now() OR (src.expiry_repeal_date IS NOT NULL AND src.expiry_repeal_date<now())
           OR src.official_url IS NULL OR src.official_url !~* '^https://'
           OR COALESCE(src.source_hash,'') !~* '^[0-9a-f]{64}$'
           OR NEW.source_url_snapshot IS DISTINCT FROM src.official_url
           OR NEW.source_checksum IS DISTINCT FROM src.source_hash
           OR NEW.effective_from>CURRENT_DATE
           OR (NEW.effective_to IS NOT NULL AND NEW.effective_to<CURRENT_DATE)
           OR NEW.approved_by IS NULL OR NEW.approved_at IS NULL
           OR NEW.approved_by IS NOT DISTINCT FROM OLD.created_by THEN
          RAISE EXCEPTION 'A rule version can become effective only within its dates under a verified source and independent approval.' USING ERRCODE='23514';
        END IF;
      END IF;
    ELSIF OLD.status IN ('approved','effective') AND
      (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
      RAISE EXCEPTION 'Rule version approval identity/timestamp are immutable.' USING ERRCODE='55000';
    END IF;
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
END;
$p18_version$;

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='pke_regulatory_rule_guard') THEN
    RAISE EXCEPTION 'P18 parent rule lifecycle compatibility function missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='pke_regulatory_rule_version_guard') THEN
    RAISE EXCEPTION 'P18 rule version lifecycle compatibility function missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='pke_regulatory_rule_guard' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'P18 parent rule lifecycle trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='pke_regulatory_rule_version_guard' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'P18 rule version lifecycle trigger missing';
  END IF;
END
$verify$;

COMMIT;
