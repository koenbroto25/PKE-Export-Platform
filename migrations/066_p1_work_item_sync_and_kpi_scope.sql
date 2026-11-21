-- Migration 066: P1 role-safe assignment resolution, task synchronization and KPI source corrections.
-- UAT ONLY. Do not add to the Production migration manifest or apply through the generic Production runner.
BEGIN;

-- Resolve role membership without exposing the Project role catalogue to app_runtime_secure.
CREATE OR REPLACE FUNCTION public.p1_has_active_project_role_assignment(
  p_project_id uuid,
  p_role_code text,
  p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_role_assignments a
    JOIN public.project_members pm
      ON pm.id = a.project_member_id
     AND pm.project_id = a.project_id
     AND pm.user_id = a.user_id
    JOIN public.project_roles pr
      ON pr.id = a.project_role_id
     AND pr.project_id = a.project_id
    JOIN public.projects p ON p.id = a.project_id
    JOIN public.users u ON u.id = a.user_id
    WHERE a.project_id = p_project_id
      AND pr.role_code = p_role_code
      AND (p_user_id IS NULL OR a.user_id = p_user_id)
      AND a.is_active = true
      AND a.revoked_at IS NULL
      AND (a.expires_at IS NULL OR a.expires_at > now())
      AND pm.is_active = true
      AND pm.deactivated_at IS NULL
      AND (pm.expires_at IS NULL OR pm.expires_at > now())
      AND pr.is_active = true
      AND p.is_active = true
      AND u.is_active = true
  )
