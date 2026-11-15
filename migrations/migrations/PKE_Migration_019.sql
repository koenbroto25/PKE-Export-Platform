-- PKE Export Platform
-- Migration 019: project-scoped RBAC, invitation lifecycle, export master data, and fail-closed RLS
-- Tested on Neon branch: p03-backend-hardening-test (not staging / not production)
-- IMPORTANT: Country-specific document requirements are not seeded as mandatory until officially verified.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Country and buyer/project destination master
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.countries (
  country_code char(2) PRIMARY KEY,
  country_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.countries(country_code, country_name)
VALUES ('CN', 'China'), ('PK', 'Pakistan')
ON CONFLICT (country_code)
DO UPDATE SET country_name = EXCLUDED.country_name, is_active = true;

ALTER TABLE public.buyers ADD COLUMN IF NOT EXISTS country_code char(2);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS export_country_code char(2);
ALTER TABLE public.pks_sites ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.pks_sites ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.pks_sites ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE public.pks_sites ADD COLUMN IF NOT EXISTS country_code char(2);
ALTER TABLE public.pks_sites ADD COLUMN IF NOT EXISTS latitude numeric(9,6);
ALTER TABLE public.pks_sites ADD COLUMN IF NOT EXISTS longitude numeric(10,6);
ALTER TABLE public.ports ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.ports ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.ports ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE public.ports ADD COLUMN IF NOT EXISTS country_code char(2);
ALTER TABLE public.ports ADD COLUMN IF NOT EXISTS latitude numeric(9,6);
ALTER TABLE public.ports ADD COLUMN IF NOT EXISTS longitude numeric(10,6);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'buyers_country_code_fkey') THEN
    ALTER TABLE public.buyers ADD CONSTRAINT buyers_country_code_fkey
      FOREIGN KEY (country_code) REFERENCES public.countries(country_code) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_export_country_code_fkey') THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_export_country_code_fkey
      FOREIGN KEY (export_country_code) REFERENCES public.countries(country_code) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pks_sites_country_code_fkey') THEN
    ALTER TABLE public.pks_sites ADD CONSTRAINT pks_sites_country_code_fkey
      FOREIGN KEY (country_code) REFERENCES public.countries(country_code) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ports_country_code_fkey') THEN
    ALTER TABLE public.ports ADD CONSTRAINT ports_country_code_fkey
      FOREIGN KEY (country_code) REFERENCES public.countries(country_code) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Project-scoped roles, permissions, participant lifecycle and invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role_code text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_roles_project_code_unique UNIQUE (project_id, role_code),
  CONSTRAINT project_roles_id_project_unique UNIQUE (id, project_id)
);

ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS project_role_id uuid;
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES public.users(id);
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS invited_at timestamptz;
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_user_unique
  ON public.project_members(project_id, user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_members_project_role_same_project_fkey') THEN
    ALTER TABLE public.project_members ADD CONSTRAINT project_members_project_role_same_project_fkey
      FOREIGN KEY (project_role_id, project_id) REFERENCES public.project_roles(id, project_id) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.project_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  project_role_id uuid NOT NULL,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_role_permissions_role_project_fkey
    FOREIGN KEY (project_role_id, project_id)
    REFERENCES public.project_roles(id, project_id) ON DELETE CASCADE,
  CONSTRAINT project_role_permissions_unique UNIQUE (project_role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.project_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_role_id uuid NOT NULL,
  invitation_email text NOT NULL,
  display_name text,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid NOT NULL REFERENCES public.users(id),
  accepted_user_id uuid REFERENCES public.users(id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_invitations_role_project_fkey
    FOREIGN KEY (project_role_id, project_id)
    REFERENCES public.project_roles(id, project_id)
);
CREATE INDEX IF NOT EXISTS project_invitations_project_status_idx
  ON public.project_invitations(project_id, status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS project_invitations_pending_email_unique
  ON public.project_invitations(project_id, lower(invitation_email))
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 3. PKC product, specification, PKS-port routes, and per-project operations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL UNIQUE,
  product_name text NOT NULL,
  category text NOT NULL DEFAULT 'agricultural_product',
  description text,
  base_unit text NOT NULL DEFAULT 'MT',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.product_catalog(product_code, product_name, category, description, base_unit)
VALUES ('PKC', 'Palm Kernel Cake', 'palm_kernel_product', 'Palm kernel cake (bungkil inti sawit)', 'MT')
ON CONFLICT (product_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.product_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.product_catalog(id),
  specification_code text NOT NULL,
  version_no integer NOT NULL DEFAULT 1,
  specification_name text NOT NULL,
  specification_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  test_methods jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_reference text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'superseded', 'inactive')),
  effective_from date,
  effective_to date,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_specifications_version_unique UNIQUE (product_id, specification_code, version_no)
);

CREATE TABLE IF NOT EXISTS public.pks_port_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pks_site_id uuid NOT NULL REFERENCES public.pks_sites(id) ON DELETE CASCADE,
  port_id uuid NOT NULL REFERENCES public.ports(id) ON DELETE CASCADE,
  route_mode text NOT NULL DEFAULT 'road'
    CHECK (route_mode IN ('road', 'river', 'sea', 'multimodal')),
  distance_km numeric(10,2),
  estimated_travel_minutes integer,
  route_notes text,
  source_reference text,
  verified_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pks_port_routes_unique UNIQUE (pks_site_id, port_id, route_mode),
  CONSTRAINT pks_port_routes_distance_nonnegative CHECK (distance_km IS NULL OR distance_km >= 0)
);

