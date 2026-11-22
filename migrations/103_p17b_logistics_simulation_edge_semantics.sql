-- Migration 103: enforce typed and complete edge topology in P17-B simulation graphs.
BEGIN;
CREATE OR REPLACE FUNCTION public.pke_validate_p17b_logistics_simulation_edges()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_edge jsonb;
 v_from_type text;
 v_to_type text;
 v_expected_from text;
 v_expected_to text;
 v_rel text;
 v_required text[]:=ARRAY['pks_to_road_route','road_route_to_port','port_has_terminal','terminal_has_loading_service','terminal_has_warehouse'];
 v_seen text[]:=ARRAY[]::text[];
 v_edge_ids text[]:=ARRAY[]::text[];
BEGIN
 FOR v_edge IN SELECT value FROM jsonb_array_elements(NEW.graph->'edges') LOOP
  v_rel:=v_edge->>'relationship_type';
  IF COALESCE(v_edge->>'id','')='' OR v_rel IS NULL THEN
   RAISE EXCEPTION 'Every logistics edge requires id and relationship_type' USING ERRCODE='23514';
  END IF;
  IF v_edge->>'id'=ANY(v_edge_ids) THEN RAISE EXCEPTION 'Duplicate logistics edge id' USING ERRCODE='23514'; END IF;
  v_edge_ids:=array_append(v_edge_ids,v_edge->>'id');
  SELECT n->>'type' INTO v_from_type
   FROM jsonb_array_elements(NEW.graph->'nodes') n WHERE n->>'id'=v_edge->>'from_id';
  SELECT n->>'type' INTO v_to_type
   FROM jsonb_array_elements(NEW.graph->'nodes') n WHERE n->>'id'=v_edge->>'to_id';
  CASE v_rel
   WHEN 'pks_to_road_route' THEN v_expected_from:='pks_site';v_expected_to:='road_route';
   WHEN 'road_route_to_port' THEN v_expected_from:='road_route';v_expected_to:='port';
   WHEN 'port_has_terminal' THEN v_expected_from:='port';v_expected_to:='terminal';
   WHEN 'terminal_has_loading_service' THEN v_expected_from:='terminal';v_expected_to:='loading_service';
   WHEN 'terminal_has_warehouse' THEN v_expected_from:='terminal';v_expected_to:='warehouse';
   ELSE RAISE EXCEPTION 'Unsupported logistics relationship type' USING ERRCODE='23514';
  END CASE;
  IF v_from_type IS DISTINCT FROM v_expected_from OR v_to_type IS DISTINCT FROM v_expected_to THEN
   RAISE EXCEPTION 'Logistics relationship endpoint types do not match the declared edge' USING ERRCODE='23514';
  END IF;
  IF NOT(v_rel=ANY(v_seen)) THEN v_seen:=array_append(v_seen,v_rel); END IF;
 END LOOP;
 IF NOT(v_required <@ v_seen) OR cardinality(v_seen)<>5 OR cardinality(v_edge_ids)<>5 THEN
  RAISE EXCEPTION 'Simulation graph requires exactly the five typed logistics relationships' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_validate_p17b_logistics_simulation_edges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_validate_p17b_logistics_simulation_edges() TO app_runtime_secure;
CREATE TRIGGER p17b_logistics_simulation_10_edge_semantics
 BEFORE INSERT OR UPDATE ON public.p17b_logistics_simulation_scenarios
 FOR EACH ROW EXECUTE FUNCTION public.pke_validate_p17b_logistics_simulation_edges();
COMMIT;