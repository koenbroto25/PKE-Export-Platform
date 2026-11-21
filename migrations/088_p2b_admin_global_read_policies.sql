-- Migration 088: allow Platform Admin to read global P16 master data and review queues.
CREATE SCHEMA IF NOT EXISTS p2b_backup_087_20261121;
CREATE TABLE p2b_backup_087_20261121.p16_admin_select_policies_pre_088 AS
 SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN ('ports','port_terminals','port_berths','port_channels','port_anchorages','port_loading_services','port_equipment','port_operating_limits','warehouses','warehouse_zones','warehouse_bins','warehouse_equipment','pks_port_routes','port_depth_observations','port_tide_observations','vessel_port_assessments','vessels');
DO $policies$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['ports','port_terminals','port_berths','port_channels','port_anchorages','port_loading_services','port_equipment','port_operating_limits','warehouses','warehouse_zones','warehouse_bins','warehouse_equipment','pks_port_routes','port_depth_observations','port_tide_observations','vessel_port_assessments','vessels'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS p16_admin_select ON public.%I',t);
  EXECUTE format('CREATE POLICY p16_admin_select ON public.%I FOR SELECT TO app_runtime_secure USING (public.pke_is_platform_admin())',t);
 END LOOP;
END
$policies$;