CREATE TABLE IF NOT EXISTS public.project_operating_profiles (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  logistics_mode text NOT NULL DEFAULT 'unspecified'
    CHECK (logistics_mode IN ('trucking', 'direct_port', 'hybrid', 'unspecified')),
  uses_trucking boolean NOT NULL DEFAULT false,
  pks_owns_or_controls_port boolean NOT NULL DEFAULT false,
  financing_enabled boolean NOT NULL DEFAULT false,
  financier_reporting_required boolean NOT NULL DEFAULT false,
  primary_pks_site_id uuid REFERENCES public.pks_sites(id),
  primary_port_id uuid REFERENCES public.ports(id),
  operating_notes text,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_operating_profile_trucking_consistency
    CHECK (logistics_mode <> 'direct_port' OR uses_trucking = false)
);

CREATE TABLE IF NOT EXISTS public.project_supplier_participation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  participation_type text NOT NULL
    CHECK (participation_type IN ('raw_material', 'service', 'trucking', 'port_operator', 'pks_operator', 'other')),
  is_active boolean NOT NULL DEFAULT true,
  start_date date,
  end_date date,
  notes text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_supplier_participation_unique UNIQUE (project_id, vendor_id, participation_type)
);

CREATE TABLE IF NOT EXISTS public.project_financiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  funding_type text NOT NULL DEFAULT 'working_capital',
  commitment_amount numeric(18,2),
  currency_id uuid REFERENCES public.currencies(id),
  financial_reporting_required boolean NOT NULL DEFAULT false,
  reporting_frequency text
    CHECK (reporting_frequency IS NULL OR reporting_frequency IN ('monthly', 'quarterly', 'milestone', 'annual')),
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_financiers_unique UNIQUE (project_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS public.project_product_specifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.product_catalog(id),
  product_specification_id uuid REFERENCES public.product_specifications(id),
  contract_specification_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  monthly_tonnage numeric(15,2),
  contracted_tonnage numeric(15,2),
  quantity_unit text NOT NULL DEFAULT 'MT',
  effective_from date,
  effective_to date,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_product_specifications_tonnage_nonnegative
    CHECK ((monthly_tonnage IS NULL OR monthly_tonnage >= 0)
       AND (contracted_tonnage IS NULL OR contracted_tonnage >= 0))
);

-- ---------------------------------------------------------------------------
-- 4. Export document catalogue, country rules, project requirements and files
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.export_document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_code text NOT NULL UNIQUE,
  document_name text NOT NULL,
  document_category text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.export_document_types(document_code, document_name, document_category, description)
