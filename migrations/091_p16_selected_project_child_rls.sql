-- Migration 091: enforce selected-Project scope on all P16 resource children and Admin-only master writes.
-- Neon UAT only. Production remains unchanged.
CREATE SCHEMA IF NOT EXISTS p2b_backup_090_20261121;
CREATE TABLE p2b_backup_090_20261121.p16_child_read_policies_pre_091 AS
 SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN (
 'port_terminals','port_berths','port_channels','port_anchorages','port_loading_services','port_equipment','port_operating_limits',
 'port_depth_observations','port_tide_observations','warehouse_zones','warehouse_bins','warehouse_equipment','pks_port_routes',
 'vessel_certificates','vessel_identifiers','vessel_name_history','vessel_port_calls','vessel_tracking_positions');
CREATE TABLE p2b_backup_090_20261121.p16_admin_write_policies_pre_091 AS
 SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN (
 'ports','port_terminals','port_berths','port_channels','port_anchorages','port_loading_services','port_equipment',
 'port_operating_limits','warehouses','warehouse_zones','warehouse_bins','warehouse_equipment','pks_port_routes')
 AND policyname IN ('p16_admin_insert','p16_admin_update','p16_admin_delete');

CREATE OR REPLACE FUNCTION public.pke_p16_project_warehouse_permission(p_project_id uuid,p_warehouse_id uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
 SELECT p_project_id IS NOT NULL AND p_warehouse_id IS NOT NULL
 AND NULLIF(current_setting('app.current_project_id',true),'')::uuid=p_project_id
 AND public.pke_has_project_permission(p_project_id,p_permission)
 AND (EXISTS(SELECT 1 FROM public.warehouse_reservations wr WHERE wr.project_id=p_project_id AND wr.warehouse_id=p_warehouse_id)
   OR EXISTS(SELECT 1 FROM public.warehouses w WHERE w.id=p_warehouse_id AND w.port_id IS NOT NULL
      AND public.pke_p16_project_port_permission(p_project_id,w.port_id,'port.view')))
$function$;
REVOKE ALL ON FUNCTION public.pke_p16_project_warehouse_permission(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_p16_project_warehouse_permission(uuid,uuid,text) TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.pke_p16_project_vessel_permission(p_project_id uuid,p_vessel_id uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $function$
 SELECT p_project_id IS NOT NULL AND p_vessel_id IS NOT NULL
 AND NULLIF(current_setting('app.current_project_id',true),'')::uuid=p_project_id
 AND public.pke_has_project_permission(p_project_id,p_permission)
 AND (EXISTS(SELECT 1 FROM public.vessel_nominations n WHERE n.project_id=p_project_id AND n.vessel_id=p_vessel_id)
   OR EXISTS(SELECT 1 FROM public.voyages v WHERE v.project_id=p_project_id AND v.vessel_id=p_vessel_id)
   OR EXISTS(SELECT 1 FROM public.vessel_port_assessments a WHERE a.project_id=p_project_id AND a.vessel_id=p_vessel_id))
$function$;
REVOKE ALL ON FUNCTION public.pke_p16_project_vessel_permission(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_p16_project_vessel_permission(uuid,uuid,text) TO app_runtime_secure;

DO $policies$
DECLARE t text;
BEGIN
 DROP POLICY IF EXISTS pke_scope_select ON public.port_terminals;
 CREATE POLICY pke_scope_select ON public.port_terminals FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,port_id,'port.view'));
 DROP POLICY IF EXISTS pke_scope_select ON public.port_berths;
 CREATE POLICY pke_scope_select ON public.port_berths FOR SELECT TO app_runtime_secure
 USING (EXISTS(SELECT 1 FROM public.port_terminals pt WHERE pt.id=port_berths.terminal_id
   AND public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,pt.port_id,'port.view')));
 DROP POLICY IF EXISTS pke_scope_select ON public.port_channels;
 CREATE POLICY pke_scope_select ON public.port_channels FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,port_id,'port.view'));
 DROP POLICY IF EXISTS pke_scope_select ON public.port_anchorages;
 CREATE POLICY pke_scope_select ON public.port_anchorages FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,port_id,'port.view'));
 DROP POLICY IF EXISTS pke_scope_select ON public.port_loading_services;
 CREATE POLICY pke_scope_select ON public.port_loading_services FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,port_id,'port.view'));
 DROP POLICY IF EXISTS pke_scope_select ON public.port_equipment;
 CREATE POLICY pke_scope_select ON public.port_equipment FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,port_id,'port.view'));
 DROP POLICY IF EXISTS pke_scope_select ON public.port_operating_limits;
 CREATE POLICY pke_scope_select ON public.port_operating_limits FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,port_id,'port.view'));

 DROP POLICY IF EXISTS pke_scope_select ON public.port_depth_observations;
 CREATE POLICY pke_scope_select ON public.port_depth_observations FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,port_id,'port.depth.view'));
 DROP POLICY IF EXISTS pke_scope_select ON public.port_tide_observations;
 CREATE POLICY pke_scope_select ON public.port_tide_observations FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_port_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,port_id,'port.depth.view'));

 DROP POLICY IF EXISTS pke_scope_select ON public.warehouse_zones;
 CREATE POLICY pke_scope_select ON public.warehouse_zones FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_warehouse_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,warehouse_id,'warehouse.view'));
 DROP POLICY IF EXISTS pke_scope_select ON public.warehouse_bins;
 CREATE POLICY pke_scope_select ON public.warehouse_bins FOR SELECT TO app_runtime_secure
 USING (EXISTS(SELECT 1 FROM public.warehouse_zones z WHERE z.id=warehouse_bins.zone_id
   AND public.pke_p16_project_warehouse_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,z.warehouse_id,'warehouse.view')));
 DROP POLICY IF EXISTS pke_scope_select ON public.warehouse_equipment;
 CREATE POLICY pke_scope_select ON public.warehouse_equipment FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_warehouse_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,warehouse_id,'warehouse.view'));

 DROP POLICY IF EXISTS p16_route_project_read ON public.pks_port_routes;
 CREATE POLICY p16_route_project_read ON public.pks_port_routes FOR SELECT TO app_runtime_secure
 USING (public.pke_has_project_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,'route.estimate') AND (
   EXISTS(SELECT 1 FROM public.project_operating_profiles op WHERE op.project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid AND op.primary_pks_site_id=pks_port_routes.pks_site_id)
   OR EXISTS(SELECT 1 FROM public.project_pks_site_participation part WHERE part.project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
     AND part.pks_site_id=pks_port_routes.pks_site_id AND part.status='active')));

 DROP POLICY IF EXISTS pke_scope_select ON public.vessel_certificates;
 CREATE POLICY pke_scope_select ON public.vessel_certificates FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_vessel_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,vessel_id,'vessel.view'));
 DROP POLICY IF EXISTS pke_scope_select ON public.vessel_identifiers;
 CREATE POLICY pke_scope_select ON public.vessel_identifiers FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_vessel_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,vessel_id,'vessel.view'));
 DROP POLICY IF EXISTS pke_scope_select ON public.vessel_name_history;
 CREATE POLICY pke_scope_select ON public.vessel_name_history FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_vessel_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,vessel_id,'vessel.view'));
 DROP POLICY IF EXISTS pke_scope_select ON public.vessel_port_calls;
 CREATE POLICY pke_scope_select ON public.vessel_port_calls FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_vessel_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,vessel_id,'vessel.view')
   OR EXISTS(SELECT 1 FROM public.voyages v WHERE v.id=vessel_port_calls.voyage_id
     AND v.project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid AND public.pke_has_project_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,'vessel.view')));
 DROP POLICY IF EXISTS pke_scope_select ON public.vessel_tracking_positions;
 CREATE POLICY pke_scope_select ON public.vessel_tracking_positions FOR SELECT TO app_runtime_secure
 USING (public.pke_p16_project_vessel_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,vessel_id,'vessel.position.view'));

 FOREACH t IN ARRAY ARRAY['vessel_certificates','vessel_identifiers','vessel_name_history','vessel_port_calls','vessel_tracking_positions'] LOOP
   EXECUTE format('DROP POLICY IF EXISTS p16_admin_select ON public.%I',t);
   EXECUTE format('CREATE POLICY p16_admin_select ON public.%I FOR SELECT TO app_runtime_secure USING (public.pke_is_platform_admin())',t);
 END LOOP;

 FOREACH t IN ARRAY ARRAY['ports','port_terminals','port_berths','port_channels','port_anchorages','port_loading_services',
   'port_equipment','port_operating_limits','warehouses','warehouse_zones','warehouse_bins','warehouse_equipment','pks_port_routes'] LOOP
   EXECUTE format('DROP POLICY IF EXISTS p16_admin_insert ON public.%I',t);
   EXECUTE format('DROP POLICY IF EXISTS p16_admin_update ON public.%I',t);
   EXECUTE format('DROP POLICY IF EXISTS p16_admin_delete ON public.%I',t);
   EXECUTE format('CREATE POLICY p16_admin_insert ON public.%I FOR INSERT TO app_runtime_secure WITH CHECK (public.pke_is_platform_admin())',t);
   EXECUTE format('CREATE POLICY p16_admin_update ON public.%I FOR UPDATE TO app_runtime_secure USING (public.pke_is_platform_admin()) WITH CHECK (public.pke_is_platform_admin())',t);
   EXECUTE format('CREATE POLICY p16_admin_delete ON public.%I FOR DELETE TO app_runtime_secure USING (public.pke_is_platform_admin())',t);
 END LOOP;
END
$policies$;
