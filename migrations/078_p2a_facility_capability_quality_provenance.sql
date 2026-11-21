-- Migration 078: facility capability, capacity, certification and quality evidence provenance.
-- Depends on Migration 077. Project-scoped evidence documents must be approved and checksum-verified.
BEGIN;

INSERT INTO public.permissions(name,code,description,is_active)
VALUES
 ('View Facility Product Capabilities','facility.product.view','Read verified facility-to-product capability records.',true),
 ('View Facility Capacity Records','facility.capacity.view','Read verified facility capacity history.',true),
 ('View Facility Records','facility.view','Read verified facility identity and certification records.',true),
 ('View Product Catalog','product.view','Read canonical product identities and verified classifications.',true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
VALUES ('pm','facility.product.view'),('pm','facility.capacity.view'),('pm','facility.view'),('pm','product.view')
ON CONFLICT (role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id,granted_by)
SELECT pr.project_id,pr.id,perm.id,NULL
FROM public.project_roles pr
JOIN public.permissions perm ON perm.code IN ('facility.product.view','facility.capacity.view','facility.view','product.view')
WHERE pr.role_code='pm' AND pr.is_active=true AND perm.is_active=true
ON CONFLICT (project_role_id,permission_id) DO NOTHING;

ALTER TABLE public.p2a_master_data_change_requests
 ADD COLUMN evidence_document_id uuid NULL REFERENCES public.project_export_documents(id) ON DELETE RESTRICT;
ALTER TABLE public.p2a_master_data_change_requests
 DROP CONSTRAINT IF EXISTS p2a_master_data_change_requests_entity_type_check;
ALTER TABLE public.p2a_master_data_change_requests
 ADD CONSTRAINT p2a_master_change_entity_type_check
 CHECK (entity_type IN ('organization','facility','facility_product','capacity_record','certification'));
ALTER TABLE public.p2a_master_data_change_requests
 ADD CONSTRAINT p2a_master_change_evidence_create_only
 CHECK (entity_type IN ('organization','facility') OR operation='create');

ALTER TABLE public.product_catalog
 ADD COLUMN classification_project_id uuid NULL REFERENCES public.projects(id),
 ADD COLUMN classification_evidence_document_id uuid NULL REFERENCES public.project_export_documents(id) ON DELETE RESTRICT,
 ADD COLUMN classification_evidence_sha256 text NULL,
 ADD COLUMN classification_source_reference text NULL,
 ADD COLUMN classification_source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN classification_verified_by uuid NULL REFERENCES public.users(id),
 ADD COLUMN classification_verified_at timestamptz NULL;
ALTER TABLE public.product_catalog
 ADD CONSTRAINT product_classification_evidence_sha256_check CHECK (classification_evidence_sha256 IS NULL OR classification_evidence_sha256 ~ '^[0-9a-f]{64}$') NOT VALID;

ALTER TABLE public.partner_organizations
 ADD COLUMN verification_project_id uuid NULL REFERENCES public.projects(id),
 ADD COLUMN verification_evidence_document_id uuid NULL REFERENCES public.project_export_documents(id) ON DELETE RESTRICT,
 ADD COLUMN verification_evidence_sha256 text NULL,
 ADD COLUMN verification_source_reference text NULL,
 ADD COLUMN verification_source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.pks_sites
 ADD COLUMN verification_project_id uuid NULL REFERENCES public.projects(id),
 ADD COLUMN verification_evidence_document_id uuid NULL REFERENCES public.project_export_documents(id) ON DELETE RESTRICT,
 ADD COLUMN verification_evidence_sha256 text NULL,
 ADD COLUMN verification_source_reference text NULL,
 ADD COLUMN verification_source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.partner_organizations
 ADD CONSTRAINT partner_org_verification_evidence_sha256_check CHECK (verification_evidence_sha256 IS NULL OR verification_evidence_sha256 ~ '^[0-9a-f]{64}$') NOT VALID;
ALTER TABLE public.pks_sites
 ADD CONSTRAINT pks_sites_verification_evidence_sha256_check CHECK (verification_evidence_sha256 IS NULL OR verification_evidence_sha256 ~ '^[0-9a-f]{64}$') NOT VALID;

ALTER TABLE public.facility_products
 ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'unknown',
 ADD COLUMN IF NOT EXISTS source_reference text NULL,
 ADD COLUMN IF NOT EXISTS source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS evidence_document_id uuid NULL REFERENCES public.project_export_documents(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS evidence_sha256 text NULL;
ALTER TABLE public.facility_products
 ADD CONSTRAINT facility_products_evidence_sha256_check CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$') NOT VALID;

ALTER TABLE public.facility_capacity_records
 ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'unknown',
 ADD COLUMN IF NOT EXISTS source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS evidence_document_id uuid NULL REFERENCES public.project_export_documents(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS evidence_object_key text NULL,
 ADD COLUMN IF NOT EXISTS evidence_sha256 text NULL;
ALTER TABLE public.facility_capacity_records
 ADD CONSTRAINT facility_capacity_evidence_sha256_check CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$') NOT VALID;

ALTER TABLE public.facility_certifications
 ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'unknown',
 ADD COLUMN IF NOT EXISTS source_reference text NULL,
 ADD COLUMN IF NOT EXISTS source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS evidence_document_id uuid NULL REFERENCES public.project_export_documents(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS evidence_sha256 text NULL;
ALTER TABLE public.facility_certifications
 ADD CONSTRAINT facility_cert_evidence_sha256_check CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$') NOT VALID;

ALTER TABLE public.product_quality_samples
 ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'unknown',
 ADD COLUMN IF NOT EXISTS source_reference text NULL,
 ADD COLUMN IF NOT EXISTS source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS lab_report_document_id uuid NULL REFERENCES public.project_export_documents(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS lab_report_sha256 text NULL,
 ADD COLUMN IF NOT EXISTS laboratory_accreditation_reference text NULL,
 ADD COLUMN IF NOT EXISTS chain_of_custody jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS reviewed_by uuid NULL REFERENCES public.users(id),
 ADD COLUMN IF NOT EXISTS reviewed_at timestamptz NULL,
 ADD COLUMN IF NOT EXISTS review_note text NULL;
ALTER TABLE public.product_quality_samples
 ADD CONSTRAINT quality_sample_lab_report_sha256_check CHECK (lab_report_sha256 IS NULL OR lab_report_sha256 ~ '^[0-9a-f]{64}$') NOT VALID;

ALTER TABLE public.product_quality_results
 ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'unknown',
 ADD COLUMN IF NOT EXISTS source_reference text NULL,
 ADD COLUMN IF NOT EXISTS source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS evidence_document_id uuid NULL REFERENCES public.project_export_documents(id) ON DELETE RESTRICT,
 ADD COLUMN IF NOT EXISTS evidence_sha256 text NULL,
 ADD COLUMN IF NOT EXISTS review_note text NULL;
ALTER TABLE public.product_quality_results
 ADD CONSTRAINT quality_result_evidence_sha256_check CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$') NOT VALID;
ALTER TABLE public.facility_products
 ADD CONSTRAINT facility_products_source_type_check CHECK (source_type IN ('unknown','manual','public_reference','official_document','buyer_confirmed')) NOT VALID;
ALTER TABLE public.facility_capacity_records
 ADD CONSTRAINT facility_capacity_source_type_check CHECK (source_type IN ('unknown','manual','public_reference','official_document','buyer_confirmed')) NOT VALID;
ALTER TABLE public.facility_certifications
 ADD CONSTRAINT facility_cert_source_type_check CHECK (source_type IN ('unknown','manual','public_reference','official_document','buyer_confirmed')) NOT VALID;
ALTER TABLE public.product_quality_samples
 ADD CONSTRAINT quality_sample_source_type_check CHECK (source_type IN ('unknown','manual','public_reference','official_document','buyer_confirmed')) NOT VALID;
ALTER TABLE public.product_quality_results
 ADD CONSTRAINT quality_result_source_type_check CHECK (source_type IN ('unknown','manual','public_reference','official_document','buyer_confirmed')) NOT VALID;

CREATE INDEX IF NOT EXISTS facility_products_evidence_document_idx ON public.facility_products(evidence_document_id);
CREATE INDEX IF NOT EXISTS facility_capacity_evidence_document_idx ON public.facility_capacity_records(evidence_document_id);
CREATE INDEX IF NOT EXISTS facility_cert_evidence_document_idx ON public.facility_certifications(evidence_document_id);
CREATE INDEX IF NOT EXISTS quality_sample_lab_report_document_idx ON public.product_quality_samples(lab_report_document_id);
CREATE INDEX IF NOT EXISTS quality_result_evidence_document_idx ON public.product_quality_results(evidence_document_id);

CREATE OR REPLACE FUNCTION public.pke_apply_p2a_master_data_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_user_id uuid;
 v_admin boolean;
 v_current jsonb;
 v_target uuid;
 v_keys text[];
 v_allowed text[];
 v_org_type text;
 v_facility_type text;
 v_country text;
 v_doc_object_key text;
 v_doc_sha256 text;
 v_doc_filename text;
 v_doc_type text;
 v_doc_snapshot jsonb;
 v_facility_status text;
 v_product_status text;
BEGIN
 v_user_id:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 v_admin:=public.pke_is_platform_admin();

 IF TG_OP='INSERT' THEN
   NEW.requested_by:=COALESCE(NEW.requested_by,v_user_id);
   IF NEW.requested_by IS DISTINCT FROM v_user_id THEN
     RAISE EXCEPTION 'Requester identity must match authenticated user' USING ERRCODE='42501';
   END IF;
   IF NEW.status<>'draft' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL
      OR NEW.applied_at IS NOT NULL OR NEW.applied_target_id IS NOT NULL THEN
     RAISE EXCEPTION 'New master-data requests must start as draft' USING ERRCODE='42501';
   END IF;
   IF NOT v_admin AND NOT public.pke_has_project_permission(NEW.project_id,'pks.master_data.change_request.manage') THEN
     RAISE EXCEPTION 'Master-data change request permission required' USING ERRCODE='42501';
   END IF;
   IF NEW.operation='update' THEN
     IF NEW.entity_type='organization' THEN
       SELECT jsonb_build_object(
         'legal_name',legal_name,'trading_name',trading_name,'organization_type',organization_type,
         'country_code',country_code,'registration_type',registration_type,'registration_number',registration_number,
         'registered_address',registered_address,'website',website,'email',email,'phone',phone
       ) INTO v_current FROM public.partner_organizations WHERE id=NEW.target_id FOR UPDATE;
     ELSE
       SELECT jsonb_build_object(
         'name',name,'location',location,'code',code,'address',address,'city',city,'province',province,
         'country_code',country_code,'latitude',latitude,'longitude',longitude,'organization_id',organization_id,
         'facility_type',facility_type,'operating_status',operating_status,
         'location_accuracy_m',location_accuracy_m,'access_constraints',access_constraints
       ) INTO v_current FROM public.pks_sites WHERE id=NEW.target_id FOR UPDATE;
     END IF;
     IF v_current IS NULL THEN RAISE EXCEPTION 'Canonical master record not found' USING ERRCODE='P0002'; END IF;
     NEW.base_snapshot:=v_current;
   ELSE
     NEW.base_snapshot:='{}'::jsonb;
   END IF;
   NEW.updated_at:=now();
   INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,
     source,reason,after_snapshot,metadata,outcome)
   VALUES(v_user_id,'user',NULLIF(current_setting('app.current_role',true),''),'pks.master_data.change_request.manage',
     'p2a.master_data_change_request.created','p2a_master_data_change_requests',NEW.id,NEW.project_id,
     'p2a_master_data_change_request',NEW.request_reason,to_jsonb(NEW),
     jsonb_build_object('entity_type',NEW.entity_type,'operation',NEW.operation,'source_type',NEW.source_type,'source_reference',NEW.source_reference),'success');
   RETURN NEW;
 END IF;

 -- Request payload, target and provenance are immutable after submission. The
 -- requester may edit only their own draft. Only Admin may make a decision.
 IF OLD.status='draft' AND NOT v_admin THEN
   IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR OLD.requested_by IS DISTINCT FROM v_user_id
      OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
      OR NEW.operation IS DISTINCT FROM OLD.operation
      OR NEW.target_id IS DISTINCT FROM OLD.target_id
      OR NEW.base_snapshot IS DISTINCT FROM OLD.base_snapshot
      OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
      OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.applied_target_id IS DISTINCT FROM OLD.applied_target_id
      OR NEW.applied_at IS DISTINCT FROM OLD.applied_at
      OR NEW.status NOT IN ('draft','submitted') THEN
     RAISE EXCEPTION 'Requester may only edit or submit own draft request' USING ERRCODE='42501';
   END IF;
 ELSIF v_admin THEN
   IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
      OR NEW.operation IS DISTINCT FROM OLD.operation
      OR NEW.target_id IS DISTINCT FROM OLD.target_id
      OR NEW.proposed_data IS DISTINCT FROM OLD.proposed_data
      OR NEW.base_snapshot IS DISTINCT FROM OLD.base_snapshot
      OR NEW.request_reason IS DISTINCT FROM OLD.request_reason
      OR NEW.source_type IS DISTINCT FROM OLD.source_type
      OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
      OR NEW.source_url IS DISTINCT FROM OLD.source_url
      OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
      OR NEW.evidence_document_id IS DISTINCT FROM OLD.evidence_document_id
      OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
      OR NEW.applied_target_id IS DISTINCT FROM OLD.applied_target_id
      OR NEW.applied_at IS DISTINCT FROM OLD.applied_at THEN
     RAISE EXCEPTION 'Admin may decide a request but may not rewrite its submitted proposal' USING ERRCODE='42501';
   END IF;
 ELSE
   RAISE EXCEPTION 'Submitted master-data request is immutable to requester' USING ERRCODE='42501';
 END IF;

 IF NEW.status IS DISTINCT FROM OLD.status THEN
   IF OLD.status='draft' AND NEW.status='submitted' THEN
     IF v_admin OR OLD.requested_by IS DISTINCT FROM v_user_id THEN
       RAISE EXCEPTION 'Only the requester may submit a draft' USING ERRCODE='42501';
     END IF;
     IF NEW.entity_type IN ('facility_product','capacity_record','certification') THEN
       SELECT d.object_key,d.sha256_checksum,d.original_filename,d.document_type_code
         INTO v_doc_object_key,v_doc_sha256,v_doc_filename,v_doc_type
         FROM public.project_export_documents d
        WHERE d.id=NEW.evidence_document_id AND d.project_id=NEW.project_id
          AND d.status='approved' AND d.upload_verified_at IS NOT NULL
          AND d.object_key IS NOT NULL AND d.sha256_checksum ~ '^[0-9a-f]{64}$'
          AND d.storage_bucket='pke-private-documents' AND d.legal_hold=false
          AND (d.expiry_date IS NULL OR d.expiry_date>=CURRENT_DATE);
       IF NOT FOUND THEN
         RAISE EXCEPTION 'Facility capability, capacity and certification requests require an approved, checksum-verified, same-Project evidence document' USING ERRCODE='23514';
       END IF;
     END IF;
   ELSIF OLD.status='submitted' AND NEW.status IN ('approved','rejected') THEN
     IF NOT v_admin THEN RAISE EXCEPTION 'Only Platform Admin may approve or reject' USING ERRCODE='42501'; END IF;
     IF OLD.requested_by=v_user_id THEN RAISE EXCEPTION 'Requester cannot approve their own change request' USING ERRCODE='42501'; END IF;
     IF NEW.status='rejected' AND length(btrim(COALESCE(NEW.decision_note,'')))<5 THEN
       RAISE EXCEPTION 'A rejection decision note of at least 5 characters is required' USING ERRCODE='23514';
     END IF;
     NEW.reviewed_by:=v_user_id;
     NEW.reviewed_at:=now();

     IF NEW.status='approved' THEN
       IF NEW.entity_type='organization' THEN
         v_allowed:=ARRAY['legal_name','trading_name','organization_type','country_code','registration_type','registration_number','registered_address','website','email','phone'];
         v_keys:=ARRAY(SELECT jsonb_object_keys(NEW.proposed_data));
         IF EXISTS(SELECT 1 FROM unnest(v_keys) k WHERE NOT (k=ANY(v_allowed))) THEN
           RAISE EXCEPTION 'Organization proposal contains protected or unsupported fields' USING ERRCODE='23514';
         END IF;
         IF NEW.operation='create' THEN
           IF NOT (NEW.proposed_data ? 'legal_name' AND NEW.proposed_data ? 'organization_type' AND NEW.proposed_data ? 'country_code')
              OR length(btrim(COALESCE(NEW.proposed_data->>'legal_name','')))<2
              OR length(COALESCE(NEW.proposed_data->>'country_code',''))<>2 THEN
             RAISE EXCEPTION 'New organization requires legal_name (at least 2 characters), organization_type and two-letter country_code' USING ERRCODE='23514';
           END IF;
           v_org_type:=NEW.proposed_data->>'organization_type';
           IF v_org_type NOT IN ('buyer','supplier','processor','transporter','warehouse_operator','port_operator','shipping_agent','surveyor','funder','other') THEN
             RAISE EXCEPTION 'Invalid organization_type' USING ERRCODE='23514';
           END IF;
           INSERT INTO public.partner_organizations(legal_name,trading_name,organization_type,country_code,registration_type,
             registration_number,registered_address,website,email,phone,verification_status,source_type,source_reference,created_by)
           VALUES(NEW.proposed_data->>'legal_name',NEW.proposed_data->>'trading_name',v_org_type,
             upper(NEW.proposed_data->>'country_code'),NEW.proposed_data->>'registration_type',NEW.proposed_data->>'registration_number',
             CASE WHEN NEW.proposed_data ? 'registered_address' THEN NEW.proposed_data->'registered_address' END,
             NEW.proposed_data->>'website',NEW.proposed_data->>'email',NEW.proposed_data->>'phone',
             'unverified','manual',NEW.source_reference,NEW.requested_by)
           RETURNING id INTO v_target;
         ELSE
           SELECT jsonb_build_object(
             'legal_name',legal_name,'trading_name',trading_name,'organization_type',organization_type,
             'country_code',country_code,'registration_type',registration_type,'registration_number',registration_number,
             'registered_address',registered_address,'website',website,'email',email,'phone',phone
           ) INTO v_current FROM public.partner_organizations WHERE id=NEW.target_id FOR UPDATE;
           IF v_current IS DISTINCT FROM NEW.base_snapshot THEN RAISE EXCEPTION 'Organization changed after request submission; resubmit against current values' USING ERRCODE='40001'; END IF;
           UPDATE public.partner_organizations SET
             legal_name=CASE WHEN NEW.proposed_data ? 'legal_name' THEN NEW.proposed_data->>'legal_name' ELSE legal_name END,
             trading_name=CASE WHEN NEW.proposed_data ? 'trading_name' THEN NEW.proposed_data->>'trading_name' ELSE trading_name END,
             organization_type=CASE WHEN NEW.proposed_data ? 'organization_type' THEN NEW.proposed_data->>'organization_type' ELSE organization_type END,
             country_code=CASE WHEN NEW.proposed_data ? 'country_code' THEN upper(NEW.proposed_data->>'country_code') ELSE country_code END,
             registration_type=CASE WHEN NEW.proposed_data ? 'registration_type' THEN NEW.proposed_data->>'registration_type' ELSE registration_type END,
             registration_number=CASE WHEN NEW.proposed_data ? 'registration_number' THEN NEW.proposed_data->>'registration_number' ELSE registration_number END,
             registered_address=CASE WHEN NEW.proposed_data ? 'registered_address' THEN NEW.proposed_data->'registered_address' ELSE registered_address END,
             website=CASE WHEN NEW.proposed_data ? 'website' THEN NEW.proposed_data->>'website' ELSE website END,
             email=CASE WHEN NEW.proposed_data ? 'email' THEN NEW.proposed_data->>'email' ELSE email END,
             phone=CASE WHEN NEW.proposed_data ? 'phone' THEN NEW.proposed_data->>'phone' ELSE phone END,
             verification_status=CASE WHEN NEW.proposed_data ?| ARRAY['legal_name','country_code','registration_number','registered_address']
               THEN 'unverified' ELSE verification_status END,
             verified_by=CASE WHEN NEW.proposed_data ?| ARRAY['legal_name','country_code','registration_number','registered_address']
               THEN NULL ELSE verified_by END,
             verified_at=CASE WHEN NEW.proposed_data ?| ARRAY['legal_name','country_code','registration_number','registered_address']
               THEN NULL ELSE verified_at END,
             verification_project_id=CASE WHEN NEW.proposed_data ?| ARRAY['legal_name','country_code','registration_number','registered_address'] THEN NULL ELSE verification_project_id END,
             verification_evidence_document_id=CASE WHEN NEW.proposed_data ?| ARRAY['legal_name','country_code','registration_number','registered_address'] THEN NULL ELSE verification_evidence_document_id END,
             verification_evidence_sha256=CASE WHEN NEW.proposed_data ?| ARRAY['legal_name','country_code','registration_number','registered_address'] THEN NULL ELSE verification_evidence_sha256 END,
             verification_source_reference=CASE WHEN NEW.proposed_data ?| ARRAY['legal_name','country_code','registration_number','registered_address'] THEN NULL ELSE verification_source_reference END,
             verification_source_snapshot=CASE WHEN NEW.proposed_data ?| ARRAY['legal_name','country_code','registration_number','registered_address'] THEN '{}'::jsonb ELSE verification_source_snapshot END,
             source_reference=NEW.source_reference,updated_at=now()
           WHERE id=NEW.target_id RETURNING id INTO v_target;
         END IF;
       ELSIF NEW.entity_type='facility' THEN
         v_allowed:=ARRAY['name','location','code','address','city','province','country_code','latitude','longitude','organization_id','facility_type','operating_status','location_accuracy_m','access_constraints'];
         v_keys:=ARRAY(SELECT jsonb_object_keys(NEW.proposed_data));
         IF EXISTS(SELECT 1 FROM unnest(v_keys) k WHERE NOT (k=ANY(v_allowed))) THEN
           RAISE EXCEPTION 'Facility proposal contains protected or unsupported fields' USING ERRCODE='23514';
         END IF;
         IF NEW.operation='create' THEN
           IF NOT (NEW.proposed_data ? 'name' AND NEW.proposed_data ? 'facility_type' AND NEW.proposed_data ? 'country_code')
              OR length(btrim(COALESCE(NEW.proposed_data->>'name','')))<2
              OR length(COALESCE(NEW.proposed_data->>'country_code',''))<>2 THEN
             RAISE EXCEPTION 'New facility requires name (at least 2 characters), facility_type and two-letter country_code' USING ERRCODE='23514';
           END IF;
           v_facility_type:=NEW.proposed_data->>'facility_type';
           IF v_facility_type NOT IN ('palm_oil_mill','kernel_crushing_plant','integrated_mill_kcp','warehouse','port_terminal','collection_point','other') THEN
             RAISE EXCEPTION 'Invalid facility_type' USING ERRCODE='23514';
           END IF;
           INSERT INTO public.pks_sites(name,location,code,address,city,province,country_code,latitude,longitude,organization_id,
             facility_type,operating_status,location_accuracy_m,access_constraints,verification_status,source_type,source_reference)
           VALUES(NEW.proposed_data->>'name',NEW.proposed_data->>'location',NEW.proposed_data->>'code',
             NEW.proposed_data->>'address',NEW.proposed_data->>'city',NEW.proposed_data->>'province',
             upper(NEW.proposed_data->>'country_code'),NULLIF(NEW.proposed_data->>'latitude','')::numeric,
             NULLIF(NEW.proposed_data->>'longitude','')::numeric,NULLIF(NEW.proposed_data->>'organization_id','')::uuid,
             v_facility_type,COALESCE(NEW.proposed_data->>'operating_status','planned'),
             NULLIF(NEW.proposed_data->>'location_accuracy_m','')::numeric,
             COALESCE(NEW.proposed_data->'access_constraints','{}'::jsonb),
             'unverified','manual',NEW.source_reference)
           RETURNING id INTO v_target;
         ELSE
           SELECT jsonb_build_object(
             'name',name,'location',location,'code',code,'address',address,'city',city,'province',province,
             'country_code',country_code,'latitude',latitude,'longitude',longitude,'organization_id',organization_id,
             'facility_type',facility_type,'operating_status',operating_status,
             'location_accuracy_m',location_accuracy_m,'access_constraints',access_constraints
           ) INTO v_current FROM public.pks_sites WHERE id=NEW.target_id FOR UPDATE;
           IF v_current IS DISTINCT FROM NEW.base_snapshot THEN RAISE EXCEPTION 'Facility changed after request submission; resubmit against current values' USING ERRCODE='40001'; END IF;
           UPDATE public.pks_sites SET
             name=CASE WHEN NEW.proposed_data ? 'name' THEN NEW.proposed_data->>'name' ELSE name END,
             location=CASE WHEN NEW.proposed_data ? 'location' THEN NEW.proposed_data->>'location' ELSE location END,
             code=CASE WHEN NEW.proposed_data ? 'code' THEN NEW.proposed_data->>'code' ELSE code END,
             address=CASE WHEN NEW.proposed_data ? 'address' THEN NEW.proposed_data->>'address' ELSE address END,
             city=CASE WHEN NEW.proposed_data ? 'city' THEN NEW.proposed_data->>'city' ELSE city END,
             province=CASE WHEN NEW.proposed_data ? 'province' THEN NEW.proposed_data->>'province' ELSE province END,
             country_code=CASE WHEN NEW.proposed_data ? 'country_code' THEN upper(NEW.proposed_data->>'country_code') ELSE country_code END,
             latitude=CASE WHEN NEW.proposed_data ? 'latitude' THEN NULLIF(NEW.proposed_data->>'latitude','')::numeric ELSE latitude END,
             longitude=CASE WHEN NEW.proposed_data ? 'longitude' THEN NULLIF(NEW.proposed_data->>'longitude','')::numeric ELSE longitude END,
             organization_id=CASE WHEN NEW.proposed_data ? 'organization_id' THEN NULLIF(NEW.proposed_data->>'organization_id','')::uuid ELSE organization_id END,
             facility_type=CASE WHEN NEW.proposed_data ? 'facility_type' THEN NEW.proposed_data->>'facility_type' ELSE facility_type END,
             operating_status=CASE WHEN NEW.proposed_data ? 'operating_status' THEN NEW.proposed_data->>'operating_status' ELSE operating_status END,
             location_accuracy_m=CASE WHEN NEW.proposed_data ? 'location_accuracy_m' THEN NULLIF(NEW.proposed_data->>'location_accuracy_m','')::numeric ELSE location_accuracy_m END,
             access_constraints=CASE WHEN NEW.proposed_data ? 'access_constraints' THEN NEW.proposed_data->'access_constraints' ELSE access_constraints END,
             verification_status=CASE WHEN NEW.proposed_data ?| ARRAY['name','address','city','province','country_code','latitude','longitude','organization_id','facility_type']
               THEN 'unverified' ELSE verification_status END,
             verified_by=CASE WHEN NEW.proposed_data ?| ARRAY['name','address','city','province','country_code','latitude','longitude','organization_id','facility_type']
               THEN NULL ELSE verified_by END,
             verified_at=CASE WHEN NEW.proposed_data ?| ARRAY['name','address','city','province','country_code','latitude','longitude','organization_id','facility_type']
               THEN NULL ELSE verified_at END,
             verification_project_id=CASE WHEN NEW.proposed_data ?| ARRAY['name','address','city','province','country_code','latitude','longitude','organization_id','facility_type'] THEN NULL ELSE verification_project_id END,
             verification_evidence_document_id=CASE WHEN NEW.proposed_data ?| ARRAY['name','address','city','province','country_code','latitude','longitude','organization_id','facility_type'] THEN NULL ELSE verification_evidence_document_id END,
             verification_evidence_sha256=CASE WHEN NEW.proposed_data ?| ARRAY['name','address','city','province','country_code','latitude','longitude','organization_id','facility_type'] THEN NULL ELSE verification_evidence_sha256 END,
             verification_source_reference=CASE WHEN NEW.proposed_data ?| ARRAY['name','address','city','province','country_code','latitude','longitude','organization_id','facility_type'] THEN NULL ELSE verification_source_reference END,
             verification_source_snapshot=CASE WHEN NEW.proposed_data ?| ARRAY['name','address','city','province','country_code','latitude','longitude','organization_id','facility_type'] THEN '{}'::jsonb ELSE verification_source_snapshot END,
             source_reference=NEW.source_reference,updated_at=now()
           WHERE id=NEW.target_id RETURNING id INTO v_target;
         END IF;
       ELSE
         SELECT d.object_key,d.sha256_checksum,d.original_filename,d.document_type_code
           INTO v_doc_object_key,v_doc_sha256,v_doc_filename,v_doc_type
           FROM public.project_export_documents d
          WHERE d.id=NEW.evidence_document_id AND d.project_id=NEW.project_id
            AND d.status='approved' AND d.upload_verified_at IS NOT NULL
            AND d.object_key IS NOT NULL AND d.sha256_checksum ~ '^[0-9a-f]{64}$'
            AND d.storage_bucket='pke-private-documents' AND d.legal_hold=false
            AND (d.expiry_date IS NULL OR d.expiry_date>=CURRENT_DATE);
         IF NOT FOUND THEN
           RAISE EXCEPTION 'Approved, checksum-verified same-Project evidence document is required' USING ERRCODE='23514';
         END IF;
         v_doc_snapshot:=COALESCE(NEW.source_snapshot,'{}'::jsonb) || jsonb_build_object(
           'evidence_document_id',NEW.evidence_document_id,'object_key',v_doc_object_key,
           'sha256_checksum',v_doc_sha256,'original_filename',v_doc_filename,'document_type_code',v_doc_type
         );

         IF NEW.entity_type='facility_product' THEN
           v_allowed:=ARRAY['facility_id','product_id','product_variant_id','process_type'];
           v_keys:=ARRAY(SELECT jsonb_object_keys(NEW.proposed_data));
           IF EXISTS(SELECT 1 FROM unnest(v_keys) k WHERE NOT (k=ANY(v_allowed))) THEN
             RAISE EXCEPTION 'Facility product proposal contains unsupported fields' USING ERRCODE='23514';
           END IF;
           IF NOT (NEW.proposed_data ? 'facility_id' AND NEW.proposed_data ? 'product_id' AND NEW.proposed_data ? 'process_type')
              OR length(btrim(COALESCE(NEW.proposed_data->>'process_type','')))<2 THEN
             RAISE EXCEPTION 'Facility product proposal requires facility_id, product_id and process_type' USING ERRCODE='23514';
           END IF;
           SELECT verification_status INTO v_facility_status FROM public.pks_sites
            WHERE id=(NEW.proposed_data->>'facility_id')::uuid AND is_active=true;
           IF v_facility_status IS DISTINCT FROM 'verified' THEN
             RAISE EXCEPTION 'Facility must be active and verified before a product capability can be verified' USING ERRCODE='23514';
           END IF;
           SELECT classification_status INTO v_product_status FROM public.product_catalog
            WHERE id=(NEW.proposed_data->>'product_id')::uuid AND is_active=true;
           IF v_product_status IS DISTINCT FROM 'verified' THEN
             RAISE EXCEPTION 'Product classification must be verified before facility capability can be verified' USING ERRCODE='23514';
           END IF;
           INSERT INTO public.facility_products(
             facility_id,product_id,product_variant_id,process_type,capability_status,
             evidence_object_key,evidence_document_id,evidence_sha256,source_type,source_reference,
             source_snapshot,verified_by,verified_at
           ) VALUES(
             (NEW.proposed_data->>'facility_id')::uuid,(NEW.proposed_data->>'product_id')::uuid,
             NULLIF(NEW.proposed_data->>'product_variant_id','')::uuid,NEW.proposed_data->>'process_type',
             'verified',v_doc_object_key,NEW.evidence_document_id,v_doc_sha256,NEW.source_type,
             NEW.source_reference,v_doc_snapshot,v_user_id,now()
           ) RETURNING id INTO v_target;
         ELSIF NEW.entity_type='capacity_record' THEN
           v_allowed:=ARRAY['facility_id','process_type','capacity_kind','capacity_value','unit_code','period_type','effective_from','effective_to'];
           v_keys:=ARRAY(SELECT jsonb_object_keys(NEW.proposed_data));
           IF EXISTS(SELECT 1 FROM unnest(v_keys) k WHERE NOT (k=ANY(v_allowed))) THEN
             RAISE EXCEPTION 'Capacity proposal contains unsupported fields' USING ERRCODE='23514';
           END IF;
           IF NOT (NEW.proposed_data ? 'facility_id' AND NEW.proposed_data ? 'process_type'
             AND NEW.proposed_data ? 'capacity_kind' AND NEW.proposed_data ? 'capacity_value'
             AND NEW.proposed_data ? 'unit_code' AND NEW.proposed_data ? 'period_type'
             AND NEW.proposed_data ? 'effective_from') THEN
             RAISE EXCEPTION 'Capacity proposal is missing required process, value, unit, period or effective date fields' USING ERRCODE='23514';
           END IF;
           SELECT verification_status INTO v_facility_status FROM public.pks_sites
            WHERE id=(NEW.proposed_data->>'facility_id')::uuid AND is_active=true;
           IF v_facility_status IS DISTINCT FROM 'verified' THEN
             RAISE EXCEPTION 'Facility must be active and verified before capacity can be verified' USING ERRCODE='23514';
           END IF;
           IF (NEW.proposed_data->>'capacity_value')::numeric<=0
             OR NEW.proposed_data->>'unit_code' !~ '^[A-Z0-9_]{2,40}$'
             OR NEW.proposed_data->>'capacity_kind' NOT IN ('nominal','rated','practical','verified_actual')
             OR NEW.proposed_data->>'period_type' NOT IN ('hour','day','week','month','year','batch') THEN
             RAISE EXCEPTION 'Capacity value, unit, capacity kind or period is invalid' USING ERRCODE='23514';
           END IF;
           INSERT INTO public.facility_capacity_records(
             facility_id,process_type,capacity_kind,capacity_value,unit_code,period_type,
             effective_from,effective_to,source_reference,source_type,source_snapshot,
             evidence_document_id,evidence_object_key,evidence_sha256,verified_by,verified_at
           ) VALUES(
             (NEW.proposed_data->>'facility_id')::uuid,NEW.proposed_data->>'process_type',
             NEW.proposed_data->>'capacity_kind',(NEW.proposed_data->>'capacity_value')::numeric,
             NEW.proposed_data->>'unit_code',NEW.proposed_data->>'period_type',
             (NEW.proposed_data->>'effective_from')::date,NULLIF(NEW.proposed_data->>'effective_to','')::date,
             NEW.source_reference,NEW.source_type,v_doc_snapshot,NEW.evidence_document_id,
             v_doc_object_key,v_doc_sha256,v_user_id,now()
           ) RETURNING id INTO v_target;
         ELSIF NEW.entity_type='certification' THEN
           v_allowed:=ARRAY['facility_id','certification_type','certificate_number','issuer','scope','valid_from','valid_to'];
           v_keys:=ARRAY(SELECT jsonb_object_keys(NEW.proposed_data));
           IF EXISTS(SELECT 1 FROM unnest(v_keys) k WHERE NOT (k=ANY(v_allowed))) THEN
             RAISE EXCEPTION 'Certification proposal contains unsupported fields' USING ERRCODE='23514';
           END IF;
           IF NOT (NEW.proposed_data ? 'facility_id' AND NEW.proposed_data ? 'certification_type'
             AND NEW.proposed_data ? 'certificate_number' AND NEW.proposed_data ? 'issuer' AND NEW.proposed_data ? 'scope') THEN
             RAISE EXCEPTION 'Certification proposal requires facility, type, certificate number, issuer and scope' USING ERRCODE='23514';
           END IF;
           SELECT verification_status INTO v_facility_status FROM public.pks_sites
            WHERE id=(NEW.proposed_data->>'facility_id')::uuid AND is_active=true;
           IF v_facility_status IS DISTINCT FROM 'verified' THEN
             RAISE EXCEPTION 'Facility must be active and verified before certification can be verified' USING ERRCODE='23514';
           END IF;
           INSERT INTO public.facility_certifications(
             facility_id,certification_type,certificate_number,issuer,scope,valid_from,valid_to,status,
             document_object_key,evidence_document_id,evidence_sha256,source_type,source_reference,
             source_snapshot,verified_by,verified_at
           ) VALUES(
             (NEW.proposed_data->>'facility_id')::uuid,NEW.proposed_data->>'certification_type',
             NEW.proposed_data->>'certificate_number',NEW.proposed_data->>'issuer',NEW.proposed_data->>'scope',
             NULLIF(NEW.proposed_data->>'valid_from','')::date,NULLIF(NEW.proposed_data->>'valid_to','')::date,
             'verified',v_doc_object_key,NEW.evidence_document_id,v_doc_sha256,NEW.source_type,
             NEW.source_reference,v_doc_snapshot,v_user_id,now()
           ) RETURNING id INTO v_target;
         ELSE
           RAISE EXCEPTION 'Unsupported master-data entity type' USING ERRCODE='23514';
         END IF;
       END IF;

       NEW.applied_target_id:=v_target;
       NEW.applied_at:=now();
       INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,
         source,reason,before_snapshot,after_snapshot,metadata,outcome)
       VALUES(v_user_id,'user',NULLIF(current_setting('app.current_role',true),''),'pks.master_data.change_request.manage',
         'p2a.canonical_master_data.applied',CASE NEW.entity_type
           WHEN 'organization' THEN 'partner_organizations'
           WHEN 'facility' THEN 'pks_sites'
           WHEN 'facility_product' THEN 'facility_products'
           WHEN 'capacity_record' THEN 'facility_capacity_records'
           ELSE 'facility_certifications' END,
         v_target,NEW.project_id,'p2a_master_data_change_request',NEW.request_reason,
         CASE WHEN NEW.operation='create' THEN NULL ELSE NEW.base_snapshot END,
         NEW.proposed_data || jsonb_build_object('evidence_document_id',NEW.evidence_document_id),
         jsonb_build_object('request_id',NEW.id,'operation',NEW.operation,'source_reference',NEW.source_reference),'success');
     END IF;
   ELSE
     IF NEW.status IS DISTINCT FROM OLD.status THEN
       RAISE EXCEPTION 'Invalid master-data request status transition' USING ERRCODE='23514';
     END IF;
     IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.applied_target_id IS DISTINCT FROM OLD.applied_target_id OR NEW.applied_at IS DISTINCT FROM OLD.applied_at THEN
       RAISE EXCEPTION 'Review and apply stamps are system-controlled' USING ERRCODE='42501';
     END IF;
   END IF;
 END IF;

 NEW.updated_at:=now();
 INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,
   source,reason,before_snapshot,after_snapshot,metadata,outcome)
 VALUES(v_user_id,'user',NULLIF(current_setting('app.current_role',true),''),'pks.master_data.change_request.manage',
   'p2a.master_data_change_request.updated','p2a_master_data_change_requests',NEW.id,NEW.project_id,
   'p2a_master_data_change_request',COALESCE(NEW.decision_note,NEW.request_reason),to_jsonb(OLD),to_jsonb(NEW),
   jsonb_build_object('status',NEW.status,'reviewed_by',NEW.reviewed_by,'reviewed_at',NEW.reviewed_at,
     'applied_target_id',NEW.applied_target_id,'applied_at',NEW.applied_at),'success');
 RETURN NEW;
END
$function$;


CREATE OR REPLACE FUNCTION public.pke_guard_p2a_identity_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_user_id uuid;
 v_doc record;
 v_entity text;
BEGIN
 v_user_id:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 v_entity:=TG_TABLE_NAME;
 IF NEW.verification_status='verified' AND
    (TG_OP='INSERT' OR OLD.verification_status IS DISTINCT FROM NEW.verification_status) THEN
   IF NOT public.pke_is_platform_admin() THEN
     RAISE EXCEPTION 'Only Platform Admin may verify canonical organization or facility identities' USING ERRCODE='42501';
   END IF;
   IF NEW.verification_project_id IS NULL OR NEW.verification_evidence_document_id IS NULL
      OR NULLIF(btrim(NEW.verification_source_reference),'') IS NULL THEN
     RAISE EXCEPTION 'Identity verification requires a Project, source reference and approved evidence document' USING ERRCODE='23514';
   END IF;
   SELECT id,sha256_checksum,object_key,original_filename,document_type_code
     INTO v_doc FROM public.project_export_documents
    WHERE id=NEW.verification_evidence_document_id
      AND project_id=NEW.verification_project_id
      AND status='approved' AND upload_verified_at IS NOT NULL
      AND sha256_checksum IS NOT NULL AND object_key IS NOT NULL
      AND storage_bucket='pke-private-documents' AND legal_hold=false
      AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE);
   IF NOT FOUND THEN
     RAISE EXCEPTION 'Identity evidence must be approved, checksum-verified and from the selected Project' USING ERRCODE='23514';
   END IF;
   NEW.verification_evidence_sha256:=v_doc.sha256_checksum;
   NEW.verified_by:=v_user_id;
   NEW.verified_at:=now();
   NEW.verification_source_snapshot:=COALESCE(NEW.verification_source_snapshot,'{}'::jsonb) || jsonb_build_object(
     'evidence_document_id',v_doc.id,'sha256_checksum',v_doc.sha256_checksum,
     'original_filename',v_doc.original_filename,'document_type_code',v_doc.document_type_code
   );
   INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
     project_id,source,reason,after_snapshot,metadata,outcome)
   VALUES(v_user_id,'user',NULLIF(current_setting('app.current_role',true),''),'pks.master_data.change_request.manage',
     CASE WHEN v_entity='partner_organizations' THEN 'p2a.partner_organization.verified' ELSE 'p2a.facility.verified' END,
     v_entity,NEW.id,NEW.verification_project_id,'p2a_identity_verification',NEW.verification_source_reference,
     to_jsonb(NEW),jsonb_build_object('evidence_document_id',v_doc.id,'sha256_checksum',v_doc.sha256_checksum),'success');
 ELSIF TG_OP='UPDATE' AND OLD.verification_status='verified' AND NEW.verification_status='verified'
   AND (NEW.verification_project_id IS DISTINCT FROM OLD.verification_project_id
     OR NEW.verification_evidence_document_id IS DISTINCT FROM OLD.verification_evidence_document_id
     OR NEW.verification_evidence_sha256 IS DISTINCT FROM OLD.verification_evidence_sha256
     OR NEW.verification_source_reference IS DISTINCT FROM OLD.verification_source_reference
     OR NEW.verification_source_snapshot IS DISTINCT FROM OLD.verification_source_snapshot
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by OR NEW.verified_at IS DISTINCT FROM OLD.verified_at) THEN
   RAISE EXCEPTION 'Verification evidence is immutable while the canonical identity remains verified' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END
