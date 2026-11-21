-- Migration 092: bind P16 parent resources and Project-owned evidence/workflows to selected Project context.
-- Neon UAT only. Production remains unchanged.
CREATE SCHEMA IF NOT EXISTS p2b_backup_091_20261121;
CREATE TABLE p2b_backup_091_20261121.p16_parent_and_project_policies_pre_092 AS
 SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN
 ('ports','warehouses','vessel_nominations','vessel_port_assessments','warehouse_reservations',
  'project_export_documents','project_export_document_requirements');

DROP POLICY IF EXISTS p16_resource_project_read ON public.ports;
CREATE POLICY p16_resource_project_read ON public.ports FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,id,'port.view'));

DROP POLICY IF EXISTS p16_resource_project_read ON public.warehouses;
CREATE POLICY p16_resource_project_read ON public.warehouses FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_warehouse_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,id,'warehouse.view'));

DROP POLICY IF EXISTS pke_scope_select ON public.vessel_nominations;
CREATE POLICY pke_scope_select ON public.vessel_nominations FOR SELECT TO app_runtime_secure
 USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'vessel.view'));
DROP POLICY IF EXISTS pke_scope_insert ON public.vessel_nominations;
CREATE POLICY pke_scope_insert ON public.vessel_nominations FOR INSERT TO app_runtime_secure
 WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'vessel.nominate'));
DROP POLICY IF EXISTS pke_scope_update ON public.vessel_nominations;
CREATE POLICY pke_scope_update ON public.vessel_nominations FOR UPDATE TO app_runtime_secure
 USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'vessel.nominate'))
 WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'vessel.nominate'));

DROP POLICY IF EXISTS pke_scope_insert ON public.vessel_port_assessments;
CREATE POLICY pke_scope_insert ON public.vessel_port_assessments FOR INSERT TO app_runtime_secure
 WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'vessel.port.assess'));
DROP POLICY IF EXISTS p16_assessment_project_read ON public.vessel_port_assessments;
CREATE POLICY p16_assessment_project_read ON public.vessel_port_assessments FOR SELECT TO app_runtime_secure
 USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND (public.pke_has_project_permission(project_id,'vessel.port.assess')
     OR public.pke_has_project_permission(project_id,'vessel.view')));

-- The same selected-Project invariant applies to warehouse reservations and the evidence
-- documents referenced by P16 depth/tide submissions.
DROP POLICY IF EXISTS pke_scope_insert ON public.warehouse_reservations;
CREATE POLICY pke_scope_insert ON public.warehouse_reservations FOR INSERT TO app_runtime_secure
 WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'warehouse.create'));
DROP POLICY IF EXISTS pke_scope_select ON public.warehouse_reservations;
CREATE POLICY pke_scope_select ON public.warehouse_reservations FOR SELECT TO app_runtime_secure
 USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'warehouse.view'));
DROP POLICY IF EXISTS pke_scope_update ON public.warehouse_reservations;
CREATE POLICY pke_scope_update ON public.warehouse_reservations FOR UPDATE TO app_runtime_secure
 USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'warehouse.update'))
 WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'warehouse.update'));

DROP POLICY IF EXISTS pke_project_export_documents_select ON public.project_export_documents;
CREATE POLICY pke_project_export_documents_select ON public.project_export_documents FOR SELECT TO app_runtime_secure
 USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'documents.view'));
DROP POLICY IF EXISTS pke_project_export_documents_insert ON public.project_export_documents;
CREATE POLICY pke_project_export_documents_insert ON public.project_export_documents FOR INSERT TO app_runtime_secure
 WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'documents.create'));
DROP POLICY IF EXISTS pke_project_export_documents_update ON public.project_export_documents;
CREATE POLICY pke_project_export_documents_update ON public.project_export_documents FOR UPDATE TO app_runtime_secure
 USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'documents.update'))
 WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'documents.update'));
DROP POLICY IF EXISTS pke_project_export_documents_delete ON public.project_export_documents;
CREATE POLICY pke_project_export_documents_delete ON public.project_export_documents FOR DELETE TO app_runtime_secure
 USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'documents.delete'));

DROP POLICY IF EXISTS pke_project_export_document_requirements_select ON public.project_export_document_requirements;
CREATE POLICY pke_project_export_document_requirements_select ON public.project_export_document_requirements FOR SELECT TO app_runtime_secure
 USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'documents.view'));
DROP POLICY IF EXISTS pke_project_export_document_requirements_insert ON public.project_export_document_requirements;
CREATE POLICY pke_project_export_document_requirements_insert ON public.project_export_document_requirements FOR INSERT TO app_runtime_secure
 WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'documents.create'));
DROP POLICY IF EXISTS pke_project_export_document_requirements_update ON public.project_export_document_requirements;
CREATE POLICY pke_project_export_document_requirements_update ON public.project_export_document_requirements FOR UPDATE TO app_runtime_secure
 USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'documents.update'))
 WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'documents.update'));
DROP POLICY IF EXISTS pke_project_export_document_requirements_delete ON public.project_export_document_requirements;
CREATE POLICY pke_project_export_document_requirements_delete ON public.project_export_document_requirements FOR DELETE TO app_runtime_secure
 USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
   AND public.pke_has_project_permission(project_id,'documents.delete'));