$function$;
REVOKE ALL ON FUNCTION public.p1_has_active_project_role_assignment(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.p1_has_active_project_role_assignment(uuid, text, uuid) TO app_runtime_secure;

-- Vessel-call creation was mapped to shipping.create but had no canonical role grant.
INSERT INTO public.permissions(name,code,description,is_active)
VALUES ('Create vessel calls','shipping.create','Create Project-scoped vessel and port call records.',true)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_active=true;
INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
SELECT 'master_of_loading','shipping.create'
FROM public.pke_project_role_policy WHERE role_code='master_of_loading'
ON CONFLICT (role_code,permission_code) DO NOTHING;
INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,p.id
FROM public.project_roles pr
JOIN public.permissions p ON p.code='shipping.create' AND p.is_active
WHERE pr.role_code='master_of_loading' AND pr.is_active
ON CONFLICT (project_role_id,permission_id) DO NOTHING;

-- P1 evidence may be attached by a Laboratory Officer when creating a result;
-- result review/acceptance remains restricted to QA Manager.
DROP POLICY IF EXISTS p1_domain_evidence_insert ON public.p1_domain_evidence;
CREATE POLICY p1_domain_evidence_insert ON public.p1_domain_evidence FOR INSERT TO app_runtime_secure
WITH CHECK (
  uploaded_by=public.pke_current_user_id()
  AND EXISTS (
    SELECT 1 FROM public.p1_domain_records r
    WHERE r.id=record_id AND r.project_id=p1_domain_evidence.project_id
      AND (
        public.pke_has_project_permission(project_id,public.p1_workflow_permission(r.record_type,'update'))
        OR (r.record_type='quality_result' AND public.pke_has_project_permission(project_id,'quality.result.create'))
      )
      AND (r.external_scope_user_id IS NULL OR r.external_scope_user_id=public.pke_current_user_id()
           OR public.pke_has_project_permission(project_id,public.p1_workflow_permission(r.record_type,'manage_external')))
  )
);

-- Correct KPI source definitions to reflect the source records actually measured.
UPDATE public.p1_report_kpi_definitions
SET label='LC presentation discrepancy rate',source_entity='p1_domain_records:lc_presentation',updated_at=now()
WHERE template_id='tpl-trade' AND metric_key='lc_discrepancy_rate';
UPDATE public.p1_report_kpi_definitions
SET source_entity='loading_operations + verified loading_tickets',updated_at=now()
WHERE template_id='tpl-shipping' AND metric_key='loading_completion';

-- Preserve the link from a P1 source version to exactly one task event.
ALTER TABLE public.project_work_item_events
  ADD COLUMN IF NOT EXISTS source_event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS project_work_item_events_source_event_key_uq
  ON public.project_work_item_events(project_id,source_event_key)
  WHERE source_event_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.p1_sync_project_work_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid;
  v_status text;
  v_type text;
  v_priority text;
  v_event text;
  v_event_id uuid;
  v_work_item_id uuid;
  v_assignment_changed boolean := false;
  v_status_changed boolean := false;
BEGIN
  v_actor := COALESCE(NEW.updated_by,NEW.created_by);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'P1 task synchronization requires a source actor';
  END IF;

  IF NOT public.p1_has_active_project_role_assignment(NEW.project_id,NEW.owner_role_code,NEW.assignee_user_id) THEN
    RAISE EXCEPTION 'P1 owner role % has no active Project assignee', NEW.owner_role_code
      USING ERRCODE='23514';
  END IF;

  IF TG_OP='UPDATE' THEN
    v_assignment_changed := OLD.owner_role_code IS DISTINCT FROM NEW.owner_role_code
      OR OLD.assignee_user_id IS DISTINCT FROM NEW.assignee_user_id;
    v_status_changed := OLD.status IS DISTINCT FROM NEW.status;
  END IF;

  v_status := CASE NEW.status
    WHEN 'submitted' THEN 'submitted'
    WHEN 'presented' THEN 'submitted'
    WHEN 'responded' THEN 'submitted'
    WHEN 'approved' THEN 'acknowledged'
    WHEN 'issued' THEN 'acknowledged'
    WHEN 'acknowledged' THEN 'acknowledged'
    WHEN 'in_progress' THEN 'in_progress'
    WHEN 'partially_received' THEN 'in_progress'
    WHEN 'blocked' THEN 'blocked'
    WHEN 'held' THEN 'blocked'
    WHEN 'rejected' THEN 'blocked'
    WHEN 'discrepancy' THEN 'blocked'
    WHEN 'expired' THEN 'blocked'
    WHEN 'received' THEN 'resolved'
    WHEN 'matched' THEN 'resolved'
    WHEN 'released' THEN 'resolved'
    WHEN 'completed' THEN 'resolved'
    WHEN 'verified' THEN 'resolved'
    WHEN 'accepted' THEN 'resolved'
    WHEN 'closed' THEN 'closed'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'open'
  END;

  v_type := CASE
    WHEN NEW.record_type IN ('qa_release','audit_closure') THEN 'approval_request'
    WHEN NEW.record_type IN ('hse_action','audit_finding','lc_discrepancy') THEN 'exception'
    ELSE 'task'
  END;

  v_priority := CASE
    WHEN lower(COALESCE(NEW.payload->>'priority',''))='critical'
      OR lower(COALESCE(NEW.payload->>'severity','')) IN ('critical','severe') THEN 'critical'
    WHEN lower(COALESCE(NEW.payload->>'priority',''))='high'
      OR lower(COALESCE(NEW.payload->>'severity',''))='high'
      OR (NEW.due_at IS NOT NULL AND NEW.due_at < now() AND v_status NOT IN ('resolved','closed','cancelled')) THEN 'high'
    WHEN lower(COALESCE(NEW.payload->>'priority',''))='low' THEN 'low'
    ELSE 'normal'
  END;

  INSERT INTO public.project_work_items(
    project_id,source_entity_type,source_entity_id,work_item_type,title,description,priority,status,
    owner_role_code,assignee_user_id,created_by,due_at,dedupe_key,updated_at
  ) VALUES (
    NEW.project_id,'p1_domain_records',NEW.id,v_type,NEW.title,
    'P1 '||NEW.record_type||' · '||NEW.record_code||' · '||NEW.status,
    v_priority,v_status,NEW.owner_role_code,NEW.assignee_user_id,NEW.created_by,NEW.due_at,
    'p1-domain:'||NEW.id::text,now()
  )
  ON CONFLICT (project_id,dedupe_key) DO UPDATE SET
    source_entity_type=EXCLUDED.source_entity_type,
    source_entity_id=EXCLUDED.source_entity_id,
    work_item_type=EXCLUDED.work_item_type,
    title=EXCLUDED.title,
    description=EXCLUDED.description,
    priority=EXCLUDED.priority,
    status=EXCLUDED.status,
    owner_role_code=EXCLUDED.owner_role_code,
    assignee_user_id=EXCLUDED.assignee_user_id,
    due_at=EXCLUDED.due_at,
    updated_at=now()
  RETURNING id INTO v_work_item_id;

  IF TG_OP='INSERT' THEN
    v_event := 'created';
  ELSIF v_assignment_changed THEN
    v_event := 'reassigned';
  ELSIF v_status_changed THEN
    v_event := CASE v_status
      WHEN 'acknowledged' THEN 'acknowledged'
      WHEN 'in_progress' THEN 'started'
      WHEN 'blocked' THEN 'blocked'
      WHEN 'submitted' THEN 'submitted'
      WHEN 'resolved' THEN 'resolved'
      WHEN 'closed' THEN 'closed'
      WHEN 'cancelled' THEN 'cancelled'
      ELSE 'commented'
    END;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.project_work_item_events(
    work_item_id,project_id,event_type,actor_user_id,reason,payload,source_event_key
  ) VALUES (
    v_work_item_id,NEW.project_id,v_event,v_actor,
    CASE WHEN TG_OP='INSERT' THEN 'P1 workflow created' ELSE 'P1 workflow updated' END,
    jsonb_build_object('source','p1_domain_records','recordId',NEW.id,'recordType',NEW.record_type,
      'recordCode',NEW.record_code,'recordStatus',NEW.status,'version',NEW.version),
    'p1:'||NEW.id::text||':'||NEW.version::text
  )
  ON CONFLICT (project_id,source_event_key) WHERE source_event_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NOT NULL AND (TG_OP='INSERT' OR v_assignment_changed) THEN
    INSERT INTO public.user_notifications(
      id,event_id,project_id,work_item_id,recipient_user_id,created_by,title,message,priority,category,created_at
    )
    SELECT gen_random_uuid(),v_event_id,wi.project_id,wi.id,a.user_id,v_actor,
      'Tugas P1 baru: '||wi.title,
      'Anda menerima workflow P1 '||NEW.record_code||'. Tenggat: '||COALESCE(NEW.due_at::text,'belum ditentukan')||'.',
      wi.priority,'task_assignment',now()
    FROM public.project_work_items wi
    JOIN public.project_roles pr ON pr.project_id=wi.project_id AND pr.role_code=wi.owner_role_code
    JOIN public.project_role_assignments a ON a.project_id=pr.project_id AND a.project_role_id=pr.id
    JOIN public.project_members pm ON pm.id=a.project_member_id AND pm.project_id=a.project_id AND pm.user_id=a.user_id
    JOIN public.users u ON u.id=a.user_id AND u.is_active
    WHERE wi.id=v_work_item_id
      AND (wi.assignee_user_id IS NULL OR wi.assignee_user_id=a.user_id)
      AND a.is_active AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>now())
      AND pm.is_active AND pm.deactivated_at IS NULL
      AND (pm.expires_at IS NULL OR pm.expires_at>now())
      AND a.user_id<>v_actor
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.p1_sync_project_work_item() FROM PUBLIC;

DROP TRIGGER IF EXISTS p1_domain_record_work_item_sync ON public.p1_domain_records;
CREATE TRIGGER p1_domain_record_work_item_sync
AFTER INSERT OR UPDATE OF status,title,owner_role_code,assignee_user_id,due_at,payload
ON public.p1_domain_records
FOR EACH ROW EXECUTE FUNCTION public.p1_sync_project_work_item();

COMMIT;