$function$;

CREATE TRIGGER p2a_partner_org_verification_guard
 BEFORE INSERT OR UPDATE ON public.partner_organizations
 FOR EACH ROW EXECUTE FUNCTION public.pke_guard_p2a_identity_verification();
CREATE TRIGGER p2a_pks_site_verification_guard
 BEFORE INSERT OR UPDATE ON public.pks_sites
 FOR EACH ROW EXECUTE FUNCTION public.pke_guard_p2a_identity_verification();

CREATE POLICY p2a_product_catalog_admin_update ON public.product_catalog
 FOR UPDATE TO app_runtime_secure
 USING (public.pke_is_platform_admin())
 WITH CHECK (public.pke_is_platform_admin());
GRANT UPDATE (classification_status,classification_project_id,classification_evidence_document_id,
  classification_source_reference,classification_source_snapshot,updated_at)
 ON public.product_catalog TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.pke_guard_p2a_product_classification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_user_id uuid;
 v_doc record;
BEGIN
 v_user_id:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 IF NEW.classification_status='verified' AND
    (TG_OP='INSERT' OR OLD.classification_status IS DISTINCT FROM NEW.classification_status) THEN
   IF NOT public.pke_is_platform_admin() THEN
     RAISE EXCEPTION 'Only Platform Admin may verify canonical product classification' USING ERRCODE='42501';
   END IF;
   IF NEW.classification_project_id IS NULL OR NEW.classification_evidence_document_id IS NULL
      OR NULLIF(btrim(NEW.classification_source_reference),'') IS NULL THEN
     RAISE EXCEPTION 'Product classification verification requires a Project, source reference and approved evidence document' USING ERRCODE='23514';
   END IF;
   SELECT id,sha256_checksum,original_filename,document_type_code INTO v_doc
     FROM public.project_export_documents
    WHERE id=NEW.classification_evidence_document_id AND project_id=NEW.classification_project_id
      AND status='approved' AND upload_verified_at IS NOT NULL
      AND sha256_checksum IS NOT NULL AND object_key IS NOT NULL
      AND storage_bucket='pke-private-documents' AND legal_hold=false
      AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE);
   IF NOT FOUND THEN RAISE EXCEPTION 'Product classification evidence must be approved and checksum-verified in the same Project' USING ERRCODE='23514'; END IF;
   NEW.classification_evidence_sha256:=v_doc.sha256_checksum;
   NEW.classification_verified_by:=v_user_id;
   NEW.classification_verified_at:=now();
   NEW.classification_source_snapshot:=COALESCE(NEW.classification_source_snapshot,'{}'::jsonb) || jsonb_build_object(
     'evidence_document_id',v_doc.id,'sha256_checksum',v_doc.sha256_checksum,
     'original_filename',v_doc.original_filename,'document_type_code',v_doc.document_type_code
   );
   INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,
     project_id,source,reason,after_snapshot,metadata,outcome)
   VALUES(v_user_id,'user',NULLIF(current_setting('app.current_role',true),''),'product.view',
     'p2a.product_classification.verified','product_catalog',NEW.id,NEW.classification_project_id,
     'p2a_product_classification',NEW.classification_source_reference,to_jsonb(NEW),
     jsonb_build_object('evidence_document_id',v_doc.id,'sha256_checksum',v_doc.sha256_checksum),'success');
 ELSIF TG_OP='UPDATE' AND OLD.classification_status='verified' AND NEW.classification_status='verified'
   AND (NEW.product_code IS DISTINCT FROM OLD.product_code
     OR NEW.product_name IS DISTINCT FROM OLD.product_name
     OR NEW.canonical_name IS DISTINCT FROM OLD.canonical_name
     OR NEW.product_family IS DISTINCT FROM OLD.product_family
     OR NEW.process_route IS DISTINCT FROM OLD.process_route
     OR NEW.physical_form IS DISTINCT FROM OLD.physical_form
     OR NEW.synonyms IS DISTINCT FROM OLD.synonyms) THEN
   RAISE EXCEPTION 'Verified product identity is immutable; reset classification and submit new evidence first' USING ERRCODE='42501';
 ELSIF TG_OP='UPDATE' AND OLD.classification_status='verified' AND NEW.classification_status<>'verified' THEN
   NEW.classification_project_id:=NULL;
   NEW.classification_evidence_document_id:=NULL;
   NEW.classification_evidence_sha256:=NULL;
   NEW.classification_source_reference:=NULL;
   NEW.classification_source_snapshot:='{}'::jsonb;
   NEW.classification_verified_by:=NULL;
   NEW.classification_verified_at:=NULL;
 END IF;
 RETURN NEW;
