-- Migration 099: P17-B project-scoped PKE logistics scenario and maker-checker change requests.
-- UAT-first. Does not approve any third-party source rights or mark simulated records verified.
BEGIN;

INSERT INTO public.permissions(name,code,description,is_active)
VALUES
 ('View PKE Logistics Scenarios','pke.logistics.master.view','View Project-scoped PKE logistics chain scenarios and linked master records.',true),
 ('Manage PKE Logistics Change Requests','pke.logistics.master.change_request.manage','Create/edit own Project-scoped draft proposals for ports, routes, terminals, loading services and warehouses.',true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
VALUES ('pm','pke.logistics.master.view'),('pm','pke.logistics.master.change_request.manage')
ON CONFLICT (role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id,granted_by)
SELECT pr.project_id,pr.id,perm.id,NULL
FROM public.project_roles pr
JOIN public.permissions perm ON perm.code IN ('pke.logistics.master.view','pke.logistics.master.change_request.manage')
WHERE pr.role_code='pm' AND pr.is_active=true AND perm.is_active=true
ON CONFLICT (project_role_id,permission_id) DO NOTHING;

CREATE TABLE public.p17b_logistics_change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 entity_type text NOT NULL CHECK(entity_type IN ('port','route','terminal','loading_service','warehouse')),
 operation text NOT NULL CHECK(operation IN ('create','update')),
 target_id uuid,
 proposed_data jsonb NOT NULL CHECK(jsonb_typeof(proposed_data)='object' AND proposed_data<>'{}'::jsonb),
 base_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(base_snapshot)='object'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),
 request_reason text NOT NULL CHECK(length(btrim(request_reason)) BETWEEN 10 AND 2000),
 source_reference text NOT NULL CHECK(length(btrim(source_reference)) BETWEEN 8 AND 1000),
 source_url text CHECK(source_url IS NULL OR source_url ~* '^https?://'),
 source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(source_snapshot)='object'),
 decision_note text,
 requested_by uuid NOT NULL REFERENCES public.users(id),
 reviewed_by uuid REFERENCES public.users(id),
 reviewed_at timestamptz,
 applied_target_id uuid,
 applied_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT p17b_logistics_change_target_ck CHECK(
  (operation='create' AND target_id IS NULL AND base_snapshot='{}'::jsonb)
  OR (operation='update' AND target_id IS NOT NULL)
 ),
 CONSTRAINT p17b_logistics_change_decision_ck CHECK(
  (status IN ('draft','submitted') AND reviewed_by IS NULL AND reviewed_at IS NULL AND applied_at IS NULL)
  OR (status='rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND applied_at IS NULL)
  OR (status='approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND applied_at IS NOT NULL AND applied_target_id IS NOT NULL)
 )
);
CREATE INDEX p17b_logistics_change_project_status_idx
 ON public.p17b_logistics_change_requests(project_id,status,created_at DESC);
ALTER TABLE public.p17b_logistics_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p17b_logistics_change_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY p17b_logistics_change_select ON public.p17b_logistics_change_requests
 FOR SELECT TO app_runtime_secure
 USING(public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pke.logistics.master.view'));
CREATE POLICY p17b_logistics_change_insert ON public.p17b_logistics_change_requests
 FOR INSERT TO app_runtime_secure
 WITH CHECK(
  (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pke.logistics.master.change_request.manage'))
  AND requested_by=NULLIF(current_setting('app.current_user_id',true),'')::uuid
 );
CREATE POLICY p17b_logistics_change_update ON public.p17b_logistics_change_requests
 FOR UPDATE TO app_runtime_secure
 USING(public.pke_is_platform_admin() OR (
  requested_by=NULLIF(current_setting('app.current_user_id',true),'')::uuid
  AND public.pke_has_project_permission(project_id,'pke.logistics.master.change_request.manage')
 ))
 WITH CHECK(public.pke_is_platform_admin() OR (
  requested_by=NULLIF(current_setting('app.current_user_id',true),'')::uuid
  AND public.pke_has_project_permission(project_id,'pke.logistics.master.change_request.manage')
 ));
GRANT SELECT,INSERT,UPDATE ON public.p17b_logistics_change_requests TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.pke_apply_p17b_logistics_change_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_user uuid;
 v_admin boolean;
 v_current jsonb;
 v_merged jsonb;
 v_keys text[];
 v_allowed text[];
 v_target uuid;
 v_scope_port uuid;
 v_port public.ports%ROWTYPE;
 v_route public.pks_port_routes%ROWTYPE;
 v_terminal public.port_terminals%ROWTYPE;
 v_service public.port_loading_services%ROWTYPE;
 v_warehouse public.warehouses%ROWTYPE;
BEGIN
 v_user:=NULLIF(current_setting('app.current_user_id',true),'')::uuid;
 v_admin:=public.pke_is_platform_admin();

 IF TG_OP='INSERT' THEN
  NEW.requested_by:=COALESCE(NEW.requested_by,v_user);
  IF NEW.requested_by IS DISTINCT FROM v_user OR NEW.status<>'draft'
     OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.applied_at IS NOT NULL THEN
   RAISE EXCEPTION 'New logistics change requests must be own draft' USING ERRCODE='42501';
  END IF;
  IF NOT v_admin AND NOT public.pke_has_project_permission(NEW.project_id,'pke.logistics.master.change_request.manage') THEN
   RAISE EXCEPTION 'PKE logistics change request permission required' USING ERRCODE='42501';
  END IF;
  IF NOT v_admin THEN
   IF NEW.entity_type='route' AND NOT public.pke_has_project_permission(NEW.project_id,'route.estimate') THEN
    RAISE EXCEPTION 'Project route permission required' USING ERRCODE='42501';
   ELSIF NEW.entity_type='port' AND NOT public.pke_has_project_permission(NEW.project_id,'port.view') THEN
    RAISE EXCEPTION 'Project port permission required' USING ERRCODE='42501';
   ELSIF NEW.entity_type IN ('terminal','loading_service') AND NOT public.pke_has_project_permission(NEW.project_id,'port.view') THEN
    RAISE EXCEPTION 'Project port permission required' USING ERRCODE='42501';
   ELSIF NEW.entity_type='warehouse' AND NOT public.pke_has_project_permission(NEW.project_id,'warehouse.view') THEN
    RAISE EXCEPTION 'Project warehouse permission required' USING ERRCODE='42501';
   END IF;
  END IF;
  IF NEW.operation='update' THEN
   CASE NEW.entity_type
    WHEN 'port' THEN SELECT to_jsonb(t) INTO v_current FROM public.ports t WHERE id=NEW.target_id;
    WHEN 'route' THEN SELECT to_jsonb(t) INTO v_current FROM public.pks_port_routes t WHERE id=NEW.target_id;
    WHEN 'terminal' THEN SELECT to_jsonb(t) INTO v_current FROM public.port_terminals t WHERE id=NEW.target_id;
    WHEN 'loading_service' THEN SELECT to_jsonb(t) INTO v_current FROM public.port_loading_services t WHERE id=NEW.target_id;
    WHEN 'warehouse' THEN SELECT to_jsonb(t) INTO v_current FROM public.warehouses t WHERE id=NEW.target_id;
   END CASE;
   IF v_current IS NULL THEN RAISE EXCEPTION 'Logistics master record not found' USING ERRCODE='P0002'; END IF;
   NEW.base_snapshot:=v_current;
  ELSE
   NEW.base_snapshot:='{}'::jsonb;
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
 END IF;

 IF OLD.status='draft' AND NOT v_admin THEN
  IF OLD.requested_by IS DISTINCT FROM v_user OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
    OR NEW.operation IS DISTINCT FROM OLD.operation OR NEW.target_id IS DISTINCT FROM OLD.target_id
    OR NEW.base_snapshot IS DISTINCT FROM OLD.base_snapshot OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.applied_target_id IS DISTINCT FROM OLD.applied_target_id OR NEW.applied_at IS DISTINCT FROM OLD.applied_at
    OR NEW.status NOT IN ('draft','submitted') THEN
   RAISE EXCEPTION 'Requester may only edit/submit own logistics draft' USING ERRCODE='42501';
  END IF;
 ELSIF v_admin THEN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.entity_type IS DISTINCT FROM OLD.entity_type OR NEW.operation IS DISTINCT FROM OLD.operation
    OR NEW.target_id IS DISTINCT FROM OLD.target_id OR NEW.proposed_data IS DISTINCT FROM OLD.proposed_data
    OR NEW.base_snapshot IS DISTINCT FROM OLD.base_snapshot OR NEW.request_reason IS DISTINCT FROM OLD.request_reason
    OR NEW.source_reference IS DISTINCT FROM OLD.source_reference OR NEW.source_url IS DISTINCT FROM OLD.source_url
    OR NEW.source_snapshot IS DISTINCT FROM OLD.source_snapshot OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.applied_target_id IS DISTINCT FROM OLD.applied_target_id
    OR NEW.applied_at IS DISTINCT FROM OLD.applied_at THEN
   RAISE EXCEPTION 'Admin may decide but cannot rewrite a logistics proposal' USING ERRCODE='42501';
  END IF;
 ELSE
  RAISE EXCEPTION 'Submitted logistics proposal is immutable to requester' USING ERRCODE='42501';
 END IF;

 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF OLD.status='draft' AND NEW.status='submitted' THEN
   IF v_admin OR OLD.requested_by IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Only requester may submit draft' USING ERRCODE='42501';
   END IF;
  ELSIF OLD.status='submitted' AND NEW.status IN ('approved','rejected') THEN
   IF NOT v_admin THEN RAISE EXCEPTION 'Only Platform Admin may decide logistics change request' USING ERRCODE='42501'; END IF;
   IF OLD.requested_by=v_user THEN RAISE EXCEPTION 'Requester cannot approve own logistics change request' USING ERRCODE='42501'; END IF;
   IF NEW.status='rejected' THEN
    IF length(btrim(COALESCE(NEW.decision_note,'')))<5 THEN
     RAISE EXCEPTION 'Rejection decision note is required' USING ERRCODE='23514';
    END IF;
   ELSE
    v_merged:=CASE WHEN NEW.operation='create' THEN NEW.proposed_data ELSE NEW.base_snapshot||NEW.proposed_data END;
    CASE NEW.entity_type
     WHEN 'port' THEN
      v_allowed:=ARRAY['name','location','code','address','city','province','country_code','latitude','longitude','unlocode','national_code','authority_name','operator_name'];
      v_keys:=ARRAY(SELECT jsonb_object_keys(NEW.proposed_data));
      IF EXISTS(SELECT 1 FROM unnest(v_keys) k WHERE NOT(k=ANY(v_allowed))) THEN RAISE EXCEPTION 'Unsupported port fields' USING ERRCODE='23514'; END IF;
      SELECT * INTO v_port FROM jsonb_populate_record(NULL::public.ports,v_merged);
      IF length(btrim(COALESCE(v_port.name,'')))<2 OR length(COALESCE(v_port.country_code,''))<>2 THEN RAISE EXCEPTION 'Port name and country code required' USING ERRCODE='23514'; END IF;
      IF NEW.operation='create' THEN
       INSERT INTO public.ports(name,location,code,address,city,province,country_code,latitude,longitude,unlocode,national_code,authority_name,operator_name,source_reference,verification_status,is_active)
       VALUES(v_port.name,v_port.location,v_port.code,v_port.address,v_port.city,v_port.province,upper(v_port.country_code),v_port.latitude,v_port.longitude,v_port.unlocode,v_port.national_code,v_port.authority_name,v_port.operator_name,NEW.source_reference,'unverified',true) RETURNING id INTO v_target;
      ELSE
       UPDATE public.ports SET name=v_port.name,location=v_port.location,code=v_port.code,address=v_port.address,city=v_port.city,province=v_port.province,country_code=upper(v_port.country_code),latitude=v_port.latitude,longitude=v_port.longitude,unlocode=v_port.unlocode,national_code=v_port.national_code,authority_name=v_port.authority_name,operator_name=v_port.operator_name,source_reference=NEW.source_reference,verification_status='unverified',verified_at=NULL,verified_by=NULL,evidence_sha256=NULL,is_active=true,updated_at=now() WHERE id=NEW.target_id RETURNING id INTO v_target;
      END IF;
     WHEN 'route' THEN
      v_allowed:=ARRAY['pks_site_id','port_id','route_mode','distance_km','estimated_travel_minutes','route_notes','distance_method','route_geometry_feature_id'];
      v_keys:=ARRAY(SELECT jsonb_object_keys(NEW.proposed_data));
      IF EXISTS(SELECT 1 FROM unnest(v_keys) k WHERE NOT(k=ANY(v_allowed))) THEN RAISE EXCEPTION 'Unsupported route fields' USING ERRCODE='23514'; END IF;
      SELECT * INTO v_route FROM jsonb_populate_record(NULL::public.pks_port_routes,v_merged);
      IF v_route.pks_site_id IS NULL OR v_route.port_id IS NULL OR v_route.route_mode NOT IN ('road','river','sea','multimodal') THEN RAISE EXCEPTION 'Route PKS, port and mode required' USING ERRCODE='23514'; END IF;
      IF NOT v_admin AND NOT EXISTS(SELECT 1 FROM public.project_pks_site_participation part WHERE part.project_id=NEW.project_id AND part.pks_site_id=v_route.pks_site_id AND part.status IN ('active','proposed')) THEN RAISE EXCEPTION 'PKS site outside Project scope' USING ERRCODE='42501'; END IF;
      IF NEW.operation='create' THEN
       INSERT INTO public.pks_port_routes(pks_site_id,port_id,route_mode,distance_km,estimated_travel_minutes,route_notes,source_reference,verification_status,is_active,distance_method,submitted_by)
       VALUES(v_route.pks_site_id,v_route.port_id,v_route.route_mode,v_route.distance_km,v_route.estimated_travel_minutes,v_route.route_notes,NEW.source_reference,'unverified',true,v_route.distance_method,v_user) RETURNING id INTO v_target;
      ELSE
       UPDATE public.pks_port_routes SET pks_site_id=v_route.pks_site_id,port_id=v_route.port_id,route_mode=v_route.route_mode,distance_km=v_route.distance_km,estimated_travel_minutes=v_route.estimated_travel_minutes,route_notes=v_route.route_notes,source_reference=NEW.source_reference,verification_status='unverified',verified_at=NULL,verified_by=NULL,evidence_sha256=NULL,is_active=true,distance_method=v_route.distance_method,route_geometry_feature_id=v_route.route_geometry_feature_id,updated_at=now() WHERE id=NEW.target_id RETURNING id INTO v_target;
      END IF;
     WHEN 'terminal' THEN
      v_allowed:=ARRAY['port_id','terminal_code','name','operator_organization_id','cargo_types','operating_restrictions'];
      v_keys:=ARRAY(SELECT jsonb_object_keys(NEW.proposed_data));
      IF EXISTS(SELECT 1 FROM unnest(v_keys) k WHERE NOT(k=ANY(v_allowed))) THEN RAISE EXCEPTION 'Unsupported terminal fields' USING ERRCODE='23514'; END IF;
      SELECT * INTO v_terminal FROM jsonb_populate_record(NULL::public.port_terminals,v_merged);
      IF v_terminal.port_id IS NULL OR length(btrim(COALESCE(v_terminal.terminal_code,'')))<2 OR length(btrim(COALESCE(v_terminal.name,'')))<2 THEN RAISE EXCEPTION 'Terminal port, code and name required' USING ERRCODE='23514'; END IF;
      IF NEW.operation='create' THEN
       INSERT INTO public.port_terminals(port_id,terminal_code,name,operator_organization_id,cargo_types,status,operating_restrictions,source_reference,verification_status)
       VALUES(v_terminal.port_id,v_terminal.terminal_code,v_terminal.name,v_terminal.operator_organization_id,v_terminal.cargo_types,'unverified',COALESCE(v_terminal.operating_restrictions,'{}'::jsonb),NEW.source_reference,'unverified') RETURNING id INTO v_target;
      ELSE
       UPDATE public.port_terminals SET port_id=v_terminal.port_id,terminal_code=v_terminal.terminal_code,name=v_terminal.name,operator_organization_id=v_terminal.operator_organization_id,cargo_types=v_terminal.cargo_types,status='unverified',operating_restrictions=COALESCE(v_terminal.operating_restrictions,'{}'::jsonb),source_reference=NEW.source_reference,verification_status='unverified',verified_at=NULL,verified_by=NULL,evidence_sha256=NULL,updated_at=now() WHERE id=NEW.target_id RETURNING id INTO v_target;
      END IF;
     WHEN 'loading_service' THEN
      v_allowed:=ARRAY['port_id','terminal_id','berth_id','service_type','cargo_type','handling_mode','rate_value','rate_unit','operating_window'];
      v_keys:=ARRAY(SELECT jsonb_object_keys(NEW.proposed_data));
      IF EXISTS(SELECT 1 FROM unnest(v_keys) k WHERE NOT(k=ANY(v_allowed))) THEN RAISE EXCEPTION 'Unsupported loading service fields' USING ERRCODE='23514'; END IF;
      SELECT * INTO v_service FROM jsonb_populate_record(NULL::public.port_loading_services,v_merged);
      IF v_service.port_id IS NULL OR length(btrim(COALESCE(v_service.service_type,'')))<2 OR length(btrim(COALESCE(v_service.cargo_type,'')))<2 OR v_service.handling_mode NOT IN ('bagged','loose_bulk','containerized','bulk_container_stuffing','mixed') THEN RAISE EXCEPTION 'Loading service port, type, cargo and handling mode required' USING ERRCODE='23514'; END IF;
      IF NEW.operation='create' THEN
       INSERT INTO public.port_loading_services(port_id,terminal_id,berth_id,service_type,cargo_type,handling_mode,rate_value,rate_unit,operating_window,status,source_reference,verification_status)
       VALUES(v_service.port_id,v_service.terminal_id,v_service.berth_id,v_service.service_type,v_service.cargo_type,v_service.handling_mode,v_service.rate_value,v_service.rate_unit,v_service.operating_window,'unverified',NEW.source_reference,'unverified') RETURNING id INTO v_target;
      ELSE
       UPDATE public.port_loading_services SET port_id=v_service.port_id,terminal_id=v_service.terminal_id,berth_id=v_service.berth_id,service_type=v_service.service_type,cargo_type=v_service.cargo_type,handling_mode=v_service.handling_mode,rate_value=v_service.rate_value,rate_unit=v_service.rate_unit,operating_window=v_service.operating_window,status='unverified',source_reference=NEW.source_reference,verification_status='unverified',verified_at=NULL,verified_by=NULL,evidence_sha256=NULL,updated_at=now() WHERE id=NEW.target_id RETURNING id INTO v_target;
      END IF;
     WHEN 'warehouse' THEN
      v_allowed:=ARRAY['name','location','code','port_id','terminal_id','operator_organization_id','latitude','longitude','storage_mode','storage_capacity_mt','floor_area_m2','usable_volume_m3'];
      v_keys:=ARRAY(SELECT jsonb_object_keys(NEW.proposed_data));
      IF EXISTS(SELECT 1 FROM unnest(v_keys) k WHERE NOT(k=ANY(v_allowed))) THEN RAISE EXCEPTION 'Unsupported warehouse fields' USING ERRCODE='23514'; END IF;
      SELECT * INTO v_warehouse FROM jsonb_populate_record(NULL::public.warehouses,v_merged);
      IF length(btrim(COALESCE(v_warehouse.name,'')))<2 OR v_warehouse.port_id IS NULL THEN RAISE EXCEPTION 'Warehouse name and port required' USING ERRCODE='23514'; END IF;
      IF NEW.operation='create' THEN
       INSERT INTO public.warehouses(name,location,code,port_id,terminal_id,operator_organization_id,latitude,longitude,storage_mode,storage_capacity_mt,floor_area_m2,usable_volume_m3,verification_status,source_reference,is_active)
       VALUES(v_warehouse.name,v_warehouse.location,v_warehouse.code,v_warehouse.port_id,v_warehouse.terminal_id,v_warehouse.operator_organization_id,v_warehouse.latitude,v_warehouse.longitude,COALESCE(v_warehouse.storage_mode,'mixed'),v_warehouse.storage_capacity_mt,v_warehouse.floor_area_m2,v_warehouse.usable_volume_m3,'unverified',NEW.source_reference,true) RETURNING id INTO v_target;
      ELSE
       UPDATE public.warehouses SET name=v_warehouse.name,location=v_warehouse.location,code=v_warehouse.code,port_id=v_warehouse.port_id,terminal_id=v_warehouse.terminal_id,operator_organization_id=v_warehouse.operator_organization_id,latitude=v_warehouse.latitude,longitude=v_warehouse.longitude,storage_mode=COALESCE(v_warehouse.storage_mode,'mixed'),storage_capacity_mt=v_warehouse.storage_capacity_mt,floor_area_m2=v_warehouse.floor_area_m2,usable_volume_m3=v_warehouse.usable_volume_m3,verification_status='unverified',verified_at=NULL,verified_by=NULL,evidence_sha256=NULL,source_reference=NEW.source_reference,is_active=true,updated_at=now() WHERE id=NEW.target_id RETURNING id INTO v_target;
      END IF;
    END CASE;
    NEW.applied_target_id:=v_target;
    NEW.applied_at:=now();
   END IF;
   NEW.reviewed_by:=v_user;
   NEW.reviewed_at:=now();
  ELSE
   RAISE EXCEPTION 'Invalid logistics request transition' USING ERRCODE='23514';
  END IF;
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.pke_apply_p17b_logistics_change_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_apply_p17b_logistics_change_request() TO app_runtime_secure;
CREATE TRIGGER p17b_logistics_change_apply
 BEFORE INSERT OR UPDATE ON public.p17b_logistics_change_requests
 FOR EACH ROW EXECUTE FUNCTION public.pke_apply_p17b_logistics_change_request();

CREATE TABLE public.p17b_logistics_scenarios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 scenario_code text NOT NULL UNIQUE,
 scenario_name text NOT NULL,
 product_code text NOT NULL DEFAULT 'PKE',
 pks_site_id uuid NOT NULL REFERENCES public.pks_sites(id) ON DELETE RESTRICT,
 route_id uuid NOT NULL REFERENCES public.pks_port_routes(id) ON DELETE RESTRICT,
 port_id uuid NOT NULL REFERENCES public.ports(id) ON DELETE RESTRICT,
 terminal_id uuid NOT NULL REFERENCES public.port_terminals(id) ON DELETE RESTRICT,
 loading_service_id uuid NOT NULL REFERENCES public.port_loading_services(id) ON DELETE RESTRICT,
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only IS TRUE),
 scenario_status text NOT NULL DEFAULT 'simulation' CHECK(scenario_status IN ('simulation','draft','archived')),
 source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(source_evidence)='array'),
 assumptions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(assumptions)='object'),
 created_by uuid REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX p17b_logistics_scenario_project_idx ON public.p17b_logistics_scenarios(project_id,scenario_status);
