-- Migration 113: platform-scoped PM appointment and appointment-first Project creation.
-- Prepared for review only. No Neon branch is mutated by this repository commit.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pm_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active','suspended','revoked')),
  appointed_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  appointed_at timestamptz NOT NULL DEFAULT now(),
  status_changed_by uuid REFERENCES public.users(id),
  status_changed_at timestamptz,
  status_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='active' AND status_reason IS NULL) OR status<>'active')
);
CREATE UNIQUE INDEX IF NOT EXISTS pm_appointments_one_active_user
  ON public.pm_appointments(user_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS pm_appointments_status_idx ON public.pm_appointments(status,appointed_at DESC);

CREATE TABLE IF NOT EXISTS public.pm_appointment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.pm_appointments(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  event_code text NOT NULL CHECK(event_code IN ('appointed','suspended','reactivated','revoked')),
  reason text NOT NULL CHECK(length(btrim(reason))>=5),
  before_snapshot jsonb,
  after_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pm_appointment_events_user_idx ON public.pm_appointment_events(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.project_pm_ownership (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE RESTRICT,
  pm_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  appointment_id uuid NOT NULL REFERENCES public.pm_appointments(id) ON DELETE RESTRICT,
  assigned_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_pm_ownership_pm_idx ON public.project_pm_ownership(pm_user_id,assigned_at DESC);

CREATE TABLE IF NOT EXISTS public.project_pm_ownership_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  from_pm_user_id uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  to_pm_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK(length(btrim(reason))>=5),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_pm_ownership_events_project_idx ON public.project_pm_ownership_events(project_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.project_commercial_basis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE RESTRICT,
  buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE RESTRICT,
  basis_type text NOT NULL CHECK(basis_type IN ('buyer_agreement','executed_contract')),
  basis_reference text NOT NULL CHECK(length(btrim(basis_reference))>=2),
  basis_date date,
  contract_reference text,
  evidence_url text,
  commercial_terms jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(commercial_terms)='object'),
  notes text,
  recorded_by uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(basis_type<>'executed_contract' OR length(btrim(coalesce(contract_reference,'')))>=2)
);
CREATE INDEX IF NOT EXISTS project_commercial_basis_buyer_idx ON public.project_commercial_basis(buyer_id,created_at DESC);

-- Backfill active Project PM appointments into the new global appointment model.
-- Existing assignment history remains untouched; this only creates a platform appointment
-- and current-ownership index for users/projects with one verified active PM assignment.
INSERT INTO public.pm_appointments(user_id,status,appointed_by,appointed_at)
SELECT DISTINCT a.user_id,'active',coalesce(a.assigned_by,a.user_id),min(a.assigned_at)
  FROM public.project_role_assignments a
  JOIN public.project_roles r ON r.id=a.project_role_id AND r.project_id=a.project_id AND r.role_code='pm'
  JOIN public.project_members m ON m.id=a.project_member_id AND m.project_id=a.project_id AND m.user_id=a.user_id
  JOIN public.users u ON u.id=a.user_id AND u.is_active=true AND u.neon_auth_user_id IS NOT NULL
 WHERE a.is_active=true AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>now())
   AND m.is_active=true AND m.deactivated_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>now())
 GROUP BY a.user_id
ON CONFLICT DO NOTHING;

INSERT INTO public.pm_appointment_events(appointment_id,user_id,actor_user_id,event_code,reason,after_snapshot)
SELECT ap.id,ap.user_id,ap.appointed_by,'appointed','Legacy active Project PM assignment backfill',to_jsonb(ap)
 FROM public.pm_appointments ap
 WHERE ap.appointed_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.pm_appointment_events ev WHERE ev.appointment_id=ap.id)
ON CONFLICT DO NOTHING;

INSERT INTO public.project_pm_ownership(project_id,pm_user_id,appointment_id,assigned_by,assigned_at)
SELECT a.project_id,a.user_id,ap.id,coalesce(a.assigned_by,a.user_id),a.assigned_at
 FROM public.project_role_assignments a
 JOIN public.project_roles r ON r.id=a.project_role_id AND r.project_id=a.project_id AND r.role_code='pm'
 JOIN public.pm_appointments ap ON ap.user_id=a.user_id AND ap.status='active'
 WHERE a.is_active=true AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>now())
ON CONFLICT(project_id) DO NOTHING;

INSERT INTO public.project_pm_ownership_events(project_id,to_pm_user_id,actor_user_id,reason)
SELECT o.project_id,o.pm_user_id,o.assigned_by,'Legacy PM assignment backfill'
 FROM public.project_pm_ownership o
 WHERE NOT EXISTS(SELECT 1 FROM public.project_pm_ownership_events ev WHERE ev.project_id=o.project_id)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pm_project_create_idempotency (
  pm_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(pm_user_id,idempotency_key)
);

ALTER TABLE public.pm_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pm_appointment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_appointment_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_pm_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_pm_ownership FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_pm_ownership_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_pm_ownership_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_commercial_basis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_commercial_basis FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pm_project_create_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_project_create_idempotency FORCE ROW LEVEL SECURITY;

