-- Migration 074: P2-A public candidate register and distinct synthetic palm-oil-mill fixture.
-- Target: Neon UAT only. Production requires separate owner release approval.
BEGIN;

CREATE TABLE public.p2a_master_data_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_type text NOT NULL CHECK (candidate_type IN ('organization','facility')),
  candidate_name text NOT NULL CHECK (length(btrim(candidate_name)) BETWEEN 2 AND 240),
  candidate_category text NULL,
  location_text text NULL,
  source_type text NOT NULL CHECK (source_type IN ('public_candidate','synthetic_seed','manual')),
  source_name text NOT NULL,
  source_url text NULL,
  source_reference text NOT NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric(4,3) NULL CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','submitted','under_review','verified','rejected','expired')),
  notes text NULL,
  is_seed_data boolean NOT NULL DEFAULT false,
  seed_batch_id text NULL,
  created_by uuid NULL REFERENCES public.users(id),
  updated_by uuid NULL REFERENCES public.users(id),
  reviewed_by uuid NULL REFERENCES public.users(id),
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p2a_candidate_seed_marker CHECK (
    (is_seed_data=false AND seed_batch_id IS NULL AND source_type<>'synthetic_seed')
    OR (is_seed_data=true AND seed_batch_id IS NOT NULL AND source_type='synthetic_seed')
    OR (is_seed_data=false AND seed_batch_id IS NULL AND source_type IN ('public_candidate','manual'))
  ),
  CONSTRAINT p2a_candidate_source_url CHECK (source_url IS NULL OR source_url ~* '^https?://')
);

CREATE INDEX p2a_master_data_candidates_project_idx
  ON public.p2a_master_data_candidates(project_id,verification_status,candidate_type,updated_at DESC);
CREATE INDEX p2a_master_data_candidates_source_idx
  ON public.p2a_master_data_candidates(source_name,source_reference);

ALTER TABLE public.p2a_master_data_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p2a_master_data_candidates FORCE ROW LEVEL SECURITY;

