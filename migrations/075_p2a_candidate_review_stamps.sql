-- Migration 075: P2-A admin verification decision stamps for candidate review.
-- Target: Neon UAT only. Production requires separate owner release approval.
BEGIN;

CREATE OR REPLACE FUNCTION public.pke_guard_and_audit_p2a_master_candidate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v_user_id uuid; v_role text; v_is_admin boolean;
BEGIN
 v_user_id:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 v_role:=NULLIF(current_setting('app.current_role',true),'');
 v_is_admin:=public.pke_is_platform_admin();

 IF TG_OP='UPDATE' THEN
   IF NOT v_is_admin AND (
     NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_name IS DISTINCT FROM OLD.source_name
     OR NEW.source_url IS DISTINCT FROM OLD.source_url
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
   ) THEN
     RAISE EXCEPTION 'Only Platform Admin may change candidate provenance or verification decision'
       USING ERRCODE='42501';
   END IF;
   IF v_is_admin AND NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
     NEW.reviewed_by:=v_user_id;
     NEW.reviewed_at:=now();
   END IF;
   NEW.updated_at:=now();
 ELSE
   IF NEW.verification_status<>'unverified' THEN
     RAISE EXCEPTION 'New candidates must start unverified'
       USING ERRCODE='42501';
   END IF;
   NEW.reviewed_by:=NULL;
   NEW.reviewed_at:=NULL;
 END IF;

 INSERT INTO public.audit_events(
   actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,
   source,reason,before_snapshot,after_snapshot,metadata,outcome
 ) VALUES (
   v_user_id,CASE WHEN v_user_id IS NULL THEN 'system' ELSE 'user' END,v_role,
   'pks.participation.manage',
   CASE WHEN TG_OP='INSERT' THEN 'p2a_master_candidate.created' ELSE 'p2a_master_candidate.updated' END,
   'p2a_master_data_candidates',NEW.id,NEW.project_id,'p2a_candidate_register',
   CASE WHEN NEW.is_seed_data THEN 'Synthetic/public-source candidate seed; not a verified supplier or facility' ELSE 'P2-A master data candidate maintained' END,
   CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),
   jsonb_build_object('source_type',NEW.source_type,'source_name',NEW.source_name,'source_reference',NEW.source_reference,
                      'is_seed_data',NEW.is_seed_data,'seed_batch_id',NEW.seed_batch_id,
                      'verification_status',NEW.verification_status,'reviewed_by',NEW.reviewed_by,'reviewed_at',NEW.reviewed_at),
   'success'
 );
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_and_audit_p2a_master_candidate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_guard_and_audit_p2a_master_candidate() TO app_runtime_secure;

COMMIT;