CREATE POLICY pm_appointments_admin_select ON public.pm_appointments FOR SELECT TO app_runtime_secure USING(public.pke_is_platform_admin());
CREATE POLICY pm_appointments_self_select ON public.pm_appointments FOR SELECT TO app_runtime_secure USING(user_id=public.pke_current_user_id());
CREATE POLICY pm_appointment_events_admin_select ON public.pm_appointment_events FOR SELECT TO app_runtime_secure USING(public.pke_is_platform_admin());
CREATE POLICY pm_appointment_events_self_select ON public.pm_appointment_events FOR SELECT TO app_runtime_secure USING(user_id=public.pke_current_user_id());
CREATE POLICY project_pm_ownership_admin_select ON public.project_pm_ownership FOR SELECT TO app_runtime_secure USING(public.pke_is_platform_admin());
CREATE POLICY project_pm_ownership_pm_select ON public.project_pm_ownership FOR SELECT TO app_runtime_secure USING(pm_user_id=public.pke_current_user_id());
CREATE POLICY project_pm_ownership_project_select ON public.project_pm_ownership FOR SELECT TO app_runtime_secure USING(public.pke_has_project_permission(project_id,'project.view'));
CREATE POLICY project_pm_ownership_events_admin_select ON public.project_pm_ownership_events FOR SELECT TO app_runtime_secure USING(public.pke_is_platform_admin());
CREATE POLICY project_pm_ownership_events_pm_select ON public.project_pm_ownership_events FOR SELECT TO app_runtime_secure USING(from_pm_user_id=public.pke_current_user_id() OR to_pm_user_id=public.pke_current_user_id());
CREATE POLICY project_commercial_basis_admin_select ON public.project_commercial_basis FOR SELECT TO app_runtime_secure USING(public.pke_is_platform_admin());
CREATE POLICY project_commercial_basis_project_select ON public.project_commercial_basis FOR SELECT TO app_runtime_secure USING(public.pke_has_project_permission(project_id,'contract.view'));
CREATE POLICY pm_project_create_idempotency_self_select ON public.pm_project_create_idempotency FOR SELECT TO app_runtime_secure USING(pm_user_id=public.pke_current_user_id());

