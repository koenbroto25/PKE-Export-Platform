-- Migration 090: bind P16 master reads to the selected Project, not any Project membership.
CREATE SCHEMA IF NOT EXISTS p2b_backup_089_20261121;
CREATE TABLE p2b_backup_089_20261121.p16_resource_read_policies_pre_090 AS
 SELECT * FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('ports','warehouses','vessels')
   AND policyname='p16_resource_project_read';

DROP POLICY IF EXISTS p16_resource_project_read ON public.ports;
DROP POLICY IF EXISTS p16_resource_project_read ON public.warehouses;
DROP POLICY IF EXISTS p16_resource_project_read ON public.vessels;

CREATE POLICY p16_resource_project_read ON public.ports
 FOR SELECT TO app_runtime_secure
 USING (NULLIF(current_setting('app.current_project_id',true),'') IS NOT NULL
        AND public.pke_has_project_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,'port.view'));

CREATE POLICY p16_resource_project_read ON public.warehouses
 FOR SELECT TO app_runtime_secure
 USING (NULLIF(current_setting('app.current_project_id',true),'') IS NOT NULL
        AND public.pke_has_project_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,'warehouse.view'));

CREATE POLICY p16_resource_project_read ON public.vessels
 FOR SELECT TO app_runtime_secure
 USING (NULLIF(current_setting('app.current_project_id',true),'') IS NOT NULL
        AND public.pke_has_project_permission(NULLIF(current_setting('app.current_project_id',true),'')::uuid,'vessel.view'));
