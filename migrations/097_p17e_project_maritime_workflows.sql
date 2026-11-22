-- P17-E: Project-scoped voyage, nomination and port-call lifecycle controls.
-- Uses P16 maritime master entities; does not recreate port/vessel/shipment tables.
ALTER TABLE public.voyages
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS voyages_project_code_uq ON public.voyages(project_id,voyage_code) WHERE voyage_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS voyages_project_idempotency_uq ON public.voyages(project_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS voyages_project_id_uq ON public.voyages(project_id,id);

ALTER TABLE public.shipments ADD CONSTRAINT shipments_project_id_uq UNIQUE(project_id,id);

ALTER TABLE public.vessel_nominations
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS decision_note text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS vessel_nominations_project_idempotency_uq ON public.vessel_nominations(project_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE public.vessel_nominations
  ADD CONSTRAINT vessel_nominations_project_shipment_fk FOREIGN KEY(project_id,shipment_id) REFERENCES public.shipments(project_id,id),
  ADD CONSTRAINT vessel_nominations_project_voyage_fk FOREIGN KEY(project_id,voyage_id) REFERENCES public.voyages(project_id,id),
  ADD CONSTRAINT vessel_nominations_independent_review_ck CHECK (
    (nomination_status IN ('draft','submitted','changed','withdrawn') AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR
    (nomination_status IN ('identity_verified','port_screened','documents_checked','approved_for_internal_planning','rejected')
      AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by <> nominated_by)
  );

ALTER TABLE public.vessel_port_calls
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id),
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS idempotency_key text;
UPDATE public.vessel_port_calls c SET project_id=v.project_id
  FROM public.voyages v WHERE c.voyage_id=v.id AND c.project_id IS NULL;
ALTER TABLE public.vessel_port_calls ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.vessel_port_calls ALTER COLUMN voyage_id SET NOT NULL;
ALTER TABLE public.vessel_port_calls
  ADD CONSTRAINT vessel_port_calls_project_voyage_fk FOREIGN KEY(project_id,voyage_id) REFERENCES public.voyages(project_id,id),
  ADD CONSTRAINT vessel_port_calls_actual_event_ck CHECK (
    (event_type IN ('planned_arrival','eta_update') AND status IN ('planned','predicted','unknown','cancelled'))
    OR (event_type IN ('arrived','berthed','departed') AND status='actual' AND actual_at IS NOT NULL)
    OR (event_type='cancelled' AND status='cancelled')
  );
CREATE UNIQUE INDEX IF NOT EXISTS vessel_port_calls_project_idempotency_uq ON public.vessel_port_calls(project_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS vessel_port_calls_project_voyage_time_idx ON public.vessel_port_calls(project_id,voyage_id,COALESCE(actual_at,predicted_at) DESC);

CREATE TABLE public.maritime_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('voyage','vessel_nomination','vessel_port_call')),
  entity_id uuid NOT NULL,
  event_code text NOT NULL CHECK (event_code ~ '^[a-z][a-z0-9_]{1,95}$'),
  from_status text,
  to_status text,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  idempotency_key text,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_payload)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,entity_type,idempotency_key)
);
CREATE INDEX maritime_workflow_events_project_entity_idx ON public.maritime_workflow_events(project_id,entity_type,entity_id,created_at DESC);

INSERT INTO public.permissions(name,code,description,is_active)
VALUES
 ('Create Project voyages','voyage.create','Create Project-scoped voyage records',true),
 ('Update Project voyages','voyage.update','Update Project-scoped voyage records',true),
 ('Review vessel nominations','vessel.nomination.review','Independently review and decide vessel nominations',true),
 ('Manage planned vessel port calls','vessel.port_call.manage','Create and amend planned/ETA vessel port-call milestones',true),
 ('Confirm actual vessel port calls','vessel.port_call.confirm','Independently confirm actual vessel port-call milestones',true)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_active=true,updated_at=now();

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
VALUES
 ('pm','voyage.create'),('pm','voyage.update'),('pm','vessel.nomination.review'),
 ('pm','vessel.port_call.manage'),
 ('shipping_agent','voyage.create'),('shipping_agent','vessel.nominate'),('shipping_agent','vessel.port_call.manage'),
 ('master_of_loading','vessel.port_call.confirm'),
 ('terminal_representative','vessel.port_call.confirm')