-- Ensure the canonical PM permission codes exist in the catalog. This is additive;
-- existing catalog names/descriptions are preserved and no access is granted by catalog rows alone.
INSERT INTO public.permissions(code,name,description,is_active)
VALUES
('project.view',initcap(replace(replace('project.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('project.update',initcap(replace(replace('project.update','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('project.members.view',initcap(replace(replace('project.members.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('project.members.invite',initcap(replace(replace('project.members.invite','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('project.members.manage',initcap(replace(replace('project.members.manage','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('project.roles.manage',initcap(replace(replace('project.roles.manage','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('project.configuration.manage',initcap(replace(replace('project.configuration.manage','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('audit.finding.view',initcap(replace(replace('audit.finding.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('contract.view',initcap(replace(replace('contract.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('manage_contract_programs',initcap(replace(replace('manage_contract_programs','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('port.view',initcap(replace(replace('port.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('port.depth.view',initcap(replace(replace('port.depth.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('port.depth.submit',initcap(replace(replace('port.depth.submit','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('route.estimate',initcap(replace(replace('route.estimate','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('vessel.view',initcap(replace(replace('vessel.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('vessel.port.assess',initcap(replace(replace('vessel.port.assess','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('voyage.view',initcap(replace(replace('voyage.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('voyage.create',initcap(replace(replace('voyage.create','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('voyage.update',initcap(replace(replace('voyage.update','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('vessel.nomination.review',initcap(replace(replace('vessel.nomination.review','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('vessel.port_call.manage',initcap(replace(replace('vessel.port_call.manage','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('pks.site.view',initcap(replace(replace('pks.site.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('pks.participation.manage',initcap(replace(replace('pks.participation.manage','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('pks.master_data.change_request.view',initcap(replace(replace('pks.master_data.change_request.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('pks.master_data.change_request.manage',initcap(replace(replace('pks.master_data.change_request.manage','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('pke.logistics.master.view',initcap(replace(replace('pke.logistics.master.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('pke.logistics.master.change_request.manage',initcap(replace(replace('pke.logistics.master.change_request.manage','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('facility.view',initcap(replace(replace('facility.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('facility.product.view',initcap(replace(replace('facility.product.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('facility.capacity.view',initcap(replace(replace('facility.capacity.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('product.view',initcap(replace(replace('product.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('supplier.view',initcap(replace(replace('supplier.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('product.requirement.view',initcap(replace(replace('product.requirement.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('product.requirement.manage',initcap(replace(replace('product.requirement.manage','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('shipping.view',initcap(replace(replace('shipping.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('shipment.view',initcap(replace(replace('shipment.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('shipping.survey.view',initcap(replace(replace('shipping.survey.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('shipping.laytime.view',initcap(replace(replace('shipping.laytime.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('finance.view',initcap(replace(replace('finance.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('inventory.view',initcap(replace(replace('inventory.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('operations.view',initcap(replace(replace('operations.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('logistics.view',initcap(replace(replace('logistics.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('warehouse.view',initcap(replace(replace('warehouse.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('documents.view',initcap(replace(replace('documents.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('workflow.view',initcap(replace(replace('workflow.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('approvals.view',initcap(replace(replace('approvals.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('reports.view',initcap(replace(replace('reports.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('audit.view',initcap(replace(replace('audit.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('shipping.survey.review',initcap(replace(replace('shipping.survey.review','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('shipping.laytime.verify',initcap(replace(replace('shipping.laytime.verify','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('loading.quantity.reconcile',initcap(replace(replace('loading.quantity.reconcile','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('project.tasks.view',initcap(replace(replace('project.tasks.view','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('project.tasks.create',initcap(replace(replace('project.tasks.create','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('project.tasks.assign',initcap(replace(replace('project.tasks.assign','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('project.tasks.update',initcap(replace(replace('project.tasks.update','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('project.tasks.resolve',initcap(replace(replace('project.tasks.resolve','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('project.tasks.escalate',initcap(replace(replace('project.tasks.escalate','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true),
('buyer.visibility.manage',initcap(replace(replace('buyer.visibility.manage','.',' '),'_',' ')),'Project Manager template permission; authorization remains Project-scoped.',true)
ON CONFLICT(code) DO NOTHING;

-- Exact PM role permission template for appointment-first Project provisioning.
INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
VALUES
('pm','project.view'),
('pm','project.update'),
('pm','project.members.view'),
('pm','project.members.invite'),
('pm','project.members.manage'),
('pm','project.roles.manage'),
('pm','project.configuration.manage'),
('pm','audit.finding.view'),
('pm','contract.view'),
('pm','manage_contract_programs'),
('pm','port.view'),
('pm','port.depth.view'),
('pm','port.depth.submit'),
('pm','route.estimate'),
('pm','vessel.view'),
('pm','vessel.port.assess'),
('pm','voyage.view'),
('pm','voyage.create'),
('pm','voyage.update'),
('pm','vessel.nomination.review'),
('pm','vessel.port_call.manage'),
('pm','pks.site.view'),
('pm','pks.participation.manage'),
('pm','pks.master_data.change_request.view'),
('pm','pks.master_data.change_request.manage'),
('pm','pke.logistics.master.view'),
('pm','pke.logistics.master.change_request.manage'),
('pm','facility.view'),
('pm','facility.product.view'),
('pm','facility.capacity.view'),
('pm','product.view'),
('pm','supplier.view'),
('pm','product.requirement.view'),
('pm','product.requirement.manage'),
('pm','shipping.view'),
('pm','shipment.view'),
('pm','shipping.survey.view'),
('pm','shipping.laytime.view'),
('pm','finance.view'),
('pm','inventory.view'),
('pm','operations.view'),
('pm','logistics.view'),
('pm','warehouse.view'),
('pm','documents.view'),
('pm','workflow.view'),
('pm','approvals.view'),
('pm','reports.view'),
('pm','audit.view'),
('pm','shipping.survey.review'),
('pm','shipping.laytime.verify'),
('pm','loading.quantity.reconcile'),
('pm','project.tasks.view'),
('pm','project.tasks.create'),
('pm','project.tasks.assign'),
('pm','project.tasks.update'),
('pm','project.tasks.resolve'),
('pm','project.tasks.escalate'),
('pm','buyer.visibility.manage')
ON CONFLICT(role_code,permission_code) DO NOTHING;

-- Writes are allowed only inside the SECURITY DEFINER PM-create RPC or explicit Admin governance.
DROP POLICY IF EXISTS pke_pm_project_create_projects_insert ON public.projects;
CREATE POLICY pke_pm_project_create_projects_insert ON public.projects FOR INSERT TO app_runtime_secure
WITH CHECK (current_setting('app.pke_pm_project_create',true)='on' AND public.pke_current_user_id() IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.pm_appointments a WHERE a.user_id=public.pke_current_user_id() AND a.status='active'));

DROP POLICY IF EXISTS pke_pm_project_create_contracts_insert ON public.contracts;
CREATE POLICY pke_pm_project_create_contracts_insert ON public.contracts FOR INSERT TO app_runtime_secure
WITH CHECK (current_setting('app.pke_pm_project_create',true)='on' AND project_id=nullif(current_setting('app.pke_pm_project_id',true),'')::uuid);
DROP POLICY IF EXISTS pke_pm_project_create_programs_insert ON public.contract_programs;
CREATE POLICY pke_pm_project_create_programs_insert ON public.contract_programs FOR INSERT TO app_runtime_secure
WITH CHECK (current_setting('app.pke_pm_project_create',true)='on' AND project_id IS NOT NULL);
DROP POLICY IF EXISTS pke_pm_project_create_profile_insert ON public.project_operating_profiles;
CREATE POLICY pke_pm_project_create_profile_insert ON public.project_operating_profiles FOR INSERT TO app_runtime_secure
WITH CHECK (current_setting('app.pke_pm_project_create',true)='on' AND project_id=nullif(current_setting('app.pke_pm_project_id',true),'')::uuid AND updated_by=public.pke_current_user_id());
DROP POLICY IF EXISTS pke_pm_project_create_role_insert ON public.project_roles;
CREATE POLICY pke_pm_project_create_role_insert ON public.project_roles FOR INSERT TO app_runtime_secure
WITH CHECK (current_setting('app.pke_pm_project_create',true)='on' AND project_id=nullif(current_setting('app.pke_pm_project_id',true),'')::uuid AND role_code='pm' AND created_by=public.pke_current_user_id());
DROP POLICY IF EXISTS pke_pm_project_create_role_permissions_insert ON public.project_role_permissions;
CREATE POLICY pke_pm_project_create_role_permissions_insert ON public.project_role_permissions FOR INSERT TO app_runtime_secure
WITH CHECK (current_setting('app.pke_pm_project_create',true)='on' AND project_id=nullif(current_setting('app.pke_pm_project_id',true),'')::uuid AND granted_by=public.pke_current_user_id() AND EXISTS(SELECT 1 FROM public.project_roles r WHERE r.id=project_role_permissions.project_role_id AND r.project_id=project_role_permissions.project_id AND r.role_code='pm') AND EXISTS(SELECT 1 FROM public.pke_project_role_permission_allowlist a JOIN public.permissions p ON p.code=a.permission_code WHERE a.role_code='pm' AND p.id=project_role_permissions.permission_id));
DROP POLICY IF EXISTS pke_pm_admin_membership_reactivation_update ON public.project_members;
CREATE POLICY pke_pm_admin_membership_reactivation_update ON public.project_members FOR UPDATE TO app_runtime_secure
USING (public.pke_is_platform_admin() AND project_role_id IS NULL)
WITH CHECK (public.pke_is_platform_admin() AND project_role_id IS NULL);
DROP POLICY IF EXISTS pke_pm_project_create_members_insert ON public.project_members;
CREATE POLICY pke_pm_project_create_members_insert ON public.project_members FOR INSERT TO app_runtime_secure
WITH CHECK (current_setting('app.pke_pm_project_create',true)='on' AND project_id=nullif(current_setting('app.pke_pm_project_id',true),'')::uuid AND user_id=public.pke_current_user_id() AND project_role_id IS NULL);
DROP POLICY IF EXISTS pke_pm_project_create_assignment_insert ON public.project_role_assignments;
CREATE POLICY pke_pm_project_create_assignment_insert ON public.project_role_assignments FOR INSERT TO app_runtime_secure
WITH CHECK (current_setting('app.pke_pm_project_create',true)='on' AND project_id=nullif(current_setting('app.pke_pm_project_id',true),'')::uuid AND user_id=public.pke_current_user_id() AND assigned_by=public.pke_current_user_id());
DROP POLICY IF EXISTS pke_pm_project_create_appointment_admin_insert ON public.pm_appointments;
CREATE POLICY pke_pm_project_create_appointment_admin_insert ON public.pm_appointments FOR INSERT TO app_runtime_secure
WITH CHECK (public.pke_is_platform_admin());
DROP POLICY IF EXISTS pke_pm_project_create_appointment_admin_update ON public.pm_appointments;
CREATE POLICY pke_pm_project_create_appointment_admin_update ON public.pm_appointments FOR UPDATE TO app_runtime_secure
USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
DROP POLICY IF EXISTS pke_pm_appointment_event_admin_insert ON public.pm_appointment_events;
CREATE POLICY pke_pm_appointment_event_admin_insert ON public.pm_appointment_events FOR INSERT TO app_runtime_secure
WITH CHECK (public.pke_is_platform_admin() AND actor_user_id=public.pke_current_user_id());
DROP POLICY IF EXISTS pke_pm_project_create_ownership_insert ON public.project_pm_ownership;
CREATE POLICY pke_pm_project_create_ownership_insert ON public.project_pm_ownership FOR INSERT TO app_runtime_secure
WITH CHECK (current_setting('app.pke_pm_project_create',true)='on' AND project_id=nullif(current_setting('app.pke_pm_project_id',true),'')::uuid AND pm_user_id=public.pke_current_user_id() AND assigned_by=public.pke_current_user_id());
DROP POLICY IF EXISTS pke_pm_ownership_admin_insert ON public.project_pm_ownership;
CREATE POLICY pke_pm_ownership_admin_insert ON public.project_pm_ownership FOR INSERT TO app_runtime_secure
WITH CHECK (public.pke_is_platform_admin());
DROP POLICY IF EXISTS pke_pm_ownership_admin_update ON public.project_pm_ownership;
CREATE POLICY pke_pm_ownership_admin_update ON public.project_pm_ownership FOR UPDATE TO app_runtime_secure
USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin());
DROP POLICY IF EXISTS pke_pm_ownership_admin_event_insert ON public.project_pm_ownership_events;
CREATE POLICY pke_pm_ownership_admin_event_insert ON public.project_pm_ownership_events FOR INSERT TO app_runtime_secure
WITH CHECK (public.pke_is_platform_admin() AND actor_user_id=public.pke_current_user_id());
DROP POLICY IF EXISTS pke_pm_ownership_event_insert ON public.project_pm_ownership_events;
CREATE POLICY pke_pm_ownership_event_insert ON public.project_pm_ownership_events FOR INSERT TO app_runtime_secure
WITH CHECK ((current_setting('app.pke_pm_project_create',true)='on' AND project_id=nullif(current_setting('app.pke_pm_project_id',true),'')::uuid AND actor_user_id=public.pke_current_user_id())
 OR (public.pke_is_platform_admin() AND actor_user_id=public.pke_current_user_id()));
DROP POLICY IF EXISTS pke_pm_project_create_basis_insert ON public.project_commercial_basis;
CREATE POLICY pke_pm_project_create_basis_insert ON public.project_commercial_basis FOR INSERT TO app_runtime_secure
WITH CHECK (current_setting('app.pke_pm_project_create',true)='on' AND project_id=nullif(current_setting('app.pke_pm_project_id',true),'')::uuid AND recorded_by=public.pke_current_user_id());
DROP POLICY IF EXISTS pke_pm_project_create_idempotency_insert ON public.pm_project_create_idempotency;
CREATE POLICY pke_pm_project_create_idempotency_insert ON public.pm_project_create_idempotency FOR INSERT TO app_runtime_secure
WITH CHECK (current_setting('app.pke_pm_project_create',true)='on' AND project_id=nullif(current_setting('app.pke_pm_project_id',true),'')::uuid AND pm_user_id=public.pke_current_user_id());
DROP POLICY IF EXISTS pke_pm_project_create_audit_insert ON public.audit_events;
CREATE POLICY pke_pm_project_create_audit_insert ON public.audit_events FOR INSERT TO app_runtime_secure
WITH CHECK (current_setting('app.pke_pm_project_create',true)='on' AND project_id=nullif(current_setting('app.pke_pm_project_id',true),'')::uuid AND actor_user_id=public.pke_current_user_id());

GRANT INSERT ON public.projects,public.contracts,public.contract_programs,public.project_operating_profiles,public.project_roles,public.project_role_permissions,public.project_members,public.project_role_assignments,public.project_pm_ownership,public.project_pm_ownership_events,public.project_commercial_basis,public.pm_project_create_idempotency,public.audit_events TO app_runtime_secure;
GRANT UPDATE ON public.project_members,public.project_pm_ownership TO app_runtime_secure;

GRANT SELECT ON public.pm_appointments,public.pm_appointment_events,public.project_pm_ownership,public.project_pm_ownership_events,public.project_commercial_basis,public.pm_project_create_idempotency TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.pke_admin_appoint_pm(p_user_id uuid,p_reason text)
RETURNS public.pm_appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v_actor uuid:=public.pke_current_user_id(); v_user public.users%ROWTYPE; v_row public.pm_appointments%ROWTYPE;
BEGIN
  IF NOT public.pke_is_platform_admin() THEN RAISE EXCEPTION 'Platform Admin required' USING ERRCODE='42501'; END IF;
  IF length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Reason required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_user FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_user.is_active IS DISTINCT FROM true OR v_user.neon_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'PM user must be active and linked to Neon Auth' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_row FROM public.pm_appointments WHERE user_id=p_user_id AND status='active' FOR UPDATE;
  IF FOUND THEN RETURN v_row; END IF;
  INSERT INTO public.pm_appointments(user_id,status,appointed_by,appointed_at)
  VALUES(p_user_id,'active',v_actor,now()) RETURNING * INTO v_row;
  INSERT INTO public.pm_appointment_events(appointment_id,user_id,actor_user_id,event_code,reason,after_snapshot)
  VALUES(v_row.id,p_user_id,v_actor,'appointed',p_reason,to_jsonb(v_row));
  RETURN v_row;
END;$fn$;

CREATE OR REPLACE FUNCTION public.pke_admin_set_pm_appointment_status(p_appointment_id uuid,p_status text,p_reason text)
RETURNS public.pm_appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v_actor uuid:=public.pke_current_user_id(); v_old public.pm_appointments%ROWTYPE; v_new public.pm_appointments%ROWTYPE; v_event text;
BEGIN
  IF NOT public.pke_is_platform_admin() THEN RAISE EXCEPTION 'Platform Admin required' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('suspended','revoked','active') OR length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Invalid status or reason' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_old FROM public.pm_appointments WHERE id=p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found' USING ERRCODE='P0002'; END IF;
  IF p_status='active' AND (SELECT is_active FROM public.users WHERE id=v_old.user_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'User must be active to reactivate appointment' USING ERRCODE='23514'; END IF;
  IF p_status='active' THEN
    UPDATE public.pm_appointments SET status='revoked',status_changed_by=v_actor,status_changed_at=now(),status_reason='Superseded by reactivation',updated_at=now()
     WHERE user_id=v_old.user_id AND status='active' AND id<>v_old.id;
  END IF;
  UPDATE public.pm_appointments SET status=p_status,status_changed_by=v_actor,status_changed_at=now(),status_reason=CASE WHEN p_status='active' THEN NULL ELSE p_reason END,updated_at=now()
   WHERE id=p_appointment_id RETURNING * INTO v_new;
  IF p_status IN ('suspended','revoked') THEN
    UPDATE public.project_role_assignments a
       SET is_active=false,revoked_at=now(),revoked_by=v_actor,revoke_reason=p_reason,updated_at=now()
      FROM public.project_roles r
     WHERE r.id=a.project_role_id AND r.project_id=a.project_id AND r.role_code='pm'
       AND a.user_id=v_old.user_id AND a.is_active=true AND a.revoked_at IS NULL;
  END IF;
  v_event:=CASE WHEN p_status='active' AND v_old.status<>'active' THEN 'reactivated' WHEN p_status='suspended' THEN 'suspended' ELSE 'revoked' END;
  INSERT INTO public.pm_appointment_events(appointment_id,user_id,actor_user_id,event_code,reason,before_snapshot,after_snapshot)
  VALUES(v_new.id,v_new.user_id,v_actor,v_event,p_reason,to_jsonb(v_old),to_jsonb(v_new));
  RETURN v_new;
END;$fn$;

CREATE OR REPLACE FUNCTION public.pke_pm_create_project(
  p_idempotency_key uuid,p_name text,p_description text,p_buyer_id uuid,p_basis_type text,
  p_basis_reference text,p_basis_date date,p_contract_reference text,p_evidence_url text,
  p_commercial_terms jsonb,p_settlement_unit text,p_target_quantity numeric,p_export_country_code text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE
 v_pm uuid:=public.pke_current_user_id(); v_appt public.pm_appointments%ROWTYPE;
 v_buyer public.buyers%ROWTYPE; v_project public.projects%ROWTYPE; v_program public.contract_programs%ROWTYPE;
 v_contract public.contracts%ROWTYPE; v_role public.project_roles%ROWTYPE; v_member public.project_members%ROWTYPE;
 v_assignment public.project_role_assignments%ROWTYPE; v_permissions integer; v_result jsonb; v_pm_codes text[]:=ARRAY['project.view','project.update','project.members.view','project.members.invite','project.members.manage','project.roles.manage','project.configuration.manage','audit.finding.view','contract.view','manage_contract_programs','port.view','port.depth.view','port.depth.submit','route.estimate','vessel.view','vessel.port.assess','voyage.view','voyage.create','voyage.update','vessel.nomination.review','vessel.port_call.manage','pks.site.view','pks.participation.manage','pks.master_data.change_request.view','pks.master_data.change_request.manage','pke.logistics.master.view','pke.logistics.master.change_request.manage','facility.view','facility.product.view','facility.capacity.view','product.view','supplier.view','product.requirement.view','product.requirement.manage','shipping.view','shipment.view','shipping.survey.view','shipping.laytime.view','finance.view','inventory.view','operations.view','logistics.view','warehouse.view','documents.view','workflow.view','approvals.view','reports.view','audit.view','shipping.survey.review','shipping.laytime.verify','loading.quantity.reconcile','project.tasks.view','project.tasks.create','project.tasks.assign','project.tasks.update','project.tasks.resolve','project.tasks.escalate','buyer.visibility.manage']::text[];
 v_default_configuration jsonb:='{"schema_version":1,"modules":{"pks":{"enabled":false},"supplier":{"enabled":false},"product_specs":{"enabled":true},"procurement":{"enabled":false},"inventory":{"enabled":false},"trucking":{"enabled":false},"warehouse":{"enabled":false},"port_operations":{"enabled":false},"loading":{"enabled":false},"vessel":{"enabled":false},"voyage":{"enabled":false},"shipment":{"enabled":false},"tracking":{"enabled":false},"documents":{"enabled":true},"compliance":{"enabled":true},"finance":{"enabled":false},"accounting":{"enabled":false},"fx":{"enabled":false},"financing":{"enabled":false},"reporting":{"enabled":false},"visual_reporting":{"enabled":false},"workflow":{"enabled":true},"approvals":{"enabled":true},"notifications":{"enabled":true}}}';
BEGIN
 IF v_pm IS NULL OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Authenticated PM and idempotency key required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_name,'')))<2 OR length(btrim(coalesce(p_basis_reference,'')))<2 OR p_buyer_id IS NULL OR
    p_basis_type IS NULL OR p_basis_type NOT IN ('buyer_agreement','executed_contract') OR length(btrim(coalesce(p_settlement_unit,'')))<1 OR p_target_quantity IS NULL OR p_target_quantity<=0 OR
    (p_basis_type='executed_contract' AND length(btrim(coalesce(p_contract_reference,'')))<2) OR
    (p_evidence_url IS NOT NULL AND p_evidence_url !~ '^https://') OR
    (p_export_country_code IS NOT NULL AND p_export_country_code !~ '^[A-Z]{2}$') OR
    jsonb_typeof(coalesce(p_commercial_terms,'{}'::jsonb))<>'object'
 THEN RAISE EXCEPTION 'Commercial basis/project input invalid' USING ERRCODE='22023'; END IF;
SELECT * INTO v_appt FROM public.pm_appointments WHERE user_id=v_pm AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active global PM appointment required' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_buyer FROM public.buyers WHERE id=p_buyer_id AND is_active=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active Buyer not found' USING ERRCODE='P0002'; END IF;
 SELECT response INTO v_result FROM public.pm_project_create_idempotency WHERE pm_user_id=v_pm AND idempotency_key=p_idempotency_key;
 IF FOUND THEN RETURN v_result||jsonb_build_object('idempotentReplay',true); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_pm::text||':project-create',0));
 SELECT response INTO v_result FROM public.pm_project_create_idempotency WHERE pm_user_id=v_pm AND idempotency_key=p_idempotency_key;
 IF FOUND THEN RETURN v_result||jsonb_build_object('idempotentReplay',true); END IF;
 INSERT INTO public.projects(name,description,status,settlement_unit,target_quantity,export_country_code,is_active,created_at,updated_at)
 VALUES(btrim(p_name),nullif(btrim(p_description),''),'draft',btrim(p_settlement_unit),p_target_quantity,nullif(upper(btrim(p_export_country_code)),''),true,now(),now())
 RETURNING * INTO v_project;
 PERFORM set_config('app.pke_pm_project_id',v_project.id::text,true);
 IF p_basis_type='executed_contract' THEN
   INSERT INTO public.contracts(project_id,buyer_id,code,name,start_date,end_date,is_active,created_at,updated_at)
   VALUES(v_project.id,p_buyer_id,substr('PM-'||v_project.id::text,1,40),btrim(p_basis_reference),coalesce(p_basis_date,current_date),NULL,true,now(),now())
   RETURNING * INTO v_contract;
 END IF;
 INSERT INTO public.contract_programs(project_id,name,description,buyer_id,contract_id,settlement_unit,target_quantity,cadence,generation_mode,is_active,created_at,updated_at)
 VALUES(v_project.id,btrim(p_name),nullif(btrim(p_description),''),p_buyer_id,v_contract.id,btrim(p_settlement_unit),p_target_quantity,'shipment_triggered','shipment_triggered',true,now(),now())
 RETURNING * INTO v_program;
 UPDATE public.projects SET contract_program_id=v_program.id,updated_at=now() WHERE id=v_project.id RETURNING * INTO v_project;
 INSERT INTO public.project_operating_profiles(project_id,logistics_mode,uses_trucking,pks_owns_or_controls_port,financing_enabled,financier_reporting_required,configuration,updated_by,created_at,updated_at)
 VALUES(v_project.id,'unspecified',false,false,false,false,v_default_configuration,v_pm,now(),now()) ON CONFLICT(project_id) DO NOTHING;
 INSERT INTO public.project_roles(project_id,role_code,name,description,is_active,created_by,created_at,updated_at)
 VALUES(v_project.id,'pm','Project Manager','Appointed Project Manager; scoped to this Project',true,v_pm,now(),now())
 ON CONFLICT(project_id,role_code) DO UPDATE SET is_active=true,updated_at=now() RETURNING * INTO v_role;
 INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id,granted_by,granted_at)
 SELECT v_project.id,v_role.id,p.id,v_pm,now() FROM public.permissions p
 WHERE p.code=ANY(v_pm_codes) AND p.is_active=true ON CONFLICT(project_role_id,permission_id) DO NOTHING;
 GET DIAGNOSTICS v_permissions=ROW_COUNT;
 SELECT count(*) INTO v_permissions FROM public.project_role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.project_id=v_project.id AND rp.project_role_id=v_role.id AND p.code=ANY(v_pm_codes) AND p.is_active=true;
 IF v_permissions<>cardinality(v_pm_codes) THEN RAISE EXCEPTION 'PM role permission catalogue incomplete; expected %, found %',cardinality(v_pm_codes),v_permissions USING ERRCODE='23514'; END IF;
 INSERT INTO public.project_members(project_id,user_id,project_role_id,is_active,joined_at,updated_at)
 VALUES(v_project.id,v_pm,NULL,true,now(),now()) RETURNING * INTO v_member;
 PERFORM set_config('app.pke_pm_project_create','on',true);
 INSERT INTO public.project_role_assignments(project_id,project_member_id,user_id,project_role_id,is_active,assigned_at,assigned_by)
 VALUES(v_project.id,v_member.id,v_pm,v_role.id,true,now(),v_pm) RETURNING * INTO v_assignment;
 INSERT INTO public.project_pm_ownership(project_id,pm_user_id,appointment_id,assigned_by)
 VALUES(v_project.id,v_pm,v_appt.id,v_pm);
 INSERT INTO public.project_pm_ownership_events(project_id,to_pm_user_id,actor_user_id,reason)
 VALUES(v_project.id,v_pm,v_pm,'Project created by appointed PM');
 INSERT INTO public.project_commercial_basis(project_id,buyer_id,basis_type,basis_reference,basis_date,contract_reference,evidence_url,commercial_terms,notes,recorded_by)
 VALUES(v_project.id,p_buyer_id,p_basis_type,btrim(p_basis_reference),p_basis_date,nullif(btrim(p_contract_reference),''),p_evidence_url,coalesce(p_commercial_terms,'{}'::jsonb),nullif(btrim(p_description),''),v_pm);
 v_result:=jsonb_build_object('project',to_jsonb(v_project),'contractProgram',to_jsonb(v_program),'commercialBasis',jsonb_build_object('buyerId',p_buyer_id,'basisType',p_basis_type,'basisReference',p_basis_reference),'pmOwnership',jsonb_build_object('pmUserId',v_pm,'appointmentId',v_appt.id));
 INSERT INTO public.pm_project_create_idempotency(pm_user_id,idempotency_key,project_id,response) VALUES(v_pm,p_idempotency_key,v_project.id,v_result);
 INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,action,target_type,target_id,project_id,reason,after_snapshot,metadata,outcome)
 VALUES(v_pm,'user','pm','project.created_by_appointed_pm','project',v_project.id,v_project.id,'Project created from Buyer agreement/contract',v_result,jsonb_build_object('appointmentId',v_appt.id,'basisType',p_basis_type,'buyerId',p_buyer_id),'success');
 RETURN v_result;
END;$fn$;

CREATE OR REPLACE FUNCTION public.pke_admin_transfer_project_pm(p_project_id uuid,p_new_pm_user_id uuid,p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE v_actor uuid:=public.pke_current_user_id(); v_old public.project_pm_ownership%ROWTYPE; v_appt public.pm_appointments%ROWTYPE; v_role public.project_roles%ROWTYPE; v_member public.project_members%ROWTYPE; v_assignment public.project_role_assignments%ROWTYPE;
BEGIN
 IF NOT public.pke_is_platform_admin() THEN RAISE EXCEPTION 'Platform Admin required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Reason required' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_appt FROM public.pm_appointments WHERE user_id=p_new_pm_user_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'New PM must have an active global appointment' USING ERRCODE='23514'; END IF;
 SELECT * INTO v_old FROM public.project_pm_ownership WHERE project_id=p_project_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project PM ownership not found' USING ERRCODE='P0002'; END IF;
 IF v_old.pm_user_id=p_new_pm_user_id THEN RETURN jsonb_build_object('idempotent',true,'projectId',p_project_id,'pmUserId',p_new_pm_user_id); END IF;
 SELECT * INTO v_role FROM public.project_roles WHERE project_id=p_project_id AND role_code='pm' AND is_active=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project PM role template unavailable' USING ERRCODE='23514'; END IF;
 SELECT * INTO v_member FROM public.project_members WHERE project_id=p_project_id AND user_id=v_old.pm_user_id AND is_active=true FOR UPDATE;
 IF FOUND THEN
  UPDATE public.project_role_assignments SET is_active=false,revoked_at=now(),revoked_by=v_actor,revoke_reason=p_reason,updated_at=now()
   WHERE project_id=p_project_id AND user_id=v_old.pm_user_id AND project_role_id=v_role.id AND is_active=true AND revoked_at IS NULL;
 END IF;
 SELECT * INTO v_member FROM public.project_members WHERE project_id=p_project_id AND user_id=p_new_pm_user_id ORDER BY joined_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO public.project_members(project_id,user_id,project_role_id,is_active,joined_at,updated_at)
  VALUES(p_project_id,p_new_pm_user_id,NULL,true,now(),now()) RETURNING * INTO v_member;
 ELSE
  UPDATE public.project_members SET is_active=true,deactivated_at=NULL,deactivated_by=NULL,expires_at=NULL,updated_at=now()
   WHERE id=v_member.id RETURNING * INTO v_member;
 END IF;
 INSERT INTO public.project_role_assignments(project_id,project_member_id,user_id,project_role_id,is_active,assigned_at,assigned_by)
 VALUES(p_project_id,v_member.id,p_new_pm_user_id,v_role.id,true,now(),v_actor) RETURNING * INTO v_assignment;
 UPDATE public.project_pm_ownership SET pm_user_id=p_new_pm_user_id,appointment_id=v_appt.id,assigned_by=v_actor,updated_at=now() WHERE project_id=p_project_id;
 INSERT INTO public.project_pm_ownership_events(project_id,from_pm_user_id,to_pm_user_id,actor_user_id,reason)
 VALUES(p_project_id,v_old.pm_user_id,p_new_pm_user_id,v_actor,p_reason);
 INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,action,target_type,target_id,project_id,reason,before_snapshot,after_snapshot,metadata,outcome)
 VALUES(v_actor,'user','platform_admin','project.pm.transferred','project_pm_ownership',p_project_id,p_project_id,p_reason,to_jsonb(v_old),jsonb_build_object('pmUserId',p_new_pm_user_id,'appointmentId',v_appt.id),jsonb_build_object('fromPm',v_old.pm_user_id,'toPm',p_new_pm_user_id),'success');
 RETURN jsonb_build_object('projectId',p_project_id,'previousPmUserId',v_old.pm_user_id,'pmUserId',p_new_pm_user_id,'assignmentId',v_assignment.id);
END;$fn$;

CREATE OR REPLACE FUNCTION public.pke_project_role_assignment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $guard$
DECLARE v_member public.project_members%ROWTYPE; v_role public.project_roles%ROWTYPE; v_internal_create boolean;
BEGIN
 SELECT * INTO v_member FROM public.project_members WHERE id=NEW.project_member_id AND project_id=NEW.project_id AND user_id=NEW.user_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project membership identity is required for role assignment' USING ERRCODE='23514'; END IF;
 SELECT * INTO v_role FROM public.project_roles WHERE id=NEW.project_role_id AND project_id=NEW.project_id FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project role template identity is required for role assignment' USING ERRCODE='23514'; END IF;
 v_internal_create:=current_setting('app.pke_pm_project_create',true)='on' AND public.pke_current_user_id()=NEW.user_id;
 IF TG_OP='UPDATE' THEN
  IF OLD.project_id<>NEW.project_id OR OLD.project_member_id<>NEW.project_member_id OR OLD.user_id<>NEW.user_id OR OLD.project_role_id<>NEW.project_role_id THEN RAISE EXCEPTION 'Assignment identity is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Revoked assignments are immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='INSERT' OR NEW.is_active=true THEN
  IF v_member.is_active IS DISTINCT FROM true OR v_member.deactivated_at IS NOT NULL OR (v_member.expires_at IS NOT NULL AND v_member.expires_at<=now()) THEN RAISE EXCEPTION 'Active Project membership required' USING ERRCODE='23514'; END IF;
  IF v_role.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'Active Project role template required' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.is_active=true AND NEW.expires_at IS NOT NULL AND NEW.expires_at<=now() THEN RAISE EXCEPTION 'Active assignment must expire in the future' USING ERRCODE='23514'; END IF;
 IF NEW.revoked_at IS NOT NULL AND (NEW.is_active=true OR NEW.revoked_by IS NULL OR length(trim(coalesce(NEW.revoke_reason,'')))<5) THEN RAISE EXCEPTION 'Revoked assignments require inactive state, actor and reason' USING ERRCODE='23514'; END IF;
 IF v_role.role_code='pm' AND NOT public.pke_is_platform_admin() AND NOT v_internal_create THEN RAISE EXCEPTION 'PM role assignment requires Platform Admin or appointment-first creation' USING ERRCODE='42501'; END IF;
 IF v_role.role_code='pm' AND NEW.is_active=true AND NEW.revoked_at IS NULL AND (NEW.expires_at IS NULL OR NEW.expires_at>now()) THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.project_id::text||':pm-appointment',0));
  IF EXISTS(SELECT 1 FROM public.project_role_assignments oa JOIN public.project_roles orl ON orl.id=oa.project_role_id AND orl.project_id=oa.project_id WHERE oa.project_id=NEW.project_id AND oa.id<>NEW.id AND orl.role_code='pm' AND oa.is_active=true AND oa.revoked_at IS NULL AND (oa.expires_at IS NULL OR oa.expires_at>now())) THEN RAISE EXCEPTION 'Only one active PM assignment per Project' USING ERRCODE='23505'; END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END;$guard$;

CREATE OR REPLACE FUNCTION public.pke_pm_buyer_catalog()
RETURNS TABLE(id uuid,name text,code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $fn$
 SELECT b.id,b.name,b.code FROM public.buyers b
 WHERE b.is_active=true AND EXISTS(SELECT 1 FROM public.pm_appointments a WHERE a.user_id=public.pke_current_user_id() AND a.status='active')
 ORDER BY b.name;
$fn$;

CREATE OR REPLACE FUNCTION public.pke_pm_portfolio()
RETURNS TABLE(project_id uuid,pm_user_id uuid,project_name text,project_status text,target_quantity numeric,settlement_unit text,buyer_id uuid,buyer_name text,basis_type text,basis_reference text,basis_date date,created_at timestamptz,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $fn$
 SELECT p.id,o.pm_user_id,p.name,p.status,p.target_quantity,p.settlement_unit,b.id,b.name,cb.basis_type,cb.basis_reference,cb.basis_date,p.created_at,p.updated_at
 FROM public.project_pm_ownership o JOIN public.projects p ON p.id=o.project_id
 LEFT JOIN public.project_commercial_basis cb ON cb.project_id=p.id
 LEFT JOIN public.buyers b ON b.id=cb.buyer_id
 WHERE o.pm_user_id=public.pke_current_user_id() AND p.is_active=true
   AND EXISTS(SELECT 1 FROM public.pm_appointments a WHERE a.user_id=o.pm_user_id AND a.status='active')
 ORDER BY p.updated_at DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.pke_admin_appoint_pm(uuid,text),public.pke_admin_set_pm_appointment_status(uuid,text,text),public.pke_pm_create_project(uuid,text,text,uuid,text,text,date,text,text,jsonb,text,numeric,text),public.pke_admin_transfer_project_pm(uuid,uuid,text),public.pke_pm_buyer_catalog(),public.pke_pm_portfolio() TO app_runtime_secure;

DO $verify$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE proname='pke_pm_create_project') THEN RAISE EXCEPTION 'PM create Project function missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname='public' AND indexname='pm_appointments_one_active_user') THEN RAISE EXCEPTION 'Global PM appointment uniqueness missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='pm_appointments' AND policyname='pm_appointments_self_select') THEN RAISE EXCEPTION 'PM self appointment visibility missing'; END IF;
END;$verify$;
COMMIT;
