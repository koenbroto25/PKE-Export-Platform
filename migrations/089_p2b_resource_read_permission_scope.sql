-- Migration 089: align global port, warehouse and vessel reads with the exact Project permission.
-- Keep Platform Admin global read via p16_admin_select; replace broad membership-only policies.
CREATE SCHEMA IF NOT EXISTS p2b_backup_088_20261121;
CREATE TABLE p2b_backup_088_20261121.p16_resource_read_policies_pre_089 AS
 SELECT * FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('ports','warehouses','vessels')
   AND policyname IN ('pke_ports_member_read','pke_warehouses_member_read','pke_vessels_member_read','p16_resource_project_read');

DROP POLICY IF EXISTS pke_ports_member_read ON public.ports;
DROP POLICY IF EXISTS pke_warehouses_member_read ON public.warehouses;
DROP POLICY IF EXISTS pke_vessels_member_read ON public.vessels;
DROP POLICY IF EXISTS p16_resource_project_read ON public.ports;
DROP POLICY IF EXISTS p16_resource_project_read ON public.warehouses;
DROP POLICY IF EXISTS p16_resource_project_read ON public.vessels;

CREATE POLICY p16_resource_project_read ON public.ports
 FOR SELECT TO app_runtime_secure
 USING (public.pke_has_any_project_permission('port.view'));

CREATE POLICY p16_resource_project_read ON public.warehouses
 FOR SELECT TO app_runtime_secure
 USING (public.pke_has_any_project_permission('warehouse.view'));

CREATE POLICY p16_resource_project_read ON public.vessels
 FOR SELECT TO app_runtime_secure
 USING (public.pke_has_any_project_permission('vessel.view'));