ON CONFLICT(role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,p.id
FROM public.project_roles pr
JOIN public.permissions p ON p.code IN ('voyage.create','voyage.update','vessel.nomination.review','vessel.port_call.manage','vessel.port_call.confirm','vessel.nominate')
WHERE pr.is_active=true
  AND (
    (pr.role_code='pm' AND p.code IN ('voyage.create','voyage.update','vessel.nomination.review','vessel.port_call.manage'))
    OR (pr.role_code='shipping_agent' AND p.code IN ('voyage.create','vessel.nominate','vessel.port_call.manage'))
    OR (pr.role_code IN ('master_of_loading','terminal_representative') AND p.code='vessel.port_call.confirm')
  )
ON CONFLICT(project_role_id,permission_id) DO NOTHING;

ALTER TABLE public.maritime_workflow_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY maritime_workflow_events_project_read ON public.maritime_workflow_events FOR SELECT TO app_runtime_secure
USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'voyage.view')
    OR public.pke_has_project_permission(project_id,'vessel.view')
    OR public.pke_has_project_permission(project_id,'shipping.view')));
CREATE POLICY maritime_workflow_events_project_insert ON public.maritime_workflow_events FOR INSERT TO app_runtime_secure
WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'voyage.create')
    OR public.pke_has_project_permission(project_id,'voyage.update')
    OR public.pke_has_project_permission(project_id,'vessel.nominate')
    OR public.pke_has_project_permission(project_id,'vessel.nomination.review')
    OR public.pke_has_project_permission(project_id,'vessel.port_call.manage')
    OR public.pke_has_project_permission(project_id,'vessel.port_call.confirm')));

DROP POLICY IF EXISTS pke_voyages_insert ON public.voyages;
DROP POLICY IF EXISTS pke_voyages_select ON public.voyages;
CREATE POLICY pke_voyages_select ON public.voyages FOR SELECT TO app_runtime_secure
USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'shipping.view') OR public.pke_has_project_permission(project_id,'voyage.view')));
DROP POLICY IF EXISTS pke_voyages_delete ON public.voyages;
CREATE POLICY pke_voyages_delete ON public.voyages FOR DELETE TO app_runtime_secure
USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND public.pke_has_project_permission(project_id,'shipping.delete'));
CREATE POLICY pke_voyages_insert ON public.voyages FOR INSERT TO app_runtime_secure
WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'voyage.create') OR public.pke_has_project_permission(project_id,'shipping.create')));
DROP POLICY IF EXISTS pke_voyages_update ON public.voyages;
CREATE POLICY pke_voyages_update ON public.voyages FOR UPDATE TO app_runtime_secure
USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'voyage.update') OR public.pke_has_project_permission(project_id,'shipping.update')))
WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'voyage.update') OR public.pke_has_project_permission(project_id,'shipping.update')));

DROP POLICY IF EXISTS pke_scope_select ON public.vessel_nominations;
CREATE POLICY pke_scope_select ON public.vessel_nominations FOR SELECT TO app_runtime_secure
USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'vessel.view') OR public.pke_has_project_permission(project_id,'vessel.nominate') OR public.pke_has_project_permission(project_id,'vessel.nomination.review')));
DROP POLICY IF EXISTS pke_scope_insert ON public.vessel_nominations;
CREATE POLICY pke_scope_insert ON public.vessel_nominations FOR INSERT TO app_runtime_secure
WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND public.pke_has_project_permission(project_id,'vessel.nominate'));
DROP POLICY IF EXISTS pke_scope_update ON public.vessel_nominations;
CREATE POLICY pke_scope_update ON public.vessel_nominations FOR UPDATE TO app_runtime_secure
USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'vessel.nominate') OR public.pke_has_project_permission(project_id,'vessel.nomination.review')))
WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'vessel.nominate') OR public.pke_has_project_permission(project_id,'vessel.nomination.review')));

DROP POLICY IF EXISTS pke_scope_select ON public.vessel_port_calls;
CREATE POLICY pke_scope_select ON public.vessel_port_calls FOR SELECT TO app_runtime_secure
USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'vessel.view') OR public.pke_has_project_permission(project_id,'shipping.view')));
DROP POLICY IF EXISTS pke_scope_insert ON public.vessel_port_calls;
CREATE POLICY pke_scope_insert ON public.vessel_port_calls FOR INSERT TO app_runtime_secure
WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'vessel.port_call.manage') OR public.pke_has_project_permission(project_id,'vessel.port_call.confirm')));
DROP POLICY IF EXISTS pke_scope_update ON public.vessel_port_calls;
CREATE POLICY pke_scope_update ON public.vessel_port_calls FOR UPDATE TO app_runtime_secure
USING (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'vessel.port_call.manage') OR public.pke_has_project_permission(project_id,'vessel.port_call.confirm')))
WITH CHECK (project_id=NULLIF(current_setting('app.current_project_id',true),'')::uuid
  AND (public.pke_has_project_permission(project_id,'vessel.port_call.manage') OR public.pke_has_project_permission(project_id,'vessel.port_call.confirm')));

