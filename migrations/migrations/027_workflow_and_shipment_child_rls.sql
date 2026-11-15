-- PKE Migration 027: complete project-permission RLS writes for workflow stages,
-- append-only stage transitions and shipment allocations.

BEGIN;

-- Workflow stages inherit project scope through project_workflows.
CREATE POLICY pke_workflow_stages_select
  ON public.workflow_stages FOR SELECT TO app_runtime_secure
  USING (public.pke_has_workflow_permission(workflow_id, 'workflow.view'));

CREATE POLICY pke_workflow_stages_insert
  ON public.workflow_stages FOR INSERT TO app_runtime_secure
  WITH CHECK (public.pke_has_workflow_permission(workflow_id, 'workflow.create'));

CREATE POLICY pke_workflow_stages_update
  ON public.workflow_stages FOR UPDATE TO app_runtime_secure
  USING (public.pke_has_workflow_permission(workflow_id, 'workflow.update'))
  WITH CHECK (public.pke_has_workflow_permission(workflow_id, 'workflow.update'));

CREATE POLICY pke_workflow_stages_delete
  ON public.workflow_stages FOR DELETE TO app_runtime_secure
  USING (public.pke_has_workflow_permission(workflow_id, 'workflow.delete'));

-- Stage transitions are append-only audit events; no UPDATE or DELETE policy is added.
CREATE POLICY pke_stage_transitions_insert
  ON public.stage_transitions FOR INSERT TO app_runtime_secure
  WITH CHECK (
    triggered_by = public.pke_current_user_id()
    AND public.pke_has_stage_permission(stage_id, 'workflow.update')
  );

-- Shipment allocations inherit project scope through their parent shipment.
CREATE POLICY pke_shipment_allocations_insert
  ON public.shipment_allocations FOR INSERT TO app_runtime_secure
  WITH CHECK (public.pke_has_shipment_permission(shipment_id, 'shipping.create'));

CREATE POLICY pke_shipment_allocations_update
  ON public.shipment_allocations FOR UPDATE TO app_runtime_secure
  USING (public.pke_has_shipment_permission(shipment_id, 'shipping.update'))
  WITH CHECK (public.pke_has_shipment_permission(shipment_id, 'shipping.update'));

CREATE POLICY pke_shipment_allocations_delete
  ON public.shipment_allocations FOR DELETE TO app_runtime_secure
  USING (public.pke_has_shipment_permission(shipment_id, 'shipping.delete'));

COMMIT;
