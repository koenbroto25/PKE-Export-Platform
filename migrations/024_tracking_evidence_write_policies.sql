-- PKE Migration 024: grant project-permission based write policies for tracking evidence.
-- The event/evidence tables are project-owned indirectly through truck_trips.

BEGIN;

CREATE OR REPLACE FUNCTION public.pke_has_truck_trip_permission(p_trip_id uuid, p_permission_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT public.pke_is_platform_admin() OR EXISTS (
    SELECT 1
      FROM public.truck_trips tt
     WHERE tt.id = p_trip_id
       AND public.pke_has_project_permission(tt.project_id, p_permission_code)
  )
$function$;

REVOKE ALL ON FUNCTION public.pke_has_truck_trip_permission(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_has_truck_trip_permission(uuid,text) TO app_runtime_secure;

CREATE POLICY pke_tracking_events_insert
  ON public.tracking_events FOR INSERT TO app_runtime_secure
  WITH CHECK (
    public.pke_has_truck_trip_permission(truck_trip_id, 'logistics.create')
  );

CREATE POLICY pke_tracking_events_update
  ON public.tracking_events FOR UPDATE TO app_runtime_secure
  USING (
    public.pke_has_tracking_event_permission(id, 'logistics.update')
  )
  WITH CHECK (
    public.pke_has_truck_trip_permission(truck_trip_id, 'logistics.update')
  );

CREATE POLICY pke_tracking_events_delete
  ON public.tracking_events FOR DELETE TO app_runtime_secure
  USING (public.pke_has_tracking_event_permission(id, 'logistics.delete'));

CREATE POLICY pke_tracking_evidence_insert
  ON public.tracking_evidence FOR INSERT TO app_runtime_secure
  WITH CHECK (
    public.pke_has_tracking_event_permission(tracking_event_id, 'logistics.create')
  );

CREATE POLICY pke_tracking_evidence_update
  ON public.tracking_evidence FOR UPDATE TO app_runtime_secure
  USING (public.pke_has_tracking_event_permission(tracking_event_id, 'logistics.update'))
  WITH CHECK (
    public.pke_has_tracking_event_permission(tracking_event_id, 'logistics.update')
  );

CREATE POLICY pke_tracking_evidence_delete
  ON public.tracking_evidence FOR DELETE TO app_runtime_secure
  USING (public.pke_has_tracking_event_permission(tracking_event_id, 'logistics.delete'));

COMMIT;
