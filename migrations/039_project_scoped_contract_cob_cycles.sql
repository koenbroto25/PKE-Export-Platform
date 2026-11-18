-- Migration 039: Project-scoped contract ownership and shipment-level Cash on Board obligations.
-- Additive for legacy rows: unassigned legacy contracts/programs remain unassigned and inaccessible
-- until explicitly associated with a Project by an authorized Project Manager.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS project_id uuid;
ALTER TABLE public.projects ALTER COLUMN contract_program_id DROP NOT NULL;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.contract_programs
  ADD COLUMN IF NOT EXISTS project_id uuid;
ALTER TABLE public.contract_programs
  ADD CONSTRAINT contract_programs_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS contract_programs_project_id_id_unique ON public.contract_programs(project_id, id);
ALTER TABLE public.projects
  ADD CONSTRAINT projects_contract_program_project_fkey
  FOREIGN KEY (id, contract_program_id) REFERENCES public.contract_programs(project_id, id) ON DELETE RESTRICT;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_project_id_id_unique UNIQUE (project_id, id);
ALTER TABLE public.contract_programs
  ADD CONSTRAINT contract_programs_contract_project_fkey
  FOREIGN KEY (project_id, contract_id) REFERENCES public.contracts(project_id, id) ON DELETE RESTRICT;

ALTER TABLE public.cycle_policies
  ADD COLUMN IF NOT EXISTS project_id uuid;
ALTER TABLE public.cycle_policies
  ADD CONSTRAINT cycle_policies_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.cycle_policies
  ADD CONSTRAINT cycle_policies_program_project_fkey
  FOREIGN KEY (project_id, contract_program_id) REFERENCES public.contract_programs(project_id, id) ON DELETE CASCADE;

ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_project_id_id_unique UNIQUE (project_id, id);

ALTER TABLE public.payment_obligations
  ADD COLUMN IF NOT EXISTS shipment_id uuid;
ALTER TABLE public.payment_obligations
  ADD CONSTRAINT payment_obligations_shipment_project_fkey
  FOREIGN KEY (project_id, shipment_id)
  REFERENCES public.shipments(project_id, id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS contract_programs_one_per_project_unique ON public.contract_programs(project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_obligations_project_shipment_unique
  ON public.payment_obligations(project_id, shipment_id)
  WHERE shipment_id IS NOT NULL;
ALTER TABLE public.payment_obligations
  ADD CONSTRAINT payment_obligations_cob_paid_full_check
  CHECK (payment_status <> 'paid' OR amount_paid = amount);

-- Contracts, programs and cycles are Project business data, not platform-global Admin data.
DROP POLICY IF EXISTS pke_admin_all ON public.payment_obligations;
DROP POLICY IF EXISTS pke_admin_all ON public.contracts;
DROP POLICY IF EXISTS pke_contracts_select ON public.contracts;
CREATE POLICY pke_contracts_project_select ON public.contracts
  FOR SELECT TO app_runtime_secure
  USING (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'contract.view'));
CREATE POLICY pke_contracts_project_insert ON public.contracts
  FOR INSERT TO app_runtime_secure
  WITH CHECK (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'manage_contract_programs'));
CREATE POLICY pke_contracts_project_update ON public.contracts
  FOR UPDATE TO app_runtime_secure
  USING (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'manage_contract_programs'))
  WITH CHECK (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'manage_contract_programs'));

DROP POLICY IF EXISTS pke_admin_all ON public.contract_programs;
DROP POLICY IF EXISTS pke_contract_programs_select ON public.contract_programs;
CREATE POLICY pke_contract_programs_project_select ON public.contract_programs
  FOR SELECT TO app_runtime_secure
  USING (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'contract.view'));
CREATE POLICY pke_contract_programs_project_insert ON public.contract_programs
  FOR INSERT TO app_runtime_secure
  WITH CHECK (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'manage_contract_programs'));
CREATE POLICY pke_contract_programs_project_update ON public.contract_programs
  FOR UPDATE TO app_runtime_secure
  USING (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'manage_contract_programs'))
  WITH CHECK (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'manage_contract_programs'));

DROP POLICY IF EXISTS pke_admin_all ON public.cycle_policies;
DROP POLICY IF EXISTS pke_cycle_policies_select ON public.cycle_policies;
CREATE POLICY pke_cycle_policies_project_select ON public.cycle_policies
  FOR SELECT TO app_runtime_secure
  USING (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'contract.view'));
CREATE POLICY pke_cycle_policies_project_insert ON public.cycle_policies
  FOR INSERT TO app_runtime_secure
  WITH CHECK (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'manage_contract_programs'));
CREATE POLICY pke_cycle_policies_project_update ON public.cycle_policies
  FOR UPDATE TO app_runtime_secure
  USING (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'manage_contract_programs'))
  WITH CHECK (project_id IS NOT NULL AND public.pke_has_project_permission(project_id, 'manage_contract_programs'));
