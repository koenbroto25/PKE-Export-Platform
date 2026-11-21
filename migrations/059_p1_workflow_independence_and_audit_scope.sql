-- P1 hardening: owner-role access to findings, independent QA read visibility and immutable event history.
DROP POLICY IF EXISTS p1_domain_records_select ON public.p1_domain_records;
CREATE POLICY p1_domain_records_select ON public.p1_domain_records FOR SELECT TO app_runtime_secure
USING (
  (
    public.pke_has_project_permission(project_id, public.p1_workflow_permission(record_type,'view'))
    OR (record_type IN ('audit_finding','audit_response')
        AND public.pke_has_project_permission(project_id,'audit.finding.respond')
        AND public.pke_user_has_active_project_role(project_id,owner_role_code)
        AND (assignee_user_id IS NULL OR assignee_user_id=public.pke_current_user_id()))
    OR (record_type='qa_release' AND public.pke_has_project_permission(project_id,'quality.release.view'))
  )
  AND (external_scope_user_id IS NULL OR external_scope_user_id=public.pke_current_user_id()
       OR public.pke_has_project_permission(project_id,public.p1_workflow_permission(record_type,'manage_external')))
);

DROP POLICY IF EXISTS p1_domain_events_select ON public.p1_domain_events;
CREATE POLICY p1_domain_events_select ON public.p1_domain_events FOR SELECT TO app_runtime_secure
USING (
  public.pke_has_project_permission(project_id,'audit.view')
  OR EXISTS (
    SELECT 1 FROM public.p1_domain_records r
    WHERE r.id=record_id AND r.project_id=p1_domain_events.project_id
      AND (
        public.pke_has_project_permission(project_id,public.p1_workflow_permission(r.record_type,'view'))
        OR (r.record_type IN ('audit_finding','audit_response')
            AND public.pke_has_project_permission(project_id,'audit.finding.respond')
            AND public.pke_user_has_active_project_role(project_id,r.owner_role_code)
            AND (r.assignee_user_id IS NULL OR r.assignee_user_id=public.pke_current_user_id()))
        OR (r.record_type='qa_release' AND public.pke_has_project_permission(project_id,'quality.release.view'))
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
        public.pke_has_project_permission(project_id,public.p1_workflow_permission(r.record_type,'view'))
        OR (r.record_type IN ('audit_finding','audit_response')
            AND public.pke_has_project_permission(project_id,'audit.finding.respond')
            AND public.pke_user_has_active_project_role(project_id,r.owner_role_code)
            AND (r.assignee_user_id IS NULL OR r.assignee_user_id=public.pke_current_user_id()))
        OR (r.record_type='qa_release' AND public.pke_has_project_permission(project_id,'quality.release.view'))
      )
      AND (r.external_scope_user_id IS NULL OR r.external_scope_user_id=public.pke_current_user_id()
           OR public.pke_has_project_permission(project_id,public.p1_workflow_permission(r.record_type,'manage_external')))
  )
);

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
SELECT x.role_code,x.permission_code
FROM (VALUES
 ('internal_auditor','audit.finding.respond'),
 ('production_manager','quality.release.view'),
 ('packing_supervisor','quality.release.view')
) AS x(role_code,permission_code)
JOIN public.pke_project_role_policy p ON p.role_code=x.role_code
JOIN public.permissions perm ON perm.code=x.permission_code AND perm.is_active
ON CONFLICT (role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,perm.id
FROM public.project_roles pr
JOIN public.pke_project_role_permission_allowlist a ON a.role_code=pr.role_code
JOIN public.permissions perm ON perm.code=a.permission_code AND perm.is_active
WHERE (pr.role_code='internal_auditor' AND perm.code='audit.finding.respond')
   OR (pr.role_code IN ('production_manager','packing_supervisor') AND perm.code='quality.release.view')
ON CONFLICT (project_role_id,permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.p1_guard_domain_record_update()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.record_type IS DISTINCT FROM OLD.record_type
     OR NEW.record_code IS DISTINCT FROM OLD.record_code
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'P1 workflow identity fields are immutable' USING ERRCODE='42501';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'P1 workflow version must increment exactly once' USING ERRCODE='40001';
  END IF;
  NEW.updated_at := GREATEST(now(), OLD.updated_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS p1_domain_record_guard_update ON public.p1_domain_records;
CREATE TRIGGER p1_domain_record_guard_update
BEFORE UPDATE ON public.p1_domain_records
FOR EACH ROW EXECUTE FUNCTION public.p1_guard_domain_record_update();