VALUES
 ('COMMERCIAL_INVOICE', 'Commercial Invoice', 'commercial', 'Invoice issued for export transaction'),
 ('PACKING_LIST', 'Packing List', 'commercial', 'Detailed list of goods and packages'),
 ('BILL_OF_LADING', 'Bill of Lading', 'transport', 'Transport document issued for ocean shipment'),
 ('CERTIFICATE_OF_ORIGIN', 'Certificate of Origin', 'origin', 'Document identifying country of origin'),
 ('CERTIFICATE_OF_ANALYSIS', 'Certificate of Analysis', 'quality', 'Quality analysis for the exported product'),
 ('PHYTOSANITARY_CERTIFICATE', 'Phytosanitary Certificate', 'plant_health', 'Plant-health certificate where required'),
 ('FUMIGATION_CERTIFICATE', 'Fumigation Certificate', 'treatment', 'Fumigation evidence where required'),
 ('WEIGHT_CERTIFICATE', 'Weight Certificate', 'quantity', 'Certified shipment weight where required')
ON CONFLICT (document_code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.country_export_document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL REFERENCES public.countries(country_code),
  product_id uuid REFERENCES public.product_catalog(id),
  document_type_id uuid NOT NULL REFERENCES public.export_document_types(id),
  regulatory_source_id uuid REFERENCES public.regulatory_sources(id),
  importing_authority text,
  mandatory boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_verification', 'verified', 'active', 'superseded')),
  effective_from date,
  effective_to date,
  official_source_url text,
  notes text,
  last_verified_at timestamptz,
  verified_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT country_export_document_requirement_unique
    UNIQUE (country_code, product_id, document_type_id, effective_from)
);

CREATE TABLE IF NOT EXISTS public.project_export_document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  country_requirement_id uuid NOT NULL REFERENCES public.country_export_document_requirements(id),
  is_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'waived', 'not_applicable', 'completed')),
  override_reason text,
  overridden_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_export_document_requirement_unique UNIQUE (project_id, country_requirement_id)
);

CREATE TABLE IF NOT EXISTS public.project_export_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  project_requirement_id uuid NOT NULL REFERENCES public.project_export_document_requirements(id) ON DELETE CASCADE,
  file_reference text NOT NULL,
  object_key text,
  original_filename text,
  mime_type text,
  sha256_checksum text,
  version_no integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'under_review', 'approved', 'rejected', 'expired', 'superseded')),
  uploaded_by uuid NOT NULL REFERENCES public.users(id),
  reviewed_by uuid REFERENCES public.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  expiry_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_export_documents_version_unique UNIQUE (project_requirement_id, version_no)
);