ALTER TABLE public.p17b_logistics_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p17b_logistics_scenarios FORCE ROW LEVEL SECURITY;
CREATE POLICY p17b_logistics_scenario_select ON public.p17b_logistics_scenarios
 FOR SELECT TO app_runtime_secure
 USING(public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pke.logistics.master.view'));
CREATE POLICY p17b_logistics_scenario_admin_all ON public.p17b_logistics_scenarios
 FOR ALL TO app_runtime_secure USING(public.pke_is_platform_admin()) WITH CHECK(public.pke_is_platform_admin());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.p17b_logistics_scenarios TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.pke_validate_p17b_logistics_scenario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_route public.pks_port_routes%ROWTYPE;
 v_terminal public.port_terminals%ROWTYPE;
 v_service public.port_loading_services%ROWTYPE;
 v_warehouse public.warehouses%ROWTYPE;
BEGIN
 SELECT * INTO v_route FROM public.pks_port_routes WHERE id=NEW.route_id;
 SELECT * INTO v_terminal FROM public.port_terminals WHERE id=NEW.terminal_id;
 SELECT * INTO v_service FROM public.port_loading_services WHERE id=NEW.loading_service_id;
 SELECT * INTO v_warehouse FROM public.warehouses WHERE id=NEW.warehouse_id;
 IF v_route.id IS NULL OR v_route.pks_site_id<>NEW.pks_site_id OR v_route.port_id<>NEW.port_id THEN
  RAISE EXCEPTION 'Scenario route must connect the selected PKS to the selected port' USING ERRCODE='23514';
 END IF;
 IF v_terminal.id IS NULL OR v_terminal.port_id<>NEW.port_id THEN
  RAISE EXCEPTION 'Scenario terminal must belong to selected port' USING ERRCODE='23514';
 END IF;
 IF v_service.id IS NULL OR v_service.port_id<>NEW.port_id OR (v_service.terminal_id IS NOT NULL AND v_service.terminal_id<>NEW.terminal_id) THEN
  RAISE EXCEPTION 'Scenario loading service must belong to selected port/terminal' USING ERRCODE='23514';
 END IF;
 IF v_warehouse.id IS NULL OR v_warehouse.port_id<>NEW.port_id OR (v_warehouse.terminal_id IS NOT NULL AND v_warehouse.terminal_id<>NEW.terminal_id) THEN
  RAISE EXCEPTION 'Scenario warehouse must belong to selected port/terminal' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pks_sites k WHERE k.id=NEW.pks_site_id AND k.source_reference LIKE 'SIMULATION_ONLY:%' AND k.verification_status='unverified')
 OR NOT EXISTS(SELECT 1 FROM public.ports p WHERE p.id=NEW.port_id AND p.source_reference LIKE 'SIMULATION_ONLY:%' AND p.verification_status='unverified')
 OR NOT EXISTS(SELECT 1 FROM public.pks_port_routes r WHERE r.id=NEW.route_id AND r.source_reference LIKE 'SIMULATION_ONLY:%' AND r.verification_status='unverified')
 OR NOT EXISTS(SELECT 1 FROM public.port_terminals t WHERE t.id=NEW.terminal_id AND t.source_reference LIKE 'SIMULATION_ONLY:%' AND t.verification_status='unverified')
 OR NOT EXISTS(SELECT 1 FROM public.port_loading_services s WHERE s.id=NEW.loading_service_id AND s.source_reference LIKE 'SIMULATION_ONLY:%' AND s.verification_status='unverified')
 OR NOT EXISTS(SELECT 1 FROM public.warehouses w WHERE w.id=NEW.warehouse_id AND w.source_reference LIKE 'SIMULATION_ONLY:%' AND w.verification_status='unverified') THEN
  RAISE EXCEPTION 'Scenario nodes must remain explicitly simulation-only and unverified' USING ERRCODE='23514';
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_validate_p17b_logistics_scenario() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_validate_p17b_logistics_scenario() TO app_runtime_secure;
CREATE TRIGGER p17b_logistics_scenario_validate
 BEFORE INSERT OR UPDATE ON public.p17b_logistics_scenarios
 FOR EACH ROW EXECUTE FUNCTION public.pke_validate_p17b_logistics_scenario();

COMMIT;
