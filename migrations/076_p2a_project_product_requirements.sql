-- Migration 076: P2-A Project-scoped editable product requirement overlay and PKE classification seed.
-- Target: Neon UAT only. Production requires separate owner release approval.
BEGIN;

INSERT INTO public.permissions(name,code,description,is_active)
VALUES
 ('View Project Product Requirements','product.requirement.view','View Project-scoped product identity and draft buyer/specification requirements.',true),
 ('Manage Project Product Requirements','product.requirement.manage','Create and edit Project-specific product requirement drafts; cannot approve them.',true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
VALUES ('pm','product.requirement.view'),('pm','product.requirement.manage')
ON CONFLICT (role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id,granted_by)
SELECT pr.project_id,pr.id,perm.id,NULL
FROM public.project_roles pr
JOIN public.permissions perm ON perm.code IN ('product.requirement.view','product.requirement.manage')
WHERE pr.role_code='pm' AND pr.is_active=true AND perm.is_active=true
ON CONFLICT (project_role_id,permission_id) DO NOTHING;

INSERT INTO public.product_catalog(
 product_code,product_name,category,description,base_unit,is_active,
 product_family,canonical_name,synonyms,process_route,physical_form,classification_status
)
VALUES (
 'PKE','Palm Kernel Expeller (PKE) / Palm Kernel Meal (PKM)','palm_kernel_product',
 'Bungkil dari pengolahan inti sawit yang belum mengalami proses kimiawi. Source-backed classification draft; buyer-specific numerical specification not yet established.',
 'MT',true,'palm_kernel_products','Palm Kernel Expeller (PKE) / Palm Kernel Meal (PKM)',
 ARRAY['PKE','PKM','Bungkil Inti Kelapa Sawit'],
 'Mechanical extraction of palm kernel; product has not undergone chemical processing',
 'Solid/powder containing oil/fat','unverified'
)
ON CONFLICT (product_code) DO NOTHING;

CREATE TABLE public.project_product_requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES public.product_catalog(id) ON DELETE RESTRICT,
 requirement_code text NOT NULL,
 version_no integer NOT NULL DEFAULT 1 CHECK (version_no > 0),
 specification_label text NOT NULL CHECK (length(btrim(specification_label)) BETWEEN 2 AND 240),
 measurement_basis text NOT NULL DEFAULT 'as_received',
 specification_data jsonb NOT NULL DEFAULT '{}'::jsonb,
 test_methods jsonb NOT NULL DEFAULT '{}'::jsonb,
 packaging_requirements text NULL,
 shipment_requirements text NULL,
 source_type text NOT NULL CHECK (source_type IN ('public_reference','synthetic_seed','manual','buyer_confirmed')),
 source_reference text NOT NULL,
 source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 approval_status text NOT NULL DEFAULT 'draft'
   CHECK (approval_status IN ('draft','submitted','approved','rejected','superseded')),
 notes text NULL,
 is_seed_data boolean NOT NULL DEFAULT false,
 seed_batch_id text NULL,
 created_by uuid NULL REFERENCES public.users(id),
 updated_by uuid NULL REFERENCES public.users(id),
 approved_by uuid NULL REFERENCES public.users(id),
 approved_at timestamptz NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT project_product_requirements_unique UNIQUE(project_id,product_id,requirement_code,version_no),
 CONSTRAINT project_product_requirements_seed CHECK (
   (is_seed_data=false AND seed_batch_id IS NULL AND source_type<>'synthetic_seed')
   OR (is_seed_data=true AND seed_batch_id IS NOT NULL AND source_type='synthetic_seed')
 )
);

CREATE INDEX project_product_requirements_project_idx
 ON public.project_product_requirements(project_id,approval_status,product_id,updated_at DESC);

ALTER TABLE public.project_product_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_product_requirements FORCE ROW LEVEL SECURITY;

CREATE POLICY p2a_project_product_requirements_select
 ON public.project_product_requirements FOR SELECT TO app_runtime_secure
 USING (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'product.requirement.view'));

CREATE POLICY p2a_project_product_requirements_insert
 ON public.project_product_requirements FOR INSERT TO app_runtime_secure
 WITH CHECK (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'product.requirement.manage'));

CREATE POLICY p2a_project_product_requirements_update
 ON public.project_product_requirements FOR UPDATE TO app_runtime_secure
 USING (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'product.requirement.manage'))
 WITH CHECK (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'product.requirement.manage'));