ALTER TABLE public.approval_events
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Granular permissions. Role assignments are per-project in project_role_permissions.
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions(code, name, description, is_active)
VALUES
 ('project.view','View Project','View a project and project-scoped data',true),
 ('project.create','Create Project','Create a new project',true),
 ('project.update','Edit Project','Update project configuration',true),
 ('project.delete','Close Project','Close or archive a project',true),
 ('project.members.view','View Project Members','View project participants',true),
 ('project.members.invite','Invite Project Members','Invite participants to a project',true),
 ('project.members.manage','Manage Project Members','Change or deactivate project memberships',true),
 ('project.roles.manage','Manage Project Roles','Create project-specific roles and assign permissions',true),
 ('project.change.view','View Change Requests','View project change requests',true),
 ('project.change.create','Create Change Requests','Create project change requests',true),
 ('project.change.update','Manage Change Requests','Approve or update project change requests',true),
 ('contract.view','View Contract','View contract and buyer information linked to a project',true),
 ('inventory.view','View Inventory','View project inventory and warehouse records',true),
 ('inventory.create','Record Inventory','Create project inventory records',true),
 ('inventory.update','Update Inventory','Update project inventory records',true),
 ('inventory.delete','Delete Inventory','Delete project inventory records',true),
 ('operations.view','View Operations','View operational records',true),
 ('operations.create','Record Operations','Create operational records',true),
 ('operations.update','Update Operations','Update operational records',true),
 ('operations.delete','Delete Operations','Delete operational records',true),
 ('logistics.view','View Logistics','View trucking and logistics records',true),
 ('logistics.create','Record Logistics','Create trucking and logistics records',true),
 ('logistics.update','Update Logistics','Update trucking and logistics records',true),
 ('logistics.delete','Delete Logistics','Delete trucking and logistics records',true),
 ('shipping.view','View Shipping','View vessel, voyage, shipment and loading records',true),
 ('shipping.create','Record Shipping','Create shipment and voyage records',true),
 ('shipping.update','Update Shipping','Update shipping and loading records',true),
 ('shipping.delete','Delete Shipping','Delete shipping records',true),
 ('finance.view','View Finance','View project finance records',true),
 ('finance.create','Record Finance','Create project finance records',true),
 ('finance.update','Manage Finance','Update project finance records',true),
 ('finance.delete','Delete Finance','Delete project finance records',true),
 ('fx.view','View FX','View foreign-exchange exposure and rates',true),
 ('fx.create','Record FX','Create foreign-exchange exposure records',true),
 ('fx.update','Manage FX','Update foreign-exchange exposure records',true),
 ('fx.delete','Delete FX','Delete foreign-exchange exposure records',true),
 ('accounting.view','View Accounting','View accounting ledgers and journal lines',true),
 ('accounting.create','Record Accounting','Create accounting journal entries',true),
 ('accounting.update','Manage Accounting','Update accounting journal entries',true),
 ('accounting.delete','Delete Accounting','Delete accounting journal entries',true),
 ('reports.view','View Reports','View project reports and schedules',true),
 ('reports.create','Create Reports','Create project report runs and schedules',true),
 ('reports.update','Manage Reports','Update project report schedules',true),
 ('reports.delete','Delete Reports','Delete report schedules',true),
 ('workflow.view','View Workflow','View project workflow and stage records',true),
 ('workflow.create','Create Workflow','Create project workflow records',true),
 ('workflow.update','Manage Workflow','Update project workflow and stages',true),
 ('workflow.delete','Delete Workflow','Delete workflow records',true),
 ('documents.view','View Export Documents','View project export-document records',true),
 ('documents.upload','Upload Export Documents','Upload project export documents',true),
 ('documents.verify','Verify Export Documents','Review and verify project export documents',true),
 ('documents.manage','Manage Export Documents','Manage project document requirements',true),
 ('documents.create','Create Document Record','Create export document records',true),
 ('documents.update','Update Document Record','Update export document records',true),
 ('documents.delete','Remove Document Record','Remove export document records',true),
 ('supplier.view','View Suppliers','View suppliers assigned to a project',true),
 ('supplier.create','Add Supplier Participation','Add a supplier to a project',true),
 ('supplier.update','Update Supplier Participation','Update project supplier assignment',true),
 ('supplier.delete','Remove Supplier Participation','Remove project supplier assignment',true),
 ('supplier.manage','Manage Suppliers','Manage supplier participation',true),
 ('product_specs.view','View Product Specifications','View project product specifications',true),
 ('product_specs.create','Add Product Specification','Add contract product specification',true),
 ('product_specs.update','Update Product Specification','Update contract product specification',true),
 ('product_specs.delete','Remove Product Specification','Remove project product specification',true),
 ('product_specs.manage','Manage Product Specifications','Manage project product specifications',true),
 ('approvals.view','View Approvals','View project approvals',true),
 ('approvals.manage','Manage Approvals','Approve project actions',true)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = true;

