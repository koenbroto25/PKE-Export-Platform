-- P1 domain workflow foundation (UAT-first).
-- Production release manifest remains intentionally unchanged.
CREATE TABLE IF NOT EXISTS public.p1_domain_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  record_type text NOT NULL CHECK (record_type IN (
    'purchase_requisition','purchase_order','supplier_commitment','goods_receipt_match',
    'production_batch','packing_batch','quality_sample','quality_result','qa_release',
    'hse_inspection','hse_action','dispatch_assignment','vessel_call','loading_plan',
    'loading_survey','ship_master_ack','laytime_event','lc_record','lc_clause',
    'lc_discrepancy','lc_presentation','audit_finding','audit_response','audit_closure'
  )),
  record_code text NOT NULL,
  parent_record_id uuid NULL,
  source_entity_type text NULL,
  source_entity_id uuid NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 240),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','submitted','approved','issued','acknowledged','in_progress','blocked',
    'partially_received','received','matched','held','released','rejected','completed',
    'cancelled','open','responded','verified','closed','presented','accepted','discrepancy','expired'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload)='object'),
  owner_role_code text NOT NULL REFERENCES public.pke_project_role_policy(role_code),
  assignee_user_id uuid NULL REFERENCES public.users(id),
  external_scope_user_id uuid NULL REFERENCES public.users(id),
  created_by uuid NOT NULL REFERENCES public.users(id),
  updated_by uuid NULL REFERENCES public.users(id),
  closed_by uuid NULL REFERENCES public.users(id),
  due_at timestamptz NULL,
  idempotency_key text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz NULL,
  UNIQUE (project_id, record_code),
  UNIQUE (id, project_id),
  FOREIGN KEY (parent_record_id, project_id)
    REFERENCES public.p1_domain_records(id, project_id) ON DELETE RESTRICT,
  CHECK ((source_entity_type IS NULL) = (source_entity_id IS NULL)),
  CHECK ((closed_at IS NULL) = (closed_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS p1_domain_records_idempotency_uq
  ON public.p1_domain_records(project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS p1_domain_records_project_type_status_idx
  ON public.p1_domain_records(project_id, record_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS p1_domain_records_assignee_idx
  ON public.p1_domain_records(project_id, assignee_user_id, status) WHERE assignee_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.p1_domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL,
  project_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'created','submitted','approved','issued','acknowledged','started','blocked',
    'updated','matched','held','released','rejected','completed','cancelled',
    'responded','verified','closed','presented','accepted','discrepancy','evidence_added'
  )),
  actor_user_id uuid NOT NULL REFERENCES public.users(id),
  actor_role_code text NOT NULL,
  reason text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload)='object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (record_id, project_id)
    REFERENCES public.p1_domain_records(id, project_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS p1_domain_events_project_time_idx
  ON public.p1_domain_events(project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS p1_domain_events_record_time_idx
  ON public.p1_domain_events(record_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.p1_domain_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL,
  project_id uuid NOT NULL,
  evidence_type text NOT NULL,
  object_key text NOT NULL CHECK (length(btrim(object_key)) BETWEEN 3 AND 1024),
  storage_bucket text NOT NULL DEFAULT 'pke-private-documents',
  original_filename text NULL,
  mime_type text NULL,
  file_size_bytes bigint NULL CHECK (file_size_bytes IS NULL OR file_size_bytes BETWEEN 1 AND 52428800),
  sha256_checksum text NOT NULL CHECK (sha256_checksum ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid NOT NULL REFERENCES public.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid NULL REFERENCES public.users(id),
  verified_at timestamptz NULL,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','verified','rejected','superseded')),
  FOREIGN KEY (record_id, project_id)
    REFERENCES public.p1_domain_records(id, project_id) ON DELETE RESTRICT,
  CHECK ((verified_by IS NULL) = (verified_at IS NULL))
);
CREATE INDEX IF NOT EXISTS p1_domain_evidence_record_idx
  ON public.p1_domain_evidence(project_id, record_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS public.p1_report_kpi_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  template_id text NOT NULL,
  metric_key text NOT NULL,
  label text NOT NULL,
  formula_key text NOT NULL CHECK (formula_key IN (
    'po_cycle_time_hours','three_way_match_rate','production_output_quantity',
    'qa_release_rate','hse_open_actions','dispatch_on_time_rate','loading_completion_rate',
    'laytime_hours','lc_discrepancy_rate','audit_overdue_count','inventory_variance_quantity',
    'document_freshness_rate'
  )),
  source_entity text NOT NULL,
  unit_code text NOT NULL,
  freshness_minutes integer NOT NULL CHECK (freshness_minutes BETWEEN 1 AND 525600),
  missing_data_policy text NOT NULL CHECK (missing_data_policy IN ('unavailable','partial','zero_only_if_source_empty')),
  definition_version integer NOT NULL DEFAULT 1 CHECK (definition_version > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, metric_key, definition_version)
);
CREATE UNIQUE INDEX IF NOT EXISTS p1_report_kpi_project_metric_uq
  ON public.p1_report_kpi_definitions(COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), template_id, metric_key, definition_version);

CREATE OR REPLACE FUNCTION public.p1_workflow_permission(p_record_type text, p_action text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_record_type
    WHEN 'purchase_requisition' THEN CASE p_action WHEN 'view' THEN 'procurement.po.view' WHEN 'create' THEN 'procurement.po.create' WHEN 'update' THEN 'procurement.po.update' ELSE 'procurement.po.manage' END
    WHEN 'purchase_order' THEN CASE p_action WHEN 'view' THEN 'procurement.po.view' WHEN 'create' THEN 'procurement.po.create' WHEN 'update' THEN 'procurement.po.update' ELSE 'procurement.po.manage' END
    WHEN 'supplier_commitment' THEN CASE p_action WHEN 'view' THEN 'procurement.commitment.view' WHEN 'create' THEN 'procurement.commitment.manage' WHEN 'update' THEN 'procurement.commitment.manage' ELSE 'procurement.po.view' END
    WHEN 'goods_receipt_match' THEN CASE p_action WHEN 'view' THEN 'procurement.match.view' WHEN 'create' THEN 'procurement.match.create' WHEN 'update' THEN 'procurement.match.create' ELSE 'procurement.po.view' END
    WHEN 'production_batch' THEN CASE p_action WHEN 'view' THEN 'operations.view' WHEN 'create' THEN 'operations.create' WHEN 'update' THEN 'operations.update' ELSE 'operations.update' END
    WHEN 'packing_batch' THEN CASE p_action WHEN 'view' THEN 'operations.view' WHEN 'create' THEN 'operations.create' WHEN 'update' THEN 'operations.update' ELSE 'operations.update' END
    WHEN 'quality_sample' THEN CASE p_action WHEN 'view' THEN 'quality.sample.view' WHEN 'create' THEN 'quality.sample.create' WHEN 'update' THEN 'quality.sample.create' ELSE 'quality.result.review' END
    WHEN 'quality_result' THEN CASE p_action WHEN 'view' THEN 'quality.result.view' WHEN 'create' THEN 'quality.result.create' WHEN 'update' THEN 'quality.result.review' ELSE 'quality.result.review' END
    WHEN 'qa_release' THEN CASE p_action WHEN 'view' THEN 'quality.release.view' WHEN 'create' THEN 'quality.release.decide' WHEN 'update' THEN 'quality.release.decide' ELSE 'quality.release.decide' END
    WHEN 'hse_inspection' THEN CASE p_action WHEN 'view' THEN 'hse.inspection.view' WHEN 'create' THEN 'hse.inspection.create' WHEN 'update' THEN 'hse.inspection.update' ELSE 'hse.inspection.update' END
    WHEN 'hse_action' THEN CASE p_action WHEN 'view' THEN 'hse.action.view' WHEN 'create' THEN 'hse.action.manage' WHEN 'update' THEN 'hse.action.manage' ELSE 'hse.action.manage' END
    WHEN 'dispatch_assignment' THEN CASE p_action WHEN 'view' THEN 'dispatch.view' WHEN 'create' THEN 'dispatch.create' WHEN 'update' THEN 'dispatch.update' ELSE 'dispatch.manage' END
    WHEN 'vessel_call' THEN CASE p_action WHEN 'view' THEN 'vessel.view' WHEN 'create' THEN 'shipping.create' WHEN 'update' THEN 'shipping.update' ELSE 'shipping.update' END
    WHEN 'loading_plan' THEN CASE p_action WHEN 'view' THEN 'shipping.view' WHEN 'create' THEN 'shipping.update' WHEN 'update' THEN 'shipping.update' ELSE 'shipping.update' END
    WHEN 'loading_survey' THEN CASE p_action WHEN 'view' THEN 'shipping.survey.view' WHEN 'create' THEN 'shipping.survey.submit' WHEN 'update' THEN 'shipping.survey.submit' ELSE 'shipping.survey.submit' END
    WHEN 'ship_master_ack' THEN CASE p_action WHEN 'view' THEN 'shipping.ack.view' WHEN 'create' THEN 'shipping.acknowledge' WHEN 'update' THEN 'shipping.acknowledge' ELSE 'shipping.acknowledge' END
    WHEN 'laytime_event' THEN CASE p_action WHEN 'view' THEN 'shipping.laytime.view' WHEN 'create' THEN 'shipping.laytime.manage' WHEN 'update' THEN 'shipping.laytime.manage' ELSE 'shipping.laytime.manage' END
    WHEN 'lc_record' THEN CASE p_action WHEN 'view' THEN 'lc.view' WHEN 'create' THEN 'lc.create' WHEN 'update' THEN 'lc.update' ELSE 'lc.update' END
    WHEN 'lc_clause' THEN CASE p_action WHEN 'view' THEN 'lc.view' WHEN 'create' THEN 'lc.create' WHEN 'update' THEN 'lc.update' ELSE 'lc.update' END
    WHEN 'lc_discrepancy' THEN CASE p_action WHEN 'view' THEN 'lc.view' WHEN 'create' THEN 'lc.discrepancy.manage' WHEN 'update' THEN 'lc.discrepancy.manage' ELSE 'lc.discrepancy.manage' END
    WHEN 'lc_presentation' THEN CASE p_action WHEN 'view' THEN 'lc.view' WHEN 'create' THEN 'lc.present' WHEN 'update' THEN 'lc.present' ELSE 'lc.present' END
    WHEN 'audit_finding' THEN CASE p_action WHEN 'view' THEN 'audit.finding.view' WHEN 'create' THEN 'audit.finding.create' WHEN 'update' THEN 'audit.finding.respond' ELSE 'audit.finding.close' END
    WHEN 'audit_response' THEN CASE p_action WHEN 'view' THEN 'audit.finding.view' WHEN 'create' THEN 'audit.finding.respond' WHEN 'update' THEN 'audit.finding.respond' ELSE 'audit.finding.respond' END
    WHEN 'audit_closure' THEN CASE p_action WHEN 'view' THEN 'audit.finding.view' WHEN 'create' THEN 'audit.finding.close' WHEN 'update' THEN 'audit.finding.close' ELSE 'audit.finding.close' END
    ELSE NULL
  END
$$;

ALTER TABLE public.p1_domain_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p1_domain_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.p1_domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p1_domain_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.p1_domain_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p1_domain_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE public.p1_report_kpi_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p1_report_kpi_definitions FORCE ROW LEVEL SECURITY;

CREATE POLICY p1_domain_records_select ON public.p1_domain_records FOR SELECT TO app_runtime_secure
USING (
  public.p1_workflow_permission(record_type,'view') IS NOT NULL
  AND public.pke_has_project_permission(project_id, public.p1_workflow_permission(record_type,'view'))
  AND (external_scope_user_id IS NULL OR external_scope_user_id = public.pke_current_user_id()
       OR public.pke_has_project_permission(project_id, public.p1_workflow_permission(record_type,'manage_external')))
);
CREATE POLICY p1_domain_records_insert ON public.p1_domain_records FOR INSERT TO app_runtime_secure
WITH CHECK (
  created_by = public.pke_current_user_id()
  AND public.pke_has_project_permission(project_id, public.p1_workflow_permission(record_type,'create'))
);
CREATE POLICY p1_domain_records_update ON public.p1_domain_records FOR UPDATE TO app_runtime_secure
USING (
  public.pke_has_project_permission(project_id, public.p1_workflow_permission(record_type,'update'))
  AND (external_scope_user_id IS NULL OR external_scope_user_id = public.pke_current_user_id()
       OR public.pke_has_project_permission(project_id, public.p1_workflow_permission(record_type,'manage_external')))
)
WITH CHECK (
  public.pke_has_project_permission(project_id, public.p1_workflow_permission(record_type,'update'))
  AND (external_scope_user_id IS NULL OR external_scope_user_id = public.pke_current_user_id()
       OR public.pke_has_project_permission(project_id, public.p1_workflow_permission(record_type,'manage_external')))
);

CREATE POLICY p1_domain_events_select ON public.p1_domain_events FOR SELECT TO app_runtime_secure
USING (
  public.pke_has_project_permission(project_id,'audit.view')
  OR EXISTS (
    SELECT 1 FROM public.p1_domain_records r
    WHERE r.id=record_id AND r.project_id=p1_domain_events.project_id
      AND public.pke_has_project_permission(project_id, public.p1_workflow_permission(r.record_type,'view'))
  )
);
CREATE POLICY p1_domain_events_insert ON public.p1_domain_events FOR INSERT TO app_runtime_secure
WITH CHECK (
  actor_user_id=public.pke_current_user_id()
  AND EXISTS (
    SELECT 1 FROM public.p1_domain_records r
    WHERE r.id=record_id AND r.project_id=p1_domain_events.project_id
      AND public.pke_has_project_permission(project_id, public.p1_workflow_permission(r.record_type,'update'))
  )
);
CREATE POLICY p1_domain_evidence_select ON public.p1_domain_evidence FOR SELECT TO app_runtime_secure
USING (
  EXISTS (
    SELECT 1 FROM public.p1_domain_records r
    WHERE r.id=record_id AND r.project_id=p1_domain_evidence.project_id
      AND public.pke_has_project_permission(project_id, public.p1_workflow_permission(r.record_type,'view'))
      AND (r.external_scope_user_id IS NULL OR r.external_scope_user_id=public.pke_current_user_id()
           OR public.pke_has_project_permission(project_id, public.p1_workflow_permission(r.record_type,'manage_external')))
  )
);
CREATE POLICY p1_domain_evidence_insert ON public.p1_domain_evidence FOR INSERT TO app_runtime_secure
WITH CHECK (
  uploaded_by=public.pke_current_user_id()
  AND EXISTS (
    SELECT 1 FROM public.p1_domain_records r
    WHERE r.id=record_id AND r.project_id=p1_domain_evidence.project_id
      AND public.pke_has_project_permission(project_id, public.p1_workflow_permission(r.record_type,'update'))
  )
);
CREATE POLICY p1_report_kpi_definitions_select ON public.p1_report_kpi_definitions FOR SELECT TO app_runtime_secure
USING (project_id IS NULL OR public.pke_has_project_permission(project_id,'reports.view'));
CREATE POLICY p1_report_kpi_definitions_manage ON public.p1_report_kpi_definitions FOR ALL TO app_runtime_secure
USING (project_id IS NOT NULL AND public.pke_has_project_permission(project_id,'reports.create'))
WITH CHECK (project_id IS NOT NULL AND public.pke_has_project_permission(project_id,'reports.create'));

INSERT INTO public.permissions (name,code,description,is_active)
VALUES
 ('Procurement PO View','procurement.po.view','View Project-scoped requisitions, purchase orders and commitments.',true),
 ('Procurement PO Create','procurement.po.create','Create Project-scoped requisitions and purchase orders.',true),
 ('Procurement PO Update','procurement.po.update','Update draft procurement records.',true),
 ('Procurement PO Manage','procurement.po.manage','Manage procurement commitments and internal/external assignment scope.',true),
 ('Procurement PO Approve','procurement.po.approve','Approve purchase orders with maker-checker separation.',true),
 ('Procurement Commitment View','procurement.commitment.view','View only supplier-assigned delivery commitments.',true),
 ('Procurement Commitment Manage','procurement.commitment.manage','Create/update supplier delivery commitments.',true),
 ('Procurement Match View','procurement.match.view','View PO, goods receipt and invoice match status.',true),
 ('Procurement Match Create','procurement.match.create','Record and reconcile three-way match results.',true),
 ('Quality Sample View','quality.sample.view','View Project-scoped quality samples.',true),
 ('Quality Result View','quality.result.view','View laboratory and QC results.',true),
 ('Quality Release View','quality.release.view','View independent QA release decisions.',true),
 ('Quality Release Decide','quality.release.decide','Independently release or hold batches/lots.',true),
 ('HSE Inspection View','hse.inspection.view','View HSE inspections.',true),
 ('HSE Inspection Create','hse.inspection.create','Create HSE inspections.',true),
 ('HSE Inspection Update','hse.inspection.update','Update HSE inspection records.',true),
 ('HSE Action View','hse.action.view','View corrective and preventive actions.',true),
 ('HSE Action Manage','hse.action.manage','Manage HSE corrective and preventive actions.',true),
 ('Dispatch View','dispatch.view','View dispatch assignments and SLA.',true),
 ('Dispatch Create','dispatch.create','Create dispatch assignments.',true),
 ('Dispatch Update','dispatch.update','Update dispatch assignments and exceptions.',true),
 ('Dispatch Manage','dispatch.manage','Manage dispatch assignment scope.',true),
 ('Survey View','shipping.survey.view','View independent marine survey evidence.',true),
 ('Survey Submit','shipping.survey.submit','Submit independent survey evidence.',true),
 ('Ship Acknowledgement View','shipping.ack.view','View ship master acknowledgements.',true),
 ('Ship Acknowledge','shipping.acknowledge','Submit ship master acknowledgement.',true),
 ('Laytime View','shipping.laytime.view','View laytime evidence and calculations.',true),
 ('Laytime Manage','shipping.laytime.manage','Manage laytime events and evidence.',true),
 ('LC View','lc.view','View letter of credit clauses and presentations.',true),
 ('LC Create','lc.create','Create letter of credit records and clauses.',true),
 ('LC Update','lc.update','Update letter of credit records and clauses.',true),
 ('LC Discrepancy Manage','lc.discrepancy.manage','Manage LC discrepancies and resolution.',true),
 ('LC Present','lc.present','Submit LC document presentation.',true),
 ('Audit Finding View','audit.finding.view','View audit findings and corrective actions.',true),
 ('Audit Finding Create','audit.finding.create','Create audit findings.',true),
 ('Audit Finding Respond','audit.finding.respond','Respond to findings and provide corrective evidence.',true),
 ('Audit Finding Close','audit.finding.close','Independently verify and close audit findings.',true)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, is_active=true;

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
SELECT r.role_code, p.code
FROM (VALUES
 ('procurement','procurement.po.view'),('procurement','procurement.po.create'),('procurement','procurement.po.update'),('procurement','procurement.po.manage'),('procurement','procurement.po.approve'),('procurement','procurement.match.view'),('procurement','procurement.match.create'),
 ('contract_manager','procurement.po.view'),('contract_manager','procurement.po.create'),('contract_manager','procurement.po.update'),('contract_manager','procurement.po.manage'),('contract_manager','procurement.po.approve'),('contract_manager','procurement.match.view'),
 ('supplier','procurement.commitment.view'),('supplier','procurement.commitment.manage'),
 ('qc_officer','quality.sample.view'),('qc_officer','quality.sample.create'),('qc_officer','quality.result.view'),('qc_officer','quality.result.create'),
 ('laboratory_officer','quality.result.view'),('laboratory_officer','quality.result.create'),
 ('qa_manager','quality.result.view'),('qa_manager','quality.result.review'),('qa_manager','quality.release.view'),('qa_manager','quality.release.decide'),
 ('hse_officer','hse.inspection.view'),('hse_officer','hse.inspection.create'),('hse_officer','hse.inspection.update'),('hse_officer','hse.action.view'),('hse_officer','hse.action.manage'),
 ('transport_manager','dispatch.view'),('transport_manager','dispatch.create'),('transport_manager','dispatch.update'),('transport_manager','dispatch.manage'),
 ('dispatcher','dispatch.view'),('dispatcher','dispatch.create'),('dispatcher','dispatch.update'),('dispatcher','dispatch.manage'),
 ('transporter','dispatch.view'),('transporter','dispatch.update'),
 ('driver','dispatch.view'),('driver','dispatch.update'),
 ('checker','dispatch.view'),('checker','dispatch.update'),
 ('master_of_loading','shipping.survey.view'),('master_of_loading','shipping.ack.view'),('master_of_loading','shipping.laytime.view'),('master_of_loading','shipping.laytime.manage'),
 ('loading_supervisor','shipping.laytime.view'),('loading_supervisor','shipping.laytime.manage'),
 ('loading_operator','shipping.laytime.view'),
 ('marine_surveyor','shipping.survey.view'),('marine_surveyor','shipping.survey.submit'),
 ('ship_master','shipping.ack.view'),('ship_master','shipping.acknowledge'),
 ('terminal_representative','shipping.laytime.view'),
 ('shipping_agent','shipping.laytime.view'),('shipping_agent','shipping.laytime.manage'),
 ('document_officer','lc.view'),('document_officer','lc.create'),('document_officer','lc.update'),('document_officer','lc.discrepancy.manage'),('document_officer','lc.present'),
 ('shipping_agent','lc.view'),('shipping_agent','lc.update'),('shipping_agent','lc.discrepancy.manage'),('shipping_agent','lc.present'),
 ('internal_auditor','audit.finding.view'),('internal_auditor','audit.finding.create'),('internal_auditor','audit.finding.close'),
 ('pm','audit.finding.view'),('project_admin','audit.finding.view'),
 ('production_manager','audit.finding.respond'),('packing_supervisor','audit.finding.respond'),('qc_officer','audit.finding.respond'),('qa_manager','audit.finding.respond'),('hse_officer','audit.finding.respond'),('procurement','audit.finding.respond'),('contract_manager','audit.finding.respond'),('warehouse_manager','audit.finding.respond'),('warehouse_officer','audit.finding.respond'),('inventory_controller','audit.finding.respond'),('transport_manager','audit.finding.respond'),('dispatcher','audit.finding.respond'),('master_of_loading','audit.finding.respond'),('loading_supervisor','audit.finding.respond'),('loading_operator','audit.finding.respond')
) AS r(role_code,permission_code)
JOIN public.pke_project_role_policy pol ON pol.role_code=r.role_code
JOIN public.permissions p ON p.code=r.permission_code AND p.is_active
ON CONFLICT (role_code,permission_code) DO NOTHING;

-- Seed grants only for existing Project role rows; external partner grants remain object-assigned.
INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,p.id
FROM public.project_roles pr
JOIN public.pke_project_role_permission_allowlist a ON a.role_code=pr.role_code
JOIN public.permissions p ON p.code=a.permission_code AND p.is_active
WHERE (
 (pr.role_code IN ('procurement','contract_manager') AND p.code LIKE 'procurement.%' AND p.code NOT IN ('procurement.commitment.view','procurement.commitment.manage'))
 OR (pr.role_code='supplier' AND p.code IN ('procurement.commitment.view','procurement.commitment.manage'))
 OR (pr.role_code IN ('qc_officer','laboratory_officer','qa_manager') AND p.code LIKE 'quality.%')
 OR (pr.role_code='hse_officer' AND p.code LIKE 'hse.%')
 OR (pr.role_code IN ('transport_manager','dispatcher','transporter','driver','checker') AND p.code LIKE 'dispatch.%')
 OR (pr.role_code IN ('master_of_loading','loading_supervisor','loading_operator','marine_surveyor','ship_master','terminal_representative','shipping_agent') AND p.code LIKE 'shipping.%' AND p.code NOT IN ('shipping.survey.submit','shipping.acknowledge'))
 OR (pr.role_code IN ('marine_surveyor') AND p.code='shipping.survey.submit')
 OR (pr.role_code IN ('ship_master') AND p.code='shipping.acknowledge')
 OR (pr.role_code IN ('document_officer','shipping_agent') AND p.code LIKE 'lc.%')
 OR (pr.role_code IN ('internal_auditor','pm','project_admin','production_manager','packing_supervisor','qc_officer','qa_manager','hse_officer','procurement','contract_manager','warehouse_manager','warehouse_officer','inventory_controller','transport_manager','dispatcher','master_of_loading','loading_supervisor','loading_operator') AND p.code LIKE 'audit.finding.%')
)
ON CONFLICT (project_role_id,permission_id) DO NOTHING;

INSERT INTO public.p1_report_kpi_definitions
(project_id,template_id,metric_key,label,formula_key,source_entity,unit_code,freshness_minutes,missing_data_policy)
VALUES
(NULL,'tpl-operational','production_output','Production output','production_output_quantity','production_batches','MT',1440,'unavailable'),
(NULL,'tpl-operational','qa_release_rate','QA release rate','qa_release_rate','p1_domain_records:qa_release','percent',1440,'unavailable'),
(NULL,'tpl-operational','hse_open_actions','Open HSE actions','hse_open_actions','p1_domain_records:hse_action','count',1440,'unavailable'),
(NULL,'tpl-logistics','dispatch_on_time','Dispatch on-time rate','dispatch_on_time_rate','p1_domain_records:dispatch_assignment','percent',60,'unavailable'),
(NULL,'tpl-shipping','loading_completion','Loading completion','loading_completion_rate','loading_tickets','percent',60,'unavailable'),
(NULL,'tpl-shipping','laytime_hours','Laytime hours','laytime_hours','p1_domain_records:laytime_event','hours',60,'unavailable'),
(NULL,'tpl-trade','lc_discrepancy_rate','LC discrepancy rate','lc_discrepancy_rate','p1_domain_records:lc_discrepancy','percent',1440,'unavailable'),
(NULL,'tpl-audit','audit_overdue','Overdue audit findings','audit_overdue_count','p1_domain_records:audit_finding','count',1440,'unavailable'),
(NULL,'tpl-procurement','three_way_match_rate','Three-way match rate','three_way_match_rate','p1_domain_records:goods_receipt_match','percent',1440,'unavailable'),
(NULL,'tpl-procurement','po_cycle_time','PO cycle time','po_cycle_time_hours','p1_domain_records:purchase_order','hours',1440,'unavailable'),
(NULL,'tpl-warehouse','inventory_variance','Inventory variance','inventory_variance_quantity','inventory_reconciliations','MT',1440,'unavailable'),
(NULL,'tpl-compliance','document_freshness','Document freshness','document_freshness_rate','project_export_documents','percent',1440,'unavailable')
ON CONFLICT DO NOTHING;
