-- Migration 101: Project-scoped, non-canonical PKE logistics simulation graph.
-- The simulation stores evidence-backed public facts separately from canonical master data.
BEGIN;
CREATE TABLE public.p17b_logistics_simulation_scenarios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 scenario_code text NOT NULL,
 scenario_name text NOT NULL,
 product_code text NOT NULL DEFAULT 'PKE',
 graph jsonb NOT NULL CHECK(jsonb_typeof(graph)='object'),
 source_evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(source_evidence)='array'),
 assumptions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(assumptions)='object'),
 simulation_only boolean NOT NULL DEFAULT true CHECK(simulation_only IS TRUE),
 scenario_status text NOT NULL DEFAULT 'simulation' CHECK(scenario_status IN ('simulation','draft','archived')),
 created_by uuid REFERENCES public.users(id),
 updated_by uuid REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT p17b_logistics_simulation_code_uq UNIQUE(project_id,scenario_code)
);
CREATE INDEX p17b_logistics_simulation_project_idx
 ON public.p17b_logistics_simulation_scenarios(project_id,scenario_status,updated_at DESC);
ALTER TABLE public.p17b_logistics_simulation_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY p17b_logistics_simulation_select ON public.p17b_logistics_simulation_scenarios
 FOR SELECT TO app_runtime_secure
 USING(public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pke.logistics.master.view'));
CREATE POLICY p17b_logistics_simulation_insert ON public.p17b_logistics_simulation_scenarios
 FOR INSERT TO app_runtime_secure
 WITH CHECK(
  (public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pke.logistics.master.change_request.manage'))
  AND created_by=NULLIF(current_setting('app.current_user_id',true),'')::uuid
  AND simulation_only IS TRUE
 );
CREATE POLICY p17b_logistics_simulation_update ON public.p17b_logistics_simulation_scenarios
 FOR UPDATE TO app_runtime_secure
 USING(public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pke.logistics.master.change_request.manage'))
 WITH CHECK(public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'pke.logistics.master.change_request.manage'));
GRANT SELECT,INSERT,UPDATE ON public.p17b_logistics_simulation_scenarios TO app_runtime_secure;

CREATE OR REPLACE FUNCTION public.pke_validate_p17b_logistics_simulation_graph()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_node jsonb;
 v_edge jsonb;
 v_node_ids text[];
 v_edge_count integer;
 v_required text[]:=ARRAY['pks_site','road_route','port','terminal','loading_service','warehouse'];
 v_seen text[]:=ARRAY[]::text[];
 v_type text;
BEGIN
 IF NEW.simulation_only IS NOT TRUE THEN RAISE EXCEPTION 'P17-B simulation must remain simulation_only' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(NEW.graph->'nodes')<>'array' OR jsonb_typeof(NEW.graph->'edges')<>'array' THEN
  RAISE EXCEPTION 'Simulation graph requires nodes and edges arrays' USING ERRCODE='23514';
 END IF;
 IF jsonb_array_length(NEW.graph->'nodes')<6 OR jsonb_array_length(NEW.graph->'edges')<5 THEN
  RAISE EXCEPTION 'Simulation graph requires the complete PKS-to-warehouse chain' USING ERRCODE='23514';
 END IF;
 FOR v_node IN SELECT value FROM jsonb_array_elements(NEW.graph->'nodes') LOOP
  IF COALESCE(v_node->>'id','')='' OR COALESCE(v_node->>'type','')='' OR COALESCE(v_node->>'name','')='' THEN
   RAISE EXCEPTION 'Every simulation node requires id, type and name' USING ERRCODE='23514';
  END IF;
  v_type:=v_node->>'type';
  IF NOT(v_type=ANY(ARRAY['pks_site','road_route','port','terminal','loading_service','warehouse'])) THEN
   RAISE EXCEPTION 'Unsupported simulation node type' USING ERRCODE='23514';
  END IF;
  IF COALESCE((v_node->>'simulation_only')::boolean,false) IS NOT TRUE
     OR COALESCE(v_node->>'verification_status','')<>'unverified' THEN
   RAISE EXCEPTION 'Every simulation node must remain simulation_only and unverified' USING ERRCODE='23514';
  END IF;
  IF v_node->>'id'=ANY(v_node_ids) THEN RAISE EXCEPTION 'Duplicate simulation node id' USING ERRCODE='23514'; END IF;
  v_node_ids:=array_append(v_node_ids,v_node->>'id');
  IF NOT(v_type=ANY(v_seen)) THEN v_seen:=array_append(v_seen,v_type); END IF;
 END LOOP;
 IF NOT(v_required <@ v_seen) THEN RAISE EXCEPTION 'Simulation graph is missing a required logistics node type' USING ERRCODE='23514'; END IF;
 v_edge_count:=0;
 FOR v_edge IN SELECT value FROM jsonb_array_elements(NEW.graph->'edges') LOOP
  IF NOT(COALESCE(v_edge->>'from_id','')=ANY(v_node_ids))
     OR NOT(COALESCE(v_edge->>'to_id','')=ANY(v_node_ids))
     OR COALESCE(v_edge->>'relationship_type','') NOT IN
       ('pks_to_road_route','road_route_to_port','port_has_terminal','terminal_has_loading_service','terminal_has_warehouse') THEN
   RAISE EXCEPTION 'Simulation edge endpoints or relationship type are invalid' USING ERRCODE='23514';
  END IF;
  v_edge_count:=v_edge_count+1;
 END LOOP;
 IF v_edge_count<5 THEN RAISE EXCEPTION 'Simulation graph must connect every logistics stage' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.scenario_code IS DISTINCT FROM OLD.scenario_code
    OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
   RAISE EXCEPTION 'Simulation identity and Project scope are immutable' USING ERRCODE='42501';
  END IF;
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_validate_p17b_logistics_simulation_graph() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_validate_p17b_logistics_simulation_graph() TO app_runtime_secure;
CREATE TRIGGER p17b_logistics_simulation_graph_guard
 BEFORE INSERT OR UPDATE ON public.p17b_logistics_simulation_scenarios
 FOR EACH ROW EXECUTE FUNCTION public.pke_validate_p17b_logistics_simulation_graph();

CREATE OR REPLACE FUNCTION public.pke_audit_p17b_logistics_simulation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_user uuid;
BEGIN
 v_user:=COALESCE(NULLIF(current_setting('app.current_user_id',true),'')::uuid,CASE WHEN TG_OP='INSERT' THEN NEW.created_by ELSE NEW.updated_by END);
 INSERT INTO public.audit_events(actor_user_id,actor_type,actor_role,permission_code,action,target_type,target_id,project_id,
  source,reason,before_snapshot,after_snapshot,metadata,outcome)
 VALUES(v_user,'user',NULLIF(current_setting('app.current_role',true),''),'pke.logistics.master.change_request.manage',
  CASE WHEN TG_OP='INSERT' THEN 'p17b.logistics_simulation.created' ELSE 'p17b.logistics_simulation.updated' END,
  'p17b_logistics_simulation_scenarios',NEW.id,NEW.project_id,'p17b_logistics_simulation',
  'Project-scoped non-canonical logistics simulation',
  CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,to_jsonb(NEW),
  jsonb_build_object('scenario_code',NEW.scenario_code,'simulation_only',NEW.simulation_only,'scenario_status',NEW.scenario_status),'success');
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_audit_p17b_logistics_simulation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_audit_p17b_logistics_simulation() TO app_runtime_secure;
CREATE TRIGGER p17b_logistics_simulation_audit
 AFTER INSERT OR UPDATE ON public.p17b_logistics_simulation_scenarios
 FOR EACH ROW EXECUTE FUNCTION public.pke_audit_p17b_logistics_simulation();
COMMIT;