-- ---------------------------------------------------------------------------
-- 6. Authorization helpers. User/role context must be set only by the trusted API after JWT verification.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pke_current_user_id()
RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog
AS $$ SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION public.pke_is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND u.is_active = true AND u.role::text = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.pke_has_any_project_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.pke_is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.project_members pm
    JOIN public.projects p ON p.id = pm.project_id
    JOIN public.users u ON u.id = pm.user_id
    WHERE pm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND pm.is_active = true AND pm.deactivated_at IS NULL
      AND (pm.expires_at IS NULL OR pm.expires_at > now())
      AND p.is_active = true AND u.is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.pke_has_project_permission(p_project_id uuid, p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.pke_is_platform_admin() OR EXISTS (
    SELECT 1
    FROM public.project_members pm
    JOIN public.project_roles pr ON pr.id = pm.project_role_id AND pr.project_id = pm.project_id
    JOIN public.project_role_permissions prp ON prp.project_role_id = pr.id AND prp.project_id = pr.project_id
    JOIN public.permissions perm ON perm.id = prp.permission_id
    JOIN public.projects proj ON proj.id = pm.project_id
    JOIN public.users u ON u.id = pm.user_id
    WHERE pm.project_id = p_project_id
      AND pm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND pm.is_active = true AND pm.deactivated_at IS NULL
      AND (pm.expires_at IS NULL OR pm.expires_at > now())
      AND pr.is_active = true AND proj.is_active = true AND u.is_active = true
      AND perm.is_active = true AND perm.code = p_permission_code
  )
$$;

CREATE OR REPLACE FUNCTION public.pke_has_contract_permission(p_contract_id uuid, p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.pke_is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.projects p JOIN public.contract_programs cp ON cp.id = p.contract_program_id
    WHERE cp.contract_id = p_contract_id AND public.pke_has_project_permission(p.id, p_permission_code)
  )
$$;

CREATE OR REPLACE FUNCTION public.pke_has_program_permission(p_program_id uuid, p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.pke_is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.contract_program_id = p_program_id AND public.pke_has_project_permission(p.id, p_permission_code)
  )
$$;

CREATE OR REPLACE FUNCTION public.pke_has_buyer_permission(p_buyer_id uuid, p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.pke_is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.projects p JOIN public.contract_programs cp ON cp.id = p.contract_program_id
    WHERE cp.buyer_id = p_buyer_id AND public.pke_has_project_permission(p.id, p_permission_code)
  )
$$;

CREATE OR REPLACE FUNCTION public.pke_has_template_permission(p_template_id uuid, p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.pke_is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.projects p JOIN public.project_templates pt ON pt.contract_program_id = p.contract_program_id
    WHERE pt.id = p_template_id AND public.pke_has_project_permission(p.id, p_permission_code)
  )
$$;

CREATE OR REPLACE FUNCTION public.pke_has_workflow_permission(p_workflow_id uuid, p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.pke_is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.project_workflows pw
    WHERE pw.id = p_workflow_id AND public.pke_has_project_permission(pw.project_id, p_permission_code)
  )
$$;

CREATE OR REPLACE FUNCTION public.pke_has_shipment_permission(p_shipment_id uuid, p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.pke_is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.shipments s
    WHERE s.id = p_shipment_id AND public.pke_has_project_permission(s.project_id, p_permission_code)
  )
$$;

CREATE OR REPLACE FUNCTION public.pke_has_tracking_event_permission(p_event_id uuid, p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.pke_is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.tracking_events te JOIN public.truck_trips tt ON tt.id = te.truck_trip_id
    WHERE te.id = p_event_id AND public.pke_has_project_permission(tt.project_id, p_permission_code)
  )
$$;

CREATE OR REPLACE FUNCTION public.pke_has_journal_entry_permission(p_entry_id uuid, p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.pke_is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.journal_entries je
    WHERE je.id = p_entry_id AND public.pke_has_project_permission(je.project_id, p_permission_code)
  )
$$;

CREATE OR REPLACE FUNCTION public.pke_has_stage_permission(p_stage_id uuid, p_permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.pke_is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.workflow_stages ws
    WHERE ws.id = p_stage_id AND public.pke_has_workflow_permission(ws.workflow_id, p_permission_code)
  )
$$;

CREATE OR REPLACE FUNCTION public.pke_can_view_user(p_target_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.pke_is_platform_admin()
    OR p_target_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1
      FROM public.project_members target_pm
      JOIN public.project_members viewer_pm ON viewer_pm.project_id = target_pm.project_id
      WHERE target_pm.user_id = p_target_user_id
        AND viewer_pm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND target_pm.is_active = true AND viewer_pm.is_active = true
        AND target_pm.deactivated_at IS NULL AND viewer_pm.deactivated_at IS NULL
        AND (target_pm.expires_at IS NULL OR target_pm.expires_at > now())
        AND (viewer_pm.expires_at IS NULL OR viewer_pm.expires_at > now())
        AND public.pke_has_project_permission(viewer_pm.project_id, 'project.members.view')
    )
$$;

-- ---------------------------------------------------------------------------
-- 7. Replace the previous broad policies atomically. All public tables fail closed.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', t.policyname, t.schemaname, t.tablename);
  END LOOP;
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format(
      'CREATE POLICY pke_admin_all ON public.%I FOR ALL TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin())',
      t.relname
    );
  END LOOP;
END $$;

-- Directly project-scoped tables use the row's own project_id.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('project_change_requests','project.change'), ('project_versions','project'),
      ('project_workflows','workflow'), ('inventory_lots','inventory'),
      ('inventory_movements','inventory'), ('loading_operations','operations'),
      ('packing_batches','inventory'), ('shipments','shipping'),
      ('transport_legs','logistics'), ('truck_trips','logistics'), ('voyages','shipping'),
      ('warehouse_receipts','inventory'), ('ap_invoices','finance'), ('ar_invoices','finance'),
      ('cash_advances','finance'), ('cash_schedules','finance'), ('cost_obligations','finance'),
      ('fx_exposure','fx'), ('fx_exposures','fx'), ('journal_entries','accounting'),
      ('payment_obligations','finance'), ('project_profitability','finance'), ('rab','finance'),
      ('report_runs','reports'), ('report_schedules','reports'),
      ('settlement_checklist_items','operations'), ('project_operating_profiles','operations'),
      ('project_supplier_participation','supplier'), ('project_financiers','finance'),
      ('project_product_specifications','product_specs'),
      ('project_export_document_requirements','documents'), ('project_export_documents','documents')
    ) AS m(table_name, permission_prefix)
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO app_runtime_secure USING (public.pke_has_project_permission(project_id,%L))',
      'pke_' || r.table_name || '_select', r.table_name, r.permission_prefix || '.view');
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_has_project_permission(project_id,%L))',
      'pke_' || r.table_name || '_insert', r.table_name, r.permission_prefix || '.create');
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO app_runtime_secure USING (public.pke_has_project_permission(project_id,%L)) WITH CHECK (public.pke_has_project_permission(project_id,%L))',
      'pke_' || r.table_name || '_update', r.table_name, r.permission_prefix || '.update', r.permission_prefix || '.update');
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO app_runtime_secure USING (public.pke_has_project_permission(project_id,%L))',
      'pke_' || r.table_name || '_delete', r.table_name, r.permission_prefix || '.delete');
  END LOOP;