END
$function$;

CREATE TRIGGER p2a_product_classification_guard
 BEFORE INSERT OR UPDATE ON public.product_catalog
 FOR EACH ROW EXECUTE FUNCTION public.pke_guard_p2a_product_classification();

CREATE OR REPLACE FUNCTION public.pke_validate_p2a_facility_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_doc record;
BEGIN
 IF TG_TABLE_NAME='facility_products' AND NEW.capability_status='verified' THEN
   IF NEW.evidence_document_id IS NULL OR NEW.evidence_sha256 IS NULL OR NEW.verified_by IS NULL
      OR NEW.verified_at IS NULL OR NULLIF(btrim(NEW.source_reference),'') IS NULL THEN
     RAISE EXCEPTION 'Verified facility capability requires evidence document, checksum, source reference and reviewer' USING ERRCODE='23514';
   END IF;
   SELECT id,object_key,sha256_checksum INTO v_doc FROM public.project_export_documents
    WHERE id=NEW.evidence_document_id AND status='approved' AND upload_verified_at IS NOT NULL
      AND object_key IS NOT NULL AND sha256_checksum IS NOT NULL AND storage_bucket='pke-private-documents'
      AND legal_hold=false AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE);
   IF NOT FOUND OR v_doc.object_key IS DISTINCT FROM NEW.evidence_object_key OR v_doc.sha256_checksum IS DISTINCT FROM NEW.evidence_sha256 THEN
     RAISE EXCEPTION 'Facility capability evidence document is not approved or its checksum does not match' USING ERRCODE='23514';
   END IF;
 ELSIF TG_TABLE_NAME='facility_capacity_records' AND (NEW.verified_by IS NOT NULL OR NEW.verified_at IS NOT NULL) THEN
   IF NEW.verified_by IS NULL OR NEW.verified_at IS NULL OR NEW.evidence_document_id IS NULL
      OR NEW.evidence_sha256 IS NULL OR NEW.evidence_object_key IS NULL
      OR NULLIF(btrim(NEW.source_reference),'') IS NULL THEN
     RAISE EXCEPTION 'Verified capacity requires evidence document, checksum, source reference and reviewer' USING ERRCODE='23514';
   END IF;
   SELECT id,object_key,sha256_checksum INTO v_doc FROM public.project_export_documents
    WHERE id=NEW.evidence_document_id AND status='approved' AND upload_verified_at IS NOT NULL
      AND object_key IS NOT NULL AND sha256_checksum IS NOT NULL AND storage_bucket='pke-private-documents'
      AND legal_hold=false AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE);
   IF NOT FOUND OR v_doc.object_key IS DISTINCT FROM NEW.evidence_object_key OR v_doc.sha256_checksum IS DISTINCT FROM NEW.evidence_sha256 THEN
     RAISE EXCEPTION 'Capacity evidence document is not approved or its checksum does not match' USING ERRCODE='23514';
   END IF;
 ELSIF TG_TABLE_NAME='facility_certifications' AND NEW.status='verified' THEN
   IF NEW.evidence_document_id IS NULL OR NEW.evidence_sha256 IS NULL OR NEW.verified_by IS NULL
      OR NEW.verified_at IS NULL OR NULLIF(btrim(NEW.source_reference),'') IS NULL THEN
     RAISE EXCEPTION 'Verified certification requires evidence document, checksum, source reference and reviewer' USING ERRCODE='23514';
   END IF;
   SELECT id,object_key,sha256_checksum INTO v_doc FROM public.project_export_documents
    WHERE id=NEW.evidence_document_id AND status='approved' AND upload_verified_at IS NOT NULL
      AND object_key IS NOT NULL AND sha256_checksum IS NOT NULL AND storage_bucket='pke-private-documents'
      AND legal_hold=false AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE);
   IF NOT FOUND OR v_doc.object_key IS DISTINCT FROM NEW.document_object_key OR v_doc.sha256_checksum IS DISTINCT FROM NEW.evidence_sha256 THEN
     RAISE EXCEPTION 'Certification evidence document is not approved or its checksum does not match' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END
$function$;

CREATE TRIGGER p2a_facility_products_evidence_guard
 BEFORE INSERT OR UPDATE ON public.facility_products
 FOR EACH ROW EXECUTE FUNCTION public.pke_validate_p2a_facility_evidence();
CREATE TRIGGER p2a_facility_capacity_evidence_guard
 BEFORE INSERT OR UPDATE ON public.facility_capacity_records
 FOR EACH ROW EXECUTE FUNCTION public.pke_validate_p2a_facility_evidence();
CREATE TRIGGER p2a_facility_cert_evidence_guard
 BEFORE INSERT OR UPDATE ON public.facility_certifications
 FOR EACH ROW EXECUTE FUNCTION public.pke_validate_p2a_facility_evidence();

CREATE OR REPLACE FUNCTION public.pke_validate_p2a_quality_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_doc record;
 v_sample record;
 v_user_id uuid;
BEGIN
 v_user_id:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 IF TG_TABLE_NAME='product_quality_samples' THEN
   IF NEW.lot_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_lots l WHERE l.id=NEW.lot_id AND l.project_id=NEW.project_id) THEN
     RAISE EXCEPTION 'Quality sample lot must belong to the same Project' USING ERRCODE='23514';
   END IF;
   IF NEW.lab_report_document_id IS NOT NULL THEN
     SELECT id,object_key,sha256_checksum,original_filename,document_type_code INTO v_doc
       FROM public.project_export_documents
      WHERE id=NEW.lab_report_document_id AND project_id=NEW.project_id AND status='approved'
        AND upload_verified_at IS NOT NULL AND object_key IS NOT NULL AND sha256_checksum IS NOT NULL
        AND storage_bucket='pke-private-documents' AND legal_hold=false
        AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE);
     IF NOT FOUND THEN RAISE EXCEPTION 'Lab report must be an approved, checksum-verified document from the same Project' USING ERRCODE='23514'; END IF;
     IF NEW.lab_report_object_key IS NOT NULL AND NEW.lab_report_object_key IS DISTINCT FROM v_doc.object_key THEN
       RAISE EXCEPTION 'Lab report object key does not match the selected evidence document' USING ERRCODE='23514';
     END IF;
     NEW.lab_report_object_key:=v_doc.object_key;
     NEW.lab_report_sha256:=v_doc.sha256_checksum;
     NEW.source_snapshot:=COALESCE(NEW.source_snapshot,'{}'::jsonb) || jsonb_build_object(
       'lab_report_document_id',v_doc.id,'sha256_checksum',v_doc.sha256_checksum,
       'original_filename',v_doc.original_filename,'document_type_code',v_doc.document_type_code
     );
   END IF;
   IF NEW.status IN ('tested','reviewed') AND
      (TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)) THEN
     IF NEW.lab_report_document_id IS NULL OR NEW.lab_report_sha256 IS NULL
        OR NULLIF(btrim(NEW.laboratory_name),'') IS NULL THEN
       RAISE EXCEPTION 'Tested/reviewed sample requires laboratory and approved lab-report evidence' USING ERRCODE='23514';
     END IF;
   END IF;
   IF NEW.status IN ('reviewed','rejected') AND
      (TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)) THEN
     IF NOT (public.pke_is_platform_admin() OR public.pke_has_project_permission(NEW.project_id,'quality.result.review')) THEN
       RAISE EXCEPTION 'Only a Project QA reviewer or Platform Admin may review a quality sample' USING ERRCODE='42501';
     END IF;
     NEW.reviewed_by:=v_user_id;
     NEW.reviewed_at:=now();
   END IF;
 ELSE
   SELECT project_id,lab_report_document_id,lab_report_sha256,source_type,source_reference,status,source_snapshot
     INTO v_sample FROM public.product_quality_samples WHERE id=NEW.sample_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Quality result sample not found' USING ERRCODE='23514'; END IF;
   IF NEW.evidence_document_id IS NULL THEN NEW.evidence_document_id:=v_sample.lab_report_document_id; END IF;
   IF NEW.evidence_document_id IS DISTINCT FROM v_sample.lab_report_document_id THEN
     RAISE EXCEPTION 'Quality result evidence must be the lab report linked to its sample' USING ERRCODE='23514';
   END IF;
   IF v_sample.status NOT IN ('tested','reviewed') THEN
     RAISE EXCEPTION 'Quality result cannot be recorded until its sample has a tested/reviewed lab report' USING ERRCODE='23514';
   END IF;
   IF NEW.source_type='unknown' THEN NEW.source_type:=COALESCE(v_sample.source_type,'unknown'); END IF;
   IF NEW.source_reference IS NULL THEN NEW.source_reference:=v_sample.source_reference; END IF;
   IF NEW.source_snapshot='{}'::jsonb THEN NEW.source_snapshot:=COALESCE(v_sample.source_snapshot,'{}'::jsonb); END IF;
   IF NEW.evidence_document_id IS NOT NULL THEN
     SELECT id,sha256_checksum INTO v_doc FROM public.project_export_documents
      WHERE id=NEW.evidence_document_id AND project_id=v_sample.project_id AND status='approved'
        AND upload_verified_at IS NOT NULL AND sha256_checksum IS NOT NULL AND object_key IS NOT NULL
        AND storage_bucket='pke-private-documents' AND legal_hold=false
        AND (expiry_date IS NULL OR expiry_date>=CURRENT_DATE);
     IF NOT FOUND THEN RAISE EXCEPTION 'Quality result evidence must be an approved same-Project document' USING ERRCODE='23514'; END IF;
     NEW.evidence_sha256:=v_doc.sha256_checksum;
   ELSIF v_sample.lab_report_sha256 IS NOT NULL THEN
     NEW.evidence_sha256:=v_sample.lab_report_sha256;
   END IF;
   IF NEW.evidence_document_id IS NULL OR NEW.evidence_sha256 IS NULL
      OR NULLIF(btrim(NEW.measurement_basis),'') IS NULL
      OR NULLIF(btrim(NEW.method_code),'') IS NULL
      OR (NEW.result_numeric IS NOT NULL AND NULLIF(btrim(NEW.unit_code),'') IS NULL) THEN
     RAISE EXCEPTION 'Every quality result requires sample-linked lab evidence, unit/basis/method provenance' USING ERRCODE='23514';
   END IF;
   IF NEW.review_status IN ('accepted','rejected','retest_required') AND
      (TG_OP='INSERT' OR (TG_OP='UPDATE' AND OLD.review_status IS DISTINCT FROM NEW.review_status)) THEN
     IF NOT (public.pke_is_platform_admin() OR public.pke_has_project_permission(v_sample.project_id,'quality.result.review')) THEN
       RAISE EXCEPTION 'Only a Project QA reviewer or Platform Admin may decide a quality result' USING ERRCODE='42501';
     END IF;
     NEW.reviewed_by:=v_user_id;
     NEW.reviewed_at:=now();
     IF NEW.review_status='accepted' AND (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL) THEN
       RAISE EXCEPTION 'Accepted quality result requires reviewer stamps' USING ERRCODE='23514';
     END IF;
   END IF;
 END IF;
 RETURN NEW;
END
$function$;

CREATE TRIGGER p2a_quality_sample_provenance_guard
 BEFORE INSERT OR UPDATE ON public.product_quality_samples
 FOR EACH ROW EXECUTE FUNCTION public.pke_validate_p2a_quality_provenance();
CREATE TRIGGER p2a_quality_result_provenance_guard
 BEFORE INSERT OR UPDATE ON public.product_quality_results
 FOR EACH ROW EXECUTE FUNCTION public.pke_validate_p2a_quality_provenance();

REVOKE ALL ON FUNCTION public.pke_guard_p2a_identity_verification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pke_guard_p2a_product_classification() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pke_validate_p2a_facility_evidence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pke_validate_p2a_quality_provenance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_guard_p2a_identity_verification() TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_guard_p2a_product_classification() TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_validate_p2a_facility_evidence() TO app_runtime_secure;
GRANT EXECUTE ON FUNCTION public.pke_validate_p2a_quality_provenance() TO app_runtime_secure;

COMMIT;