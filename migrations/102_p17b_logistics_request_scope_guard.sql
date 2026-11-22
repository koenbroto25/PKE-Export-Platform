-- Migration 102: enforce Project parent scope and stale-snapshot checks for P17-B canonical logistics proposals.
BEGIN;
CREATE OR REPLACE FUNCTION public.pke_guard_p17b_logistics_request_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_admin boolean;
 v_current jsonb;
 v_port uuid;
 v_pks uuid;
 v_parent uuid;
BEGIN
 v_admin:=public.pke_is_platform_admin();
 IF TG_OP='INSERT' THEN
  IF NEW.operation='update' AND NOT v_admin THEN
   CASE NEW.entity_type
    WHEN 'port' THEN
     IF NOT public.pke_p16_project_port_permission(NEW.project_id,NEW.target_id,'port.view') THEN
      RAISE EXCEPTION 'Port target is outside Project scope' USING ERRCODE='42501';
     END IF;
    WHEN 'route' THEN
     SELECT pks_site_id INTO v_pks FROM public.pks_port_routes WHERE id=NEW.target_id;
     IF NOT EXISTS(SELECT 1 FROM public.project_pks_site_participation part WHERE part.project_id=NEW.project_id AND part.pks_site_id=v_pks AND part.status IN ('active','proposed'))
       OR NOT public.pke_has_project_permission(NEW.project_id,'route.estimate') THEN
      RAISE EXCEPTION 'Route target is outside Project PKS scope' USING ERRCODE='42501';
     END IF;
    WHEN 'terminal' THEN
     SELECT port_id INTO v_port FROM public.port_terminals WHERE id=NEW.target_id;
     IF NOT public.pke_p16_project_port_permission(NEW.project_id,v_port,'port.view') THEN
      RAISE EXCEPTION 'Terminal target is outside Project port scope' USING ERRCODE='42501';
     END IF;
    WHEN 'loading_service' THEN
     SELECT port_id INTO v_port FROM public.port_loading_services WHERE id=NEW.target_id;
     IF NOT public.pke_p16_project_port_permission(NEW.project_id,v_port,'port.view') THEN
      RAISE EXCEPTION 'Loading service target is outside Project port scope' USING ERRCODE='42501';
     END IF;
    WHEN 'warehouse' THEN
     IF NOT public.pke_p16_project_warehouse_permission(NEW.project_id,NEW.target_id,'warehouse.view') THEN
      RAISE EXCEPTION 'Warehouse target is outside Project scope' USING ERRCODE='42501';
     END IF;
   END CASE;
  END IF;
  RETURN NEW;
 END IF;

 IF NEW.status NOT IN ('submitted','approved') OR v_admin THEN RETURN NEW; END IF;

 IF NEW.operation='update' THEN
  CASE NEW.entity_type
   WHEN 'port' THEN SELECT to_jsonb(t) INTO v_current FROM public.ports t WHERE id=NEW.target_id;
   WHEN 'route' THEN SELECT to_jsonb(t) INTO v_current FROM public.pks_port_routes t WHERE id=NEW.target_id;
   WHEN 'terminal' THEN SELECT to_jsonb(t) INTO v_current FROM public.port_terminals t WHERE id=NEW.target_id;
   WHEN 'loading_service' THEN SELECT to_jsonb(t) INTO v_current FROM public.port_loading_services t WHERE id=NEW.target_id;
   WHEN 'warehouse' THEN SELECT to_jsonb(t) INTO v_current FROM public.warehouses t WHERE id=NEW.target_id;
  END CASE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Logistics master target no longer exists' USING ERRCODE='P0002'; END IF;
  IF v_current IS DISTINCT FROM OLD.base_snapshot THEN
   RAISE EXCEPTION 'Logistics master target changed since proposal creation; refresh and resubmit' USING ERRCODE='40001';
  END IF;
 END IF;

 CASE NEW.entity_type
  WHEN 'port' THEN
   IF NEW.operation='create' THEN
    IF NOT public.pke_has_project_permission(NEW.project_id,'port.view') THEN RAISE EXCEPTION 'Project port permission required' USING ERRCODE='42501'; END IF;
   ELSIF NOT public.pke_p16_project_port_permission(NEW.project_id,NEW.target_id,'port.view') THEN
    RAISE EXCEPTION 'Port target is outside Project scope' USING ERRCODE='42501';
   END IF;
  WHEN 'route' THEN
   v_pks:=COALESCE(NULLIF(NEW.proposed_data->>'pks_site_id','')::uuid,NULLIF(OLD.base_snapshot->>'pks_site_id','')::uuid);
   IF NOT EXISTS(SELECT 1 FROM public.project_pks_site_participation part WHERE part.project_id=NEW.project_id AND part.pks_site_id=v_pks AND part.status IN ('active','proposed'))
     OR NOT public.pke_has_project_permission(NEW.project_id,'route.estimate') THEN
    RAISE EXCEPTION 'Route PKS site is outside Project scope' USING ERRCODE='42501';
   END IF;
   IF NOT public.pke_has_project_permission(NEW.project_id,'port.view') THEN RAISE EXCEPTION 'Project port permission required for route proposal' USING ERRCODE='42501'; END IF;
  WHEN 'terminal' THEN
   v_port:=COALESCE(NULLIF(NEW.proposed_data->>'port_id','')::uuid,NULLIF(OLD.base_snapshot->>'port_id','')::uuid);
   IF NOT public.pke_has_project_permission(NEW.project_id,'port.view') THEN RAISE EXCEPTION 'Project port permission required for terminal proposal' USING ERRCODE='42501'; END IF;
  WHEN 'loading_service' THEN
   v_port:=COALESCE(NULLIF(NEW.proposed_data->>'port_id','')::uuid,NULLIF(OLD.base_snapshot->>'port_id','')::uuid);
   IF NOT public.pke_has_project_permission(NEW.project_id,'port.view') THEN RAISE EXCEPTION 'Project port permission required for loading service proposal' USING ERRCODE='42501'; END IF;
  WHEN 'warehouse' THEN
   IF NEW.operation='create' THEN
    IF NOT public.pke_has_project_permission(NEW.project_id,'warehouse.view') THEN RAISE EXCEPTION 'Project warehouse permission required' USING ERRCODE='42501'; END IF;
   ELSE
    v_port:=COALESCE(NULLIF(NEW.proposed_data->>'port_id','')::uuid,NULLIF(OLD.base_snapshot->>'port_id','')::uuid);
    IF NOT public.pke_has_project_permission(NEW.project_id,'warehouse.view') THEN RAISE EXCEPTION 'Project warehouse permission required' USING ERRCODE='42501'; END IF;
   END IF;
 END CASE;
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_p17b_logistics_request_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_guard_p17b_logistics_request_scope() TO app_runtime_secure;

CREATE TRIGGER p17b_logistics_change_00_scope_guard
 BEFORE UPDATE ON public.p17b_logistics_change_requests
 FOR EACH ROW EXECUTE FUNCTION public.pke_guard_p17b_logistics_request_scope();
CREATE TRIGGER p17b_logistics_change_scope_insert
 AFTER INSERT ON public.p17b_logistics_change_requests
 FOR EACH ROW EXECUTE FUNCTION public.pke_guard_p17b_logistics_request_scope();
COMMIT;