END $$;

-- Projects and their members/roles/invitations.
CREATE POLICY pke_projects_select ON public.projects FOR SELECT TO app_runtime_secure
  USING (public.pke_has_project_permission(id, 'project.view'));
CREATE POLICY pke_projects_update ON public.projects FOR UPDATE TO app_runtime_secure
  USING (public.pke_has_project_permission(id, 'project.update'))
  WITH CHECK (public.pke_has_project_permission(id, 'project.update'));

CREATE POLICY pke_project_members_select ON public.project_members FOR SELECT TO app_runtime_secure
  USING (user_id = public.pke_current_user_id() OR public.pke_has_project_permission(project_id, 'project.members.view'));
CREATE POLICY pke_project_members_insert ON public.project_members FOR INSERT TO app_runtime_secure
  WITH CHECK (public.pke_has_project_permission(project_id, 'project.members.invite'));
CREATE POLICY pke_project_members_update ON public.project_members FOR UPDATE TO app_runtime_secure
  USING (public.pke_has_project_permission(project_id, 'project.members.manage'))
  WITH CHECK (public.pke_has_project_permission(project_id, 'project.members.manage'));
CREATE POLICY pke_project_members_delete ON public.project_members FOR DELETE TO app_runtime_secure
  USING (public.pke_has_project_permission(project_id, 'project.members.manage'));

CREATE POLICY pke_project_roles_select ON public.project_roles FOR SELECT TO app_runtime_secure
  USING (public.pke_has_project_permission(project_id, 'project.view'));
CREATE POLICY pke_project_roles_insert ON public.project_roles FOR INSERT TO app_runtime_secure
  WITH CHECK (public.pke_has_project_permission(project_id, 'project.roles.manage'));
CREATE POLICY pke_project_roles_update ON public.project_roles FOR UPDATE TO app_runtime_secure
  USING (public.pke_has_project_permission(project_id, 'project.roles.manage'))
  WITH CHECK (public.pke_has_project_permission(project_id, 'project.roles.manage'));
