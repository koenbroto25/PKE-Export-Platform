-- Migration 114: restore PM operational assignments only when the current PM ownership matches
-- and the assignment was revoked by a recorded global appointment suspension/revocation.
BEGIN;

-- Existing revoked assignments are immutable; the restore function supports both legacy
-- reason strings and the new appointment-prefixed reason format.

CREATE OR REPLACE FUNCTION public.pke_admin_set_pm_appointment_status(p_appointment_id uuid, p_status text, p_reason text)
RETURNS public.pm_appointments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_actor uuid:=public.pke_current_user_id();
 v_old public.pm_appointments%ROWTYPE;
 v_new public.pm_appointments%ROWTYPE;
 v_event text;
 v_restored integer:=0;
BEGIN
 IF NOT public.pke_is_platform_admin() THEN RAISE EXCEPTION 'Platform Admin required' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN ('suspended','revoked','active') OR length(btrim(coalesce(p_reason,'')))<5 THEN
   RAISE EXCEPTION 'Invalid status or reason' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_old FROM public.pm_appointments WHERE id=p_appointment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found' USING ERRCODE='P0002'; END IF;
 -- Same-state requests are idempotent and do not create misleading audit events.
 IF v_old.status=p_status THEN RETURN v_old; END IF;
 IF p_status='active' AND (SELECT is_active FROM public.users WHERE id=v_old.user_id) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'User must be active to reactivate appointment' USING ERRCODE='23514';
 END IF;
 IF p_status='active' THEN
   UPDATE public.pm_appointments SET status='revoked',status_changed_by=v_actor,status_changed_at=now(),
     status_reason='Superseded by reactivation',updated_at=now()
   WHERE user_id=v_old.user_id AND status='active' AND id<>v_old.id;
 END IF;
 UPDATE public.pm_appointments SET status=p_status,status_changed_by=v_actor,status_changed_at=now(),
   status_reason=CASE WHEN p_status='active' THEN NULL ELSE p_reason END,updated_at=now()
 WHERE id=p_appointment_id RETURNING * INTO v_new;

 IF p_status IN ('suspended','revoked') THEN
   UPDATE public.project_role_assignments a
   SET is_active=false,revoked_at=now(),revoked_by=v_actor,
       revoke_reason='PM appointment '||p_status||': '||p_reason,updated_at=now()
   FROM public.project_roles r
   WHERE r.id=a.project_role_id AND r.project_id=a.project_id AND r.role_code='pm'
     AND a.user_id=v_old.user_id AND a.is_active=true AND a.revoked_at IS NULL;
 ELSIF p_status='active' AND v_old.status IN ('suspended','revoked') THEN
   -- Restore only assignments whose current ownership still points to this PM,
   -- whose member remains active, and whose revocation is recorded as appointment-driven.
   -- Revoked assignment rows are immutable; create a fresh active assignment and retain the old row as history.
   INSERT INTO public.project_role_assignments(project_id,project_member_id,user_id,project_role_id,is_active,assigned_at,assigned_by,expires_at)
   SELECT a.project_id,a.project_member_id,a.user_id,r.id,true,now(),v_actor,a.expires_at
   FROM public.project_role_assignments a
   JOIN public.project_roles r ON r.id=a.project_role_id AND r.project_id=a.project_id AND r.role_code='pm' AND r.is_active=true
   JOIN public.project_pm_ownership o ON o.project_id=a.project_id AND o.pm_user_id=a.user_id AND o.pm_user_id=v_old.user_id
   JOIN public.project_members m ON m.id=a.project_member_id AND m.project_id=a.project_id AND m.user_id=a.user_id
     AND m.is_active=true AND m.deactivated_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>now())
   JOIN public.projects p ON p.id=a.project_id AND p.is_active=true
   WHERE a.user_id=v_old.user_id AND a.is_active=false AND a.revoked_at IS NOT NULL
     AND (a.expires_at IS NULL OR a.expires_at>now())
     AND EXISTS(
       SELECT 1 FROM public.pm_appointment_events e
       WHERE e.appointment_id=v_old.id AND e.event_code IN ('suspended','revoked')
         AND (a.revoke_reason='PM appointment '||e.event_code||': '||e.reason OR a.revoke_reason=e.reason)
     )
     AND NOT EXISTS(
       SELECT 1 FROM public.project_role_assignments other
       JOIN public.project_roles other_role ON other_role.id=other.project_role_id AND other_role.project_id=other.project_id AND other_role.role_code='pm'
       WHERE other.project_id=a.project_id AND other.id<>a.id AND other.is_active=true AND other.revoked_at IS NULL
         AND (other.expires_at IS NULL OR other.expires_at>now())
     );
   GET DIAGNOSTICS v_restored=ROW_COUNT;
   IF v_restored>0 THEN
     INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,action,target_type,target_id,project_id,reason,metadata,outcome)
     VALUES(v_actor,'user','platform_admin','project.pm.assignments.restored','pm_appointment',v_old.id,NULL,
       p_reason,jsonb_build_object('pmUserId',v_old.user_id,'restoredAssignments',v_restored),'success');
   END IF;
 END IF;
 v_event:=CASE WHEN p_status='active' THEN 'reactivated' WHEN p_status='suspended' THEN 'suspended' ELSE 'revoked' END;
 INSERT INTO public.pm_appointment_events(appointment_id,user_id,actor_user_id,event_code,reason,before_snapshot,after_snapshot)
 VALUES(v_new.id,v_new.user_id,v_actor,v_event,p_reason,to_jsonb(v_old),to_jsonb(v_new));
 RETURN v_new;
END;
$function$;

COMMIT;
