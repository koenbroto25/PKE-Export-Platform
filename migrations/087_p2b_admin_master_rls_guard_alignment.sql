-- Migration 087: align admin master RLS with SECURITY DEFINER trigger guard and fix symmetric updated_at exclusion.
CREATE SCHEMA IF NOT EXISTS p2b_backup_086_20261121;
CREATE TABLE p2b_backup_086_20261121.p16_admin_master_guard_pre_087 AS SELECT pg_get_functiondef('public.pke_p16_admin_master_guard()'::regprocedure) AS definition;
CREATE TABLE p2b_backup_086_20261121.p16_admin_policies_pre_087 AS SELECT * FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'p16_admin_%';
CREATE OR REPLACE FUNCTION public.pke_p16_admin_master_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_actor uuid:=public.pke_current_user_id(); v_before jsonb; v_after jsonb; v_changed boolean:=false;
BEGIN
 IF NOT public.pke_is_platform_admin() OR v_actor IS NULL THEN RAISE EXCEPTION 'Platform Admin required for P16 global master data.' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN
  INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,action,target_type,target_id,before_snapshot,outcome)
  VALUES(v_actor,'admin','admin','p16.master.deleted',TG_TABLE_NAME,OLD.id,to_jsonb(OLD),'success'); RETURN OLD;
 ELSIF TG_OP='INSERT' THEN
  NEW.submitted_by:=v_actor; NEW.verification_status:='submitted'; NEW.verified_by:=NULL; NEW.verified_at:=NULL;
  INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,action,target_type,target_id,after_snapshot,outcome)
  VALUES(v_actor,'admin','admin','p16.master.submitted',TG_TABLE_NAME,NEW.id,to_jsonb(NEW),'success'); RETURN NEW;
 END IF;
 v_before:=to_jsonb(OLD); v_after:=to_jsonb(NEW);
 v_changed:=(v_before-ARRAY['verification_status','verified_by','verified_at','review_note','submitted_by','updated_at']::text[]) IS DISTINCT FROM (v_after-ARRAY['verification_status','verified_by','verified_at','review_note','submitted_by','updated_at']::text[]);
 IF v_changed THEN NEW.submitted_by:=v_actor; NEW.verification_status:='submitted'; NEW.verified_by:=NULL; NEW.verified_at:=NULL;
 ELSIF NEW.verification_status='verified' AND OLD.verification_status IS DISTINCT FROM 'verified' THEN
  IF NULLIF(btrim(COALESCE(NEW.source_reference,'')),'') IS NULL OR COALESCE(NEW.evidence_sha256,'') !~ '^[0-9a-f]{64}$' OR OLD.submitted_by IS NULL OR OLD.submitted_by=v_actor OR length(btrim(COALESCE(NEW.review_note,'')))<5 THEN
   RAISE EXCEPTION 'Independent verification requires source, SHA-256 evidence, a different reviewer and review note.' USING ERRCODE='23514'; END IF;
  NEW.verified_by:=v_actor; NEW.verified_at:=now();
 ELSIF NEW.verification_status='rejected' AND OLD.verification_status IS DISTINCT FROM 'rejected' THEN
  IF OLD.submitted_by=v_actor OR length(btrim(COALESCE(NEW.review_note,'')))<5 THEN RAISE EXCEPTION 'Independent rejection requires reviewer note.' USING ERRCODE='23514'; END IF;
  NEW.verified_by:=v_actor; NEW.verified_at:=now();
 END IF;
 INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,action,target_type,target_id,before_snapshot,after_snapshot,reason,outcome)
 VALUES(v_actor,'admin','admin',CASE WHEN NEW.verification_status IN ('verified','rejected') AND OLD.verification_status IS DISTINCT FROM NEW.verification_status THEN 'p16.master.reviewed' ELSE 'p16.master.updated' END,TG_TABLE_NAME,NEW.id,v_before,to_jsonb(NEW),NULLIF(btrim(COALESCE(NEW.review_note,'')),''),'success');
 RETURN NEW;
END
$function$;

DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['ports','port_terminals','port_berths','port_channels','port_anchorages','port_loading_services','port_equipment','port_operating_limits','warehouses','warehouse_zones','warehouse_bins','warehouse_equipment','pks_port_routes'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS p16_admin_insert ON public.%I',t);
  EXECUTE format('DROP POLICY IF EXISTS p16_admin_update ON public.%I',t);
  EXECUTE format('DROP POLICY IF EXISTS p16_admin_delete ON public.%I',t);
  EXECUTE format('CREATE POLICY p16_admin_insert ON public.%I FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_current_user_id() IS NOT NULL)',t);
  EXECUTE format('CREATE POLICY p16_admin_update ON public.%I FOR UPDATE TO app_runtime_secure USING (public.pke_current_user_id() IS NOT NULL) WITH CHECK (public.pke_current_user_id() IS NOT NULL)',t);
  EXECUTE format('CREATE POLICY p16_admin_delete ON public.%I FOR DELETE TO app_runtime_secure USING (public.pke_current_user_id() IS NOT NULL)',t);
 END LOOP;
END
$policies$;