CREATE POLICY pke_project_roles_delete ON public.project_roles FOR DELETE TO app_runtime_secure
  USING (public.pke_has_project_permission(project_id, 'project.roles.manage'));

CREATE POLICY pke_project_role_permissions_select ON public.project_role_permissions FOR SELECT TO app_runtime_secure
  USING (public.pke_has_project_permission(project_id, 'project.roles.manage'));
CREATE POLICY pke_project_role_permissions_insert ON public.project_role_permissions FOR INSERT TO app_runtime_secure
  WITH CHECK (public.pke_has_project_permission(project_id, 'project.roles.manage'));
CREATE POLICY pke_project_role_permissions_update ON public.project_role_permissions FOR UPDATE TO app_runtime_secure
  USING (public.pke_has_project_permission(project_id, 'project.roles.manage'))
  WITH CHECK (public.pke_has_project_permission(project_id, 'project.roles.manage'));
CREATE POLICY pke_project_role_permissions_delete ON public.project_role_permissions FOR DELETE TO app_runtime_secure
  USING (public.pke_has_project_permission(project_id, 'project.roles.manage'));

CREATE POLICY pke_project_invitations_select ON public.project_invitations FOR SELECT TO app_runtime_secure
  USING (public.pke_has_project_permission(project_id, 'project.members.view'));
CREATE POLICY pke_project_invitations_insert ON public.project_invitations FOR INSERT TO app_runtime_secure
  WITH CHECK (public.pke_has_project_permission(project_id, 'project.members.invite'));
CREATE POLICY pke_project_invitations_update ON public.project_invitations FOR UPDATE TO app_runtime_secure
  USING (public.pke_has_project_permission(project_id, 'project.members.manage'))
  WITH CHECK (public.pke_has_project_permission(project_id, 'project.members.manage'));
CREATE POLICY pke_project_invitations_delete ON public.project_invitations FOR DELETE TO app_runtime_secure
  USING (public.pke_has_project_permission(project_id, 'project.members.manage'));

CREATE POLICY pke_users_select ON public.users FOR SELECT TO app_runtime_secure
  USING (public.pke_can_view_user(id));

-- Indirect project-owned records must resolve through their owning project.
CREATE POLICY pke_contract_programs_select ON public.contract_programs FOR SELECT TO app_runtime_secure
  USING (public.pke_has_program_permission(id, 'contract.view'));
CREATE POLICY pke_contracts_select ON public.contracts FOR SELECT TO app_runtime_secure
  USING (public.pke_has_contract_permission(id, 'contract.view'));
CREATE POLICY pke_buyers_select ON public.buyers FOR SELECT TO app_runtime_secure
  USING (public.pke_has_buyer_permission(id, 'contract.view'));
CREATE POLICY pke_cycle_policies_select ON public.cycle_policies FOR SELECT TO app_runtime_secure
  USING (public.pke_has_program_permission(contract_program_id, 'contract.view'));
CREATE POLICY pke_buyer_parties_select ON public.buyer_parties FOR SELECT TO app_runtime_secure
  USING (EXISTS (SELECT 1 FROM public.buyers b WHERE b.id = buyer_parties.buyer_id
    AND public.pke_has_buyer_permission(b.id, 'contract.view')));
CREATE POLICY pke_project_templates_select ON public.project_templates FOR SELECT TO app_runtime_secure
  USING (public.pke_has_program_permission(contract_program_id, 'workflow.view'));
CREATE POLICY pke_project_template_versions_select ON public.project_template_versions FOR SELECT TO app_runtime_secure
  USING (public.pke_has_template_permission(project_template_id, 'workflow.view'));
CREATE POLICY pke_journal_lines_select ON public.journal_lines FOR SELECT TO app_runtime_secure
  USING (public.pke_has_journal_entry_permission(journal_entry_id, 'accounting.view'));
CREATE POLICY pke_shipment_allocations_select ON public.shipment_allocations FOR SELECT TO app_runtime_secure
  USING (public.pke_has_shipment_permission(shipment_id, 'shipping.view'));
CREATE POLICY pke_stage_transitions_select ON public.stage_transitions FOR SELECT TO app_runtime_secure
  USING (public.pke_has_stage_permission(stage_id, 'workflow.view'));
