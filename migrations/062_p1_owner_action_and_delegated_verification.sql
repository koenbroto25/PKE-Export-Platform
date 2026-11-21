-- P1 assignment completion: owner-role HSE actions and delegated internal verification.
INSERT INTO public.permissions(name,code,description,is_active)
VALUES('Respond to assigned HSE corrective actions','hse.action.respond','Update only HSE corrective actions assigned to the actor role/user.',true)
ON CONFLICT(code) DO UPDATE SET is_active=true,description=EXCLUDED.description;

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
SELECT p.role_code,'hse.action.respond'
FROM public.pke_project_role_policy p
WHERE p.role_code NOT IN ('pm','project_admin','finance','accounting','funder','internal_auditor')
ON CONFLICT(role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,perm.id
FROM public.project_roles pr
JOIN public.pke_project_role_permission_allowlist a ON a.role_code=pr.role_code AND a.permission_code='hse.action.respond'
JOIN public.permissions perm ON perm.code='hse.action.respond' AND perm.is_active
ON CONFLICT(project_role_id,permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.p1_workflow_permission(p_record_type text,p_action text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
BEGIN
  CASE p_record_type
    WHEN 'hse_action' THEN
      RETURN CASE p_action WHEN 'view' THEN 'hse.action.view' WHEN 'create' THEN 'hse.action.manage' WHEN 'update' THEN 'hse.action.respond' ELSE 'hse.action.manage' END;
    ELSE
      RETURN CASE p_record_type
        WHEN 'purchase_requisition' THEN CASE p_action WHEN 'view' THEN 'procurement.po.view' WHEN 'create' THEN 'procurement.po.create' WHEN 'update' THEN 'procurement.po.update' ELSE 'procurement.po.manage' END
        WHEN 'purchase_order' THEN CASE p_action WHEN 'view' THEN 'procurement.po.view' WHEN 'create' THEN 'procurement.po.create' WHEN 'update' THEN 'procurement.po.update' ELSE 'procurement.po.manage' END
        WHEN 'supplier_commitment' THEN CASE p_action WHEN 'view' THEN 'procurement.commitment.view' WHEN 'create' THEN 'procurement.commitment.manage' WHEN 'update' THEN 'procurement.commitment.manage' ELSE 'procurement.po.manage' END
        WHEN 'goods_receipt_match' THEN CASE p_action WHEN 'view' THEN 'procurement.match.view' WHEN 'create' THEN 'procurement.match.create' WHEN 'update' THEN 'procurement.match.create' ELSE 'procurement.match.create' END
        WHEN 'production_batch' THEN CASE p_action WHEN 'view' THEN 'operations.view' WHEN 'create' THEN 'operations.create' WHEN 'update' THEN 'operations.update' ELSE 'operations.update' END
        WHEN 'packing_batch' THEN CASE p_action WHEN 'view' THEN 'operations.view' WHEN 'create' THEN 'operations.create' WHEN 'update' THEN 'operations.update' ELSE 'operations.update' END
        WHEN 'quality_sample' THEN CASE p_action WHEN 'view' THEN 'quality.sample.view' WHEN 'create' THEN 'quality.sample.create' WHEN 'update' THEN 'quality.sample.create' ELSE 'quality.result.review' END
        WHEN 'quality_result' THEN CASE p_action WHEN 'view' THEN 'quality.result.view' WHEN 'create' THEN 'quality.result.create' WHEN 'update' THEN 'quality.result.review' ELSE 'quality.result.review' END
        WHEN 'qa_release' THEN CASE p_action WHEN 'view' THEN 'quality.release.view' WHEN 'create' THEN 'quality.release.decide' WHEN 'update' THEN 'quality.release.decide' ELSE 'quality.release.decide' END
        WHEN 'hse_inspection' THEN CASE p_action WHEN 'view' THEN 'hse.inspection.view' WHEN 'create' THEN 'hse.inspection.create' WHEN 'update' THEN 'hse.inspection.update' ELSE 'hse.inspection.update' END
        WHEN 'dispatch_assignment' THEN CASE p_action WHEN 'view' THEN 'dispatch.view' WHEN 'create' THEN 'dispatch.create' WHEN 'update' THEN 'dispatch.update' ELSE 'dispatch.manage' END
        WHEN 'vessel_call' THEN CASE p_action WHEN 'view' THEN 'vessel.view' WHEN 'create' THEN 'shipping.create' WHEN 'update' THEN 'shipping.update' ELSE 'shipping.update' END
        WHEN 'loading_plan' THEN CASE p_action WHEN 'view' THEN 'shipping.view' WHEN 'create' THEN 'shipping.update' WHEN 'update' THEN 'shipping.update' ELSE 'shipping.update' END
        WHEN 'loading_survey' THEN CASE p_action WHEN 'view' THEN 'shipping.survey.view' WHEN 'create' THEN 'shipping.survey.submit' WHEN 'update' THEN 'shipping.survey.submit' ELSE 'shipping.update' END
        WHEN 'ship_master_ack' THEN CASE p_action WHEN 'view' THEN 'shipping.ack.view' WHEN 'create' THEN 'shipping.acknowledge' WHEN 'update' THEN 'shipping.acknowledge' ELSE 'shipping.update' END
        WHEN 'laytime_event' THEN CASE p_action WHEN 'view' THEN 'shipping.laytime.view' WHEN 'create' THEN 'shipping.laytime.manage' WHEN 'update' THEN 'shipping.laytime.manage' ELSE 'shipping.update' END
        WHEN 'lc_record' THEN CASE p_action WHEN 'view' THEN 'lc.view' WHEN 'create' THEN 'lc.create' WHEN 'update' THEN 'lc.update' ELSE 'documents.manage' END
        WHEN 'lc_clause' THEN CASE p_action WHEN 'view' THEN 'lc.view' WHEN 'create' THEN 'lc.create' WHEN 'update' THEN 'lc.update' ELSE 'documents.manage' END
        WHEN 'lc_discrepancy' THEN CASE p_action WHEN 'view' THEN 'lc.view' WHEN 'create' THEN 'lc.discrepancy.manage' WHEN 'update' THEN 'lc.discrepancy.manage' ELSE 'documents.manage' END
        WHEN 'lc_presentation' THEN CASE p_action WHEN 'view' THEN 'lc.view' WHEN 'create' THEN 'lc.present' WHEN 'update' THEN 'lc.present' ELSE 'documents.manage' END
        WHEN 'audit_finding' THEN CASE p_action WHEN 'view' THEN 'audit.finding.view' WHEN 'create' THEN 'audit.finding.create' WHEN 'update' THEN 'audit.finding.respond' ELSE 'audit.finding.close' END
        WHEN 'audit_response' THEN CASE p_action WHEN 'view' THEN 'audit.finding.view' WHEN 'create' THEN 'audit.finding.respond' WHEN 'update' THEN 'audit.finding.respond' ELSE 'audit.finding.close' END
        WHEN 'audit_closure' THEN CASE p_action WHEN 'view' THEN 'audit.finding.view' WHEN 'create' THEN 'audit.finding.close' WHEN 'update' THEN 'audit.finding.close' ELSE 'audit.finding.close' END
        ELSE NULL
      END;
  END CASE;
END;
$$;

DROP POLICY IF EXISTS p1_domain_records_update ON public.p1_domain_records;
CREATE POLICY p1_domain_records_update ON public.p1_domain_records FOR UPDATE TO app_runtime_secure
USING (
  (
    pke_has_project_permission(project_id,p1_workflow_permission(record_type,'update'))
    OR pke_has_project_permission(project_id,p1_workflow_permission(record_type,'manage_external'))
  )
  AND (record_type<>'hse_action'
       OR pke_has_project_permission(project_id,'hse.action.manage')
       OR (pke_has_project_permission(project_id,'hse.action.respond')
           AND pke_user_has_active_project_role(project_id,owner_role_code)
           AND (assignee_user_id IS NULL OR assignee_user_id=pke_current_user_id())))
  AND (external_scope_user_id IS NULL OR external_scope_user_id=pke_current_user_id()
       OR pke_has_project_permission(project_id,p1_workflow_permission(record_type,'manage_external')))
)
WITH CHECK (
  (
    pke_has_project_permission(project_id,p1_workflow_permission(record_type,'update'))
    OR pke_has_project_permission(project_id,p1_workflow_permission(record_type,'manage_external'))
  )
  AND (record_type<>'hse_action'
       OR pke_has_project_permission(project_id,'hse.action.manage')
       OR (pke_has_project_permission(project_id,'hse.action.respond')
           AND pke_user_has_active_project_role(project_id,owner_role_code)
           AND (assignee_user_id IS NULL OR assignee_user_id=pke_current_user_id())))
  AND (external_scope_user_id IS NULL OR external_scope_user_id=pke_current_user_id()
       OR pke_has_project_permission(project_id,p1_workflow_permission(record_type,'manage_external')))
);

DROP POLICY IF EXISTS p1_domain_events_insert ON public.p1_domain_events;
CREATE POLICY p1_domain_events_insert ON public.p1_domain_events FOR INSERT TO app_runtime_secure
WITH CHECK (
  actor_user_id=pke_current_user_id()
  AND EXISTS (
    SELECT 1 FROM public.p1_domain_records r
    WHERE r.id=record_id AND r.project_id=p1_domain_events.project_id
      AND (
        pke_has_project_permission(r.project_id,p1_workflow_permission(r.record_type,'update'))
        OR pke_has_project_permission(r.project_id,p1_workflow_permission(r.record_type,'create'))
        OR pke_has_project_permission(r.project_id,p1_workflow_permission(r.record_type,'manage_external'))
      )
  )
);

DROP POLICY IF EXISTS p1_domain_evidence_insert ON public.p1_domain_evidence;
CREATE POLICY p1_domain_evidence_insert ON public.p1_domain_evidence FOR INSERT TO app_runtime_secure
WITH CHECK (
  uploaded_by=pke_current_user_id()
  AND EXISTS (
    SELECT 1 FROM public.p1_domain_records r
    WHERE r.id=record_id AND r.project_id=p1_domain_evidence.project_id
      AND (
        pke_has_project_permission(r.project_id,p1_workflow_permission(r.record_type,'update'))
        OR pke_has_project_permission(r.project_id,p1_workflow_permission(r.record_type,'manage_external'))
      )
      AND (r.external_scope_user_id IS NULL OR r.external_scope_user_id=pke_current_user_id()
           OR pke_has_project_permission(r.project_id,p1_workflow_permission(r.record_type,'manage_external')))
  )
);

DROP POLICY IF EXISTS p1_domain_records_select ON public.p1_domain_records;
CREATE POLICY p1_domain_records_select ON public.p1_domain_records FOR SELECT TO app_runtime_secure
USING (
  (
    pke_has_project_permission(project_id,p1_workflow_permission(record_type,'view'))
    OR (record_type IN ('audit_finding','audit_response')
        AND pke_has_project_permission(project_id,'audit.finding.respond')
        AND pke_user_has_active_project_role(project_id,owner_role_code)
        AND (assignee_user_id IS NULL OR assignee_user_id=pke_current_user_id()))
    OR (record_type='qa_release' AND pke_has_project_permission(project_id,'quality.release.view'))
    OR (record_type='hse_action'
        AND pke_has_project_permission(project_id,'hse.action.respond')
        AND pke_user_has_active_project_role(project_id,owner_role_code)
        AND (assignee_user_id IS NULL OR assignee_user_id=pke_current_user_id()))
  )
  AND (external_scope_user_id IS NULL OR external_scope_user_id=pke_current_user_id()
       OR pke_has_project_permission(project_id,p1_workflow_permission(record_type,'manage_external')))
);

DROP POLICY IF EXISTS p1_domain_events_select ON public.p1_domain_events;
CREATE POLICY p1_domain_events_select ON public.p1_domain_events FOR SELECT TO app_runtime_secure
USING (
  pke_has_project_permission(project_id,'audit.view')
  OR EXISTS (
    SELECT 1 FROM public.p1_domain_records r
    WHERE r.id=record_id AND r.project_id=p1_domain_events.project_id
      AND (
        pke_has_project_permission(project_id,p1_workflow_permission(r.record_type,'view'))
        OR (r.record_type IN ('audit_finding','audit_response','hse_action')
            AND pke_has_project_permission(project_id,CASE WHEN r.record_type='hse_action' THEN 'hse.action.respond' ELSE 'audit.finding.respond' END)
            AND pke_user_has_active_project_role(project_id,r.owner_role_code)
            AND (r.assignee_user_id IS NULL OR r.assignee_user_id=pke_current_user_id()))
        OR (r.record_type='qa_release' AND pke_has_project_permission(project_id,'quality.release.view'))
      )
  )
);

DROP POLICY IF EXISTS p1_domain_evidence_select ON public.p1_domain_evidence;
CREATE POLICY p1_domain_evidence_select ON public.p1_domain_evidence FOR SELECT TO app_runtime_secure
USING (
  EXISTS (
    SELECT 1 FROM public.p1_domain_records r
    WHERE r.id=record_id AND r.project_id=p1_domain_evidence.project_id
      AND (
        pke_has_project_permission(project_id,p1_workflow_permission(r.record_type,'view'))
        OR (r.record_type IN ('audit_finding','audit_response','hse_action')
            AND pke_has_project_permission(project_id,CASE WHEN r.record_type='hse_action' THEN 'hse.action.respond' ELSE 'audit.finding.respond' END)
            AND pke_user_has_active_project_role(project_id,r.owner_role_code)
            AND (r.assignee_user_id IS NULL OR r.assignee_user_id=pke_current_user_id()))
        OR (r.record_type='qa_release' AND pke_has_project_permission(project_id,'quality.release.view'))
      )
      AND (r.external_scope_user_id IS NULL OR r.external_scope_user_id=pke_current_user_id()
           OR pke_has_project_permission(project_id,p1_workflow_permission(r.record_type,'manage_external')))
  )
);