CREATE OR REPLACE FUNCTION public.pke_guard_vessel_nomination_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.shipment_id IS DISTINCT FROM OLD.shipment_id
     OR NEW.vessel_id IS DISTINCT FROM OLD.vessel_id OR NEW.nominated_by IS DISTINCT FROM OLD.nominated_by THEN
    RAISE EXCEPTION 'Nomination identity and Project scope are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.nomination_status IS DISTINCT FROM OLD.nomination_status THEN
    IF NEW.nomination_status IN ('identity_verified','port_screened','documents_checked','approved_for_internal_planning','rejected') THEN
      IF NOT public.pke_has_project_permission(NEW.project_id,'vessel.nomination.review')
         OR NEW.reviewed_by IS DISTINCT FROM public.pke_current_user_id()
         OR NEW.reviewed_by=NEW.nominated_by THEN
        RAISE EXCEPTION 'Independent nomination reviewer required' USING ERRCODE='42501';
      END IF;
      IF NOT (
        (OLD.nomination_status='submitted' AND NEW.nomination_status IN ('identity_verified','rejected'))
        OR (OLD.nomination_status='identity_verified' AND NEW.nomination_status IN ('port_screened','rejected'))
        OR (OLD.nomination_status='port_screened' AND NEW.nomination_status IN ('documents_checked','rejected'))
        OR (OLD.nomination_status='documents_checked' AND NEW.nomination_status IN ('approved_for_internal_planning','rejected'))
      ) THEN
        RAISE EXCEPTION 'Invalid vessel nomination transition' USING ERRCODE='23514';
      END IF;
    ELSIF NEW.nomination_status IN ('changed','withdrawn') THEN
      IF OLD.nomination_status NOT IN ('draft','submitted','identity_verified','port_screened','documents_checked','approved_for_internal_planning') THEN
        RAISE EXCEPTION 'Nomination cannot be changed or withdrawn from its current state' USING ERRCODE='23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported nomination transition' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_vessel_nomination_transition() FROM PUBLIC;
CREATE TRIGGER pke_vessel_nomination_transition_guard
BEFORE UPDATE ON public.vessel_nominations
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_vessel_nomination_transition();

CREATE OR REPLACE FUNCTION public.pke_guard_vessel_port_call_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE v record;
BEGIN
  SELECT id,project_id,vessel_id,origin_port_id,destination_port_id,port_id
    INTO v FROM public.voyages WHERE id=NEW.voyage_id AND project_id=NEW.project_id;
  IF NOT FOUND OR v.vessel_id IS DISTINCT FROM NEW.vessel_id
     OR NOT (NEW.port_id = ANY(ARRAY_REMOVE(ARRAY[v.origin_port_id,v.destination_port_id,v.port_id]::uuid[],NULL))) THEN
    RAISE EXCEPTION 'Port call must match the same-Project voyage vessel and route' USING ERRCODE='23514';
  END IF;
  IF NEW.event_type IN ('arrived','berthed','departed') THEN
    IF NOT public.pke_has_project_permission(NEW.project_id,'vessel.port_call.confirm')
       OR NEW.status<>'actual' OR NEW.actual_at IS NULL THEN
      RAISE EXCEPTION 'Actual port-call milestones require independent confirmation' USING ERRCODE='42501';
    END IF;
  ELSIF NOT public.pke_has_project_permission(NEW.project_id,'vessel.port_call.manage')
        AND NOT public.pke_has_project_permission(NEW.project_id,'vessel.port_call.confirm') THEN
    RAISE EXCEPTION 'Port-call management permission required' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.pke_guard_vessel_port_call_write() FROM PUBLIC;
CREATE TRIGGER pke_vessel_port_call_write_guard
BEFORE INSERT OR UPDATE ON public.vessel_port_calls
FOR EACH ROW EXECUTE FUNCTION public.pke_guard_vessel_port_call_write();

REVOKE ALL ON public.maritime_workflow_events FROM PUBLIC;
GRANT SELECT,INSERT ON public.maritime_workflow_events TO app_runtime_secure;