CREATE POLICY pke_tracking_events_select ON public.tracking_events FOR SELECT TO app_runtime_secure
  USING (public.pke_has_tracking_event_permission(id, 'logistics.view'));
CREATE POLICY pke_tracking_evidence_select ON public.tracking_evidence FOR SELECT TO app_runtime_secure
  USING (public.pke_has_tracking_event_permission(tracking_event_id, 'logistics.view'));

-- Legacy approval events without a project_id remain admin-only.
CREATE POLICY pke_approval_events_select ON public.approval_events FOR SELECT TO app_runtime_secure
  USING (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'approvals.view'));
CREATE POLICY pke_approval_events_insert ON public.approval_events FOR INSERT TO app_runtime_secure
  WITH CHECK (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'approvals.manage'));
CREATE POLICY pke_approval_events_update ON public.approval_events FOR UPDATE TO app_runtime_secure
  USING (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'approvals.manage'))
  WITH CHECK (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'approvals.manage'));

-- Global reference catalogs are read-only for active project participants.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'countries','product_catalog','export_document_types','pks_sites','ports','pks_port_routes',
    'vessels','warehouses','vendors','service_vendors','currencies','fx_rates','fx_history',
    'payment_methods','cost_categories','chart_of_accounts','role_catalog','permissions'
  ]
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO app_runtime_secure USING (public.pke_has_any_project_access())',
      'pke_' || t || '_member_read', t);
  END LOOP;
END $$;

CREATE POLICY pke_product_specs_read ON public.product_specifications FOR SELECT TO app_runtime_secure
  USING (public.pke_has_any_project_access() AND status = 'approved');
CREATE POLICY pke_regulatory_sources_read ON public.regulatory_sources FOR SELECT TO app_runtime_secure
  USING (public.pke_has_any_project_access() AND verification_status IN ('verified', 'approved'));
CREATE POLICY pke_country_document_requirements_read ON public.country_export_document_requirements
  FOR SELECT TO app_runtime_secure
  USING (public.pke_has_any_project_access() AND status IN ('verified', 'active'));
CREATE POLICY pke_report_export_audit_select ON public.report_export_audit FOR SELECT TO app_runtime_secure
  USING (user_id = public.pke_current_user_id());
CREATE POLICY pke_report_export_audit_insert ON public.report_export_audit FOR INSERT TO app_runtime_secure
  WITH CHECK (user_id = public.pke_current_user_id());

-- Application runtime table privileges; row access is decided by RLS policies above.
GRANT USAGE ON SCHEMA public TO app_runtime_secure;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime_secure;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime_secure;

-- Internal authorization helpers are executable only by the trusted backend runtime.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.pke_current_user_id()', 'public.pke_is_platform_admin()',
    'public.pke_has_any_project_access()', 'public.pke_has_project_permission(uuid,text)',
    'public.pke_has_contract_permission(uuid,text)', 'public.pke_has_program_permission(uuid,text)',
    'public.pke_has_buyer_permission(uuid,text)', 'public.pke_has_template_permission(uuid,text)',
    'public.pke_has_workflow_permission(uuid,text)', 'public.pke_has_shipment_permission(uuid,text)',
    'public.pke_has_tracking_event_permission(uuid,text)', 'public.pke_has_journal_entry_permission(uuid,text)',
    'public.pke_has_stage_permission(uuid,text)', 'public.pke_can_view_user(uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO app_runtime_secure', f);
  END LOOP;
END $$;

-- Authentication secrets belong to Neon Auth, not public.users.
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;
COMMENT ON COLUMN public.users.password_hash IS
  'Deprecated for runtime authentication. Credentials are managed by the configured identity provider; never populate or expose this column.';
REVOKE ALL ON TABLE public.users FROM app_runtime_secure;
GRANT SELECT (id, email, name, role, mfa_enabled, is_active, created_at, updated_at, neon_auth_user_id)
  ON TABLE public.users TO app_runtime_secure;
GRANT INSERT (id, email, name, role, mfa_enabled, is_active, neon_auth_user_id)
  ON TABLE public.users TO app_runtime_secure;
GRANT UPDATE (name, updated_at, is_active, role, neon_auth_user_id)
  ON TABLE public.users TO app_runtime_secure;

COMMIT;
