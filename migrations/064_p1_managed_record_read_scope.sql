-- P1 delegated managers must be able to read the records they are authorized to manage.
INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
SELECT role_code,'procurement.commitment.view'
FROM public.pke_project_role_policy
WHERE role_code IN ('procurement','contract_manager')
ON CONFLICT(role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,perm.id
FROM public.project_roles pr
JOIN public.pke_project_role_permission_allowlist a ON a.role_code=pr.role_code AND a.permission_code='procurement.commitment.view'
JOIN public.permissions perm ON perm.code='procurement.commitment.view' AND perm.is_active
WHERE pr.role_code IN ('procurement','contract_manager')
ON CONFLICT(project_role_id,permission_id) DO NOTHING;

DROP POLICY IF EXISTS p1_domain_records_select ON public.p1_domain_records;
CREATE POLICY p1_domain_records_select ON public.p1_domain_records FOR SELECT TO app_runtime_secure
USING (
  (
    pke_has_project_permission(project_id,p1_workflow_permission(record_type,'view'))
    OR pke_has_project_permission(project_id,p1_workflow_permission(record_type,'manage_external'))
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
        pke_has_project_permission(r.project_id,p1_workflow_permission(r.record_type,'view'))
        OR pke_has_project_permission(r.project_id,p1_workflow_permission(r.record_type,'manage_external'))
        OR (r.record_type IN ('audit_finding','audit_response','hse_action')
            AND pke_has_project_permission(r.project_id,CASE WHEN r.record_type='hse_action' THEN 'hse.action.respond' ELSE 'audit.finding.respond' END)
            AND pke_user_has_active_project_role(r.project_id,r.owner_role_code)
            AND (r.assignee_user_id IS NULL OR r.assignee_user_id=pke_current_user_id()))
        OR (r.record_type='qa_release' AND pke_has_project_permission(r.project_id,'quality.release.view'))
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
        pke_has_project_permission(r.project_id,p1_workflow_permission(r.record_type,'view'))
        OR pke_has_project_permission(r.project_id,p1_workflow_permission(r.record_type,'manage_external'))
        OR (r.record_type IN ('audit_finding','audit_response','hse_action')
            AND pke_has_project_permission(r.project_id,CASE WHEN r.record_type='hse_action' THEN 'hse.action.respond' ELSE 'audit.finding.respond' END)
            AND pke_user_has_active_project_role(r.project_id,r.owner_role_code)
            AND (r.assignee_user_id IS NULL OR r.assignee_user_id=pke_current_user_id()))
        OR (r.record_type='qa_release' AND pke_has_project_permission(r.project_id,'quality.release.view'))
      )
      AND (r.external_scope_user_id IS NULL OR r.external_scope_user_id=pke_current_user_id()
           OR pke_has_project_permission(r.project_id,p1_workflow_permission(r.record_type,'manage_external')))
  )
);