GRANT SELECT,INSERT,UPDATE ON public.project_product_requirements TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.pke_guard_and_audit_project_product_requirement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_user_id uuid; v_role text; v_is_admin boolean;
BEGIN
 v_user_id:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 v_role:=NULLIF(current_setting('app.current_role',true),'');
 v_is_admin:=public.pke_is_platform_admin();
 IF TG_OP='UPDATE' THEN
   IF NOT v_is_admin AND (
     NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
     OR NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
   ) THEN
     RAISE EXCEPTION 'Only Platform Admin may change product source provenance or approval decision'
       USING ERRCODE='42501';
   END IF;
   IF v_is_admin AND NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
     NEW.approved_by:=v_user_id;
     NEW.approved_at:=now();
   END IF;
   NEW.updated_at:=now();
 ELSE
   IF NEW.approval_status<>'draft' THEN
     RAISE EXCEPTION 'New Project product requirements must start as draft'
       USING ERRCODE='42501';
   END IF;
   NEW.approved_by:=NULL;
   NEW.approved_at:=NULL;
 END IF;
 INSERT INTO public.audit_events(
   actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,
   source,reason,before_snapshot,after_snapshot,metadata,outcome
 ) VALUES (
   v_user_id,CASE WHEN v_user_id IS NULL THEN 'system' ELSE 'user' END,v_role,
   'product.requirement.manage',
   CASE WHEN TG_OP='INSERT' THEN 'project_product_requirement.created' ELSE 'project_product_requirement.updated' END,
   'project_product_requirements',NEW.id,NEW.project_id,'p2a_product_requirements',
   CASE WHEN NEW.is_seed_data THEN 'Synthetic editable PKE classification draft; not buyer-approved specification' ELSE 'Project product requirement maintained' END,
   CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),
   jsonb_build_object('product_id',NEW.product_id,'source_type',NEW.source_type,'source_reference',NEW.source_reference,
     'is_seed_data',NEW.is_seed_data,'seed_batch_id',NEW.seed_batch_id,
     'approval_status',NEW.approval_status,'approved_by',NEW.approved_by,'approved_at',NEW.approved_at),
   'success'
 );
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_and_audit_project_product_requirement() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_guard_and_audit_project_product_requirement() TO app_runtime_secure;

CREATE TRIGGER p2a_project_product_requirement_guard_audit
BEFORE INSERT OR UPDATE ON public.project_product_requirements
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_and_audit_project_product_requirement();

INSERT INTO public.project_product_requirements(
 project_id,product_id,requirement_code,version_no,specification_label,measurement_basis,
 specification_data,test_methods,source_type,source_reference,source_snapshot,approval_status,
 notes,is_seed_data,seed_batch_id
)
SELECT
 'a1000000-0000-4000-8000-000000000001'::uuid,p.id,
 'PKE-CLASSIFICATION-DRAFT-001',1,
 'PKE / PKM — regulatory identity baseline (draft)',
 'qualitative_identity; buyer_numeric_limits_not_set',
 jsonb_build_object(
   'legal_definition','Bungkil dari pengolahan inti sawit yang belum mengalami proses kimiawi.',
   'tariff_positions',jsonb_build_array('ex 2306.60.10','ex 2306.60.90'),
   'physical_form_at_25c','Padat/bubuk mengandung minyak/lemak.',
   'colour_description','Kuning muda sampai coklat.',
   'identification_type','Qualitative identification',
   'numeric_limits',NULL,
   'numeric_limits_note','Permenperin 32/2024 does not list numerical PKE/PKM limits in this classification row. Buyer contract and batch COA must set commercial thresholds.',
   'standard_reference','SNI 7856:2017 Bungkil inti kelapa sawit (BSN catalogue status: Berlaku; full text not reviewed in this workflow).'
 ),
 jsonb_build_object(
   'identity','Qualitative identification; exact procedure to be confirmed against SNI 7856:2017 full text.',
   'moisture','No PKE numerical limit copied from unrelated products; agree buyer COA method and threshold.',
   'other_parameters','Buyer-specific parameters and accredited laboratory methods remain to be agreed.'
 ),
 'synthetic_seed',
 'Permenperin No. 32 Tahun 2024, Lampiran Kelompok Komoditas Turunan II; SNI 7856:2017 (BSN catalogue status: Berlaku). https://peraturan.bpk.go.id/Download/355456/permenperin-no-32-tahun-2024.pdf ; https://pesta.bsn.go.id/produk/detail/11135-sni78562017',
 jsonb_build_object(
   'regulation','Permenperin No. 32 Tahun 2024',
   'regulation_extract','PKE/PKM: bungkil dari pengolahan inti sawit yang belum mengalami proses kimiawi; bentuk padat/bubuk mengandung minyak/lemak; identifikasi kualitatif.',
   'bsn_standard','SNI 7856:2017 — Bungkil inti kelapa sawit; catalogue status Berlaku.',
   'full_sni_text_reviewed',false,
   'numeric_buyer_limits',NULL
 ),
 'draft',
 'SEED DATA — source-backed classification baseline only. Not a buyer specification, not a certificate of analysis, and not an approved commercial limit. Admin/PM may edit Project-specific draft fields; only Platform Admin may approve.',
 true,'P2A-SEED-20261121-03'
FROM public.product_catalog p
WHERE p.product_code='PKE'
ON CONFLICT(project_id,product_id,requirement_code,version_no) DO NOTHING;

COMMIT;
