-- Migration 100: append-only audit evidence for P17-B logistics change requests.
BEGIN;
CREATE OR REPLACE FUNCTION public.pke_audit_p17b_logistics_change_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_user uuid;
 v_action text;
BEGIN
 v_user:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 IF TG_OP='INSERT' THEN
  v_action:='p17b.logistics_change_request.created';
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  v_action:='p17b.logistics_change_request.'||NEW.status;
 ELSE
  v_action:='p17b.logistics_change_request.updated';
 END IF;
 INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,
  source,reason,before_snapshot,after_snapshot,metadata,outcome)
 VALUES(v_user,'user',NULLIF(current_setting('app.current_role',true),''),'pke.logistics.master.change_request.manage',
  v_action,'p17b_logistics_change_requests',NEW.id,NEW.project_id,'p17b_logistics_change_request',NEW.request_reason,
  CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),
  jsonb_build_object('entity_type',NEW.entity_type,'operation',NEW.operation,'status',NEW.status,
   'source_reference',NEW.source_reference,'applied_target_id',NEW.applied_target_id,
   'reviewed_by',NEW.reviewed_by,'reviewed_at',NEW.reviewed_at),'success');
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_audit_p17b_logistics_change_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_audit_p17b_logistics_change_request() TO app_runtime_secure;
CREATE TRIGGER p17b_logistics_change_audit
 AFTER INSERT OR UPDATE ON public.p17b_logistics_change_requests
 FOR EACH ROW EXECUTE FUNCTION public.pke_audit_p17b_logistics_change_request();
COMMIT;