CREATE POLICY p2a_master_candidates_select ON public.p2a_master_data_candidates
 FOR SELECT TO app_runtime_secure
 USING (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pks.site.view'));

CREATE POLICY p2a_master_candidates_insert ON public.p2a_master_data_candidates
 FOR INSERT TO app_runtime_secure
 WITH CHECK (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pks.participation.manage'));

CREATE POLICY p2a_master_candidates_update ON public.p2a_master_data_candidates
 FOR UPDATE TO app_runtime_secure
 USING (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pks.participation.manage'))
 WITH CHECK (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pks.participation.manage'));

GRANT SELECT,INSERT,UPDATE ON public.p2a_master_data_candidates TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.pke_guard_and_audit_p2a_master_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_user_id uuid; v_role text;
BEGIN
 v_user_id:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 v_role:=NULLIF(current_setting('app.current_role',true),'');
 IF TG_OP='UPDATE' THEN
   IF NOT public.pke_is_platform_admin() AND (
     NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_name IS DISTINCT FROM OLD.source_name
     OR NEW.source_url IS DISTINCT FROM OLD.source_url
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
   ) THEN
     RAISE EXCEPTION 'Only Platform Admin may change candidate provenance or verification decision'
       USING ERRCODE='42501';
   END IF;
   NEW.updated_at:=now();
 ELSE
   IF NOT public.pke_is_platform_admin() AND NEW.verification_status<>'unverified' THEN
     RAISE EXCEPTION 'New candidates must start unverified'
       USING ERRCODE='42501';
   END IF;
 END IF;

 INSERT INTO public.audit_events(
   actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,
   source,reason,before_snapshot,after_snapshot,metadata,outcome
 ) VALUES (
   v_user_id,CASE WHEN v_user_id IS NULL THEN 'system' ELSE 'user' END,v_role,
   'pks.participation.manage',
   CASE WHEN TG_OP='INSERT' THEN 'p2a_master_candidate.created' ELSE 'p2a_master_candidate.updated' END,
   'p2a_master_data_candidates',NEW.id,NEW.project_id,'p2a_candidate_register',
   CASE WHEN NEW.is_seed_data THEN 'Synthetic/public-source candidate seed; not a verified supplier or facility' ELSE 'P2-A master data candidate maintained' END,
   CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),
   jsonb_build_object('source_type',NEW.source_type,'source_name',NEW.source_name,'source_reference',NEW.source_reference,
                      'is_seed_data',NEW.is_seed_data,'seed_batch_id',NEW.seed_batch_id),
   'success'
 );
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_and_audit_p2a_master_candidate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_guard_and_audit_p2a_master_candidate() TO app_runtime_secure;

CREATE TRIGGER p2a_master_candidate_guard_audit
BEFORE INSERT OR UPDATE ON public.p2a_master_data_candidates
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_and_audit_p2a_master_candidate();

ALTER TABLE public.project_pks_site_participation
  ADD COLUMN project_facility_label text NULL,
  ADD COLUMN project_location_notes text NULL;

-- A separate synthetic palm-oil-mill fixture. It is deliberately not a KCP.
INSERT INTO public.partner_organizations(
 id,legal_name,trading_name,organization_type,country_code,verification_status,source_type,source_reference,is_active
) VALUES (
 '20000000-0000-4000-8000-000000000006'::uuid,
 '[TEST FIXTURE] Alpha Palm Oil Mill Operator',
 'Alpha Palm Oil Mill Operator','processor','ID','unverified','synthetic_seed',
 'P2A_SEED_20261121_02; synthetic entity only',true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.vendors(id,name,code,description,is_active,organization_id)
VALUES (
 '22000000-0000-4000-8000-000000000004'::uuid,
 '[TEST FIXTURE] Alpha Palm Oil Mill Operator','SUP-FIX-P2A-MILL-01',
 'Synthetic P2-A palm-oil-mill operator fixture; not a real counterparty.',true,
 '20000000-0000-4000-8000-000000000006'::uuid
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pks_sites(
 id,name,location,code,is_active,address,city,province,country_code,organization_id,
 facility_type,operating_status,verification_status,source_type,source_reference
) VALUES (
 '23000000-0000-4000-8000-000000000002'::uuid,
 '[TEST FIXTURE] Alpha Palm Oil Mill',
 'Kotabaru, Kalimantan Selatan, Indonesia','PKS-FIX-P2A-ALPHA-01',true,
 NULL,'Kotabaru','Kalimantan Selatan','ID',
 '20000000-0000-4000-8000-000000000006'::uuid,
 'palm_oil_mill','planned','unverified','synthetic_seed',
 'P2A_SEED_20261121_02; synthetic facility only; no verified address, coordinates, permit or capacity'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.project_supplier_participation(
 project_id,vendor_id,participation_type,is_active,notes
) VALUES (
 'a1000000-0000-4000-8000-000000000001'::uuid,
 '22000000-0000-4000-8000-000000000004'::uuid,
 'pks_operator',true,
 'SEED ONLY: synthetic palm-oil-mill operator. Not a verified supplier or Project award.'
)
ON CONFLICT (project_id,vendor_id,participation_type) DO NOTHING;

INSERT INTO public.project_pks_site_participation(
 project_id,pks_site_id,vendor_id,project_facility_label,project_location_notes,
 delivery_window,project_terms,notes,status,source_type,source_reference,is_seed_data,seed_batch_id
)
VALUES (
 'a1000000-0000-4000-8000-000000000001'::uuid,
 '23000000-0000-4000-8000-000000000002'::uuid,
 '22000000-0000-4000-8000-000000000004'::uuid,
 'Alpha Palm Oil Mill — editable Project label',
 'Synthetic location label only; no verified street address or coordinates.',
 '{}'::jsonb,
 'Synthetic example only; PM/Admin can revise Project-specific terms.',
 'SEED DATA — synthetic palm-oil-mill fixture, separate from the Alpha Kernel Crushing Plant fixture. No verified production, capacity, stock, certification or availability.',
 'proposed','synthetic_seed','P2A_SEED_20261121_02',true,'P2A-SEED-20261121-02'
)
ON CONFLICT (project_id,pks_site_id) DO NOTHING;

-- Public-source candidate leads, kept separate from canonical organizations and facilities.
-- GIMNI labels these organizations by industry/member category; the listing does not establish
-- exact plant type, current operating status, site identity, legal details or available capacity.
INSERT INTO public.p2a_master_data_candidates(
 project_id,candidate_type,candidate_name,candidate_category,location_text,source_type,source_name,source_url,
 source_reference,source_snapshot,verification_status,notes,is_seed_data,seed_batch_id
) VALUES
(
 'a1000000-0000-4000-8000-000000000001'::uuid,'organization','PT Agro Jaya Perdana','Crushing','Yos Sudarso – Medan',
 'public_candidate','GIMNI Members — 2025',
 'https://gimni.org/en/members','GIMNI-2025-PT-AGRO-JAYA-PERDANA',
 '{"member_no":"001.01.II.G-AJP/2022","industry_type":"Crushing","plant_location":"Yos Sudarso – Medan","source_claim":"GIMNI member companies (2025)"}'::jsonb,
 'unverified','Public listing candidate only. Confirm exact legal entity, current membership, KCP/CCP classification, site identity and direct contact before canonical onboarding.',false,NULL
),
(
 'a1000000-0000-4000-8000-000000000001'::uuid,'organization','PT Cargil Indonesia','Crushing','Minahasa – Sulawesi Utara',
 'public_candidate','GIMNI Members — 2025',
 'https://gimni.org/en/members','GIMNI-2025-PT-CARGIL-INDONESIA',
 '{"member_no":"039.01.XXIII.G-CI/2022","industry_type":"Crushing","plant_location":"Minahasa – Sulut","source_claim":"GIMNI member companies (2025)"}'::jsonb,
 'unverified','Name retained as displayed by the source; verify spelling/legal name and exact facility identity. Crushing category alone does not establish KCP vs CCP.',false,NULL
),
(
 'a1000000-0000-4000-8000-000000000001'::uuid,'organization','PT Citra Borneo Utama','Refinery & Crushing','Kota Waringin – Kalimantan Tengah',
 'public_candidate','GIMNI Members — 2025',
 'https://gimni.org/en/members','GIMNI-2025-PT-CITRA-BORNEO-UTAMA',
 '{"member_no":"034.01.XX.G-CBU/2022; 034.02.XX.G-CBU/2022","industry_type":"Refinery & Crushing","plant_location":"Kota Waringin – Kalteng","source_claim":"GIMNI member companies (2025)"}'::jsonb,
 'unverified','Public listing candidate only. Confirm the specific facility/site and distinguish refinery, KCP and any integrated configuration before onboarding.',false,NULL
),
(
 'a1000000-0000-4000-8000-000000000001'::uuid,'facility','[TEST FIXTURE] Alpha Palm Oil Mill','palm_oil_mill','Kotabaru, Kalimantan Selatan, Indonesia',
 'synthetic_seed','PKE internal synthetic fixture','https://example.invalid/p2a-seed',
 'P2A-SEED-20261121-02',
 '{"facility_type":"palm_oil_mill","fixture_only":true,"location_status":"synthetic_not_verified"}'::jsonb,
 'unverified','Synthetic facility record to test that palm_oil_mill and kernel_crushing_plant remain separate facility types. Not a real facility.',true,'P2A-SEED-20261121-02'
)
ON CONFLICT DO NOTHING;

COMMIT;
