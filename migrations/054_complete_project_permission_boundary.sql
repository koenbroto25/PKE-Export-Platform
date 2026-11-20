-- Migration 054: canonical Project permission allowlists and Platform Admin governance-only boundary.
BEGIN;
CREATE TABLE IF NOT EXISTS public.pke_project_role_policy(role_code text PRIMARY KEY,canonical_role_code text NOT NULL,template_version integer NOT NULL DEFAULT 1 CHECK(template_version>0),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.pke_project_role_permission_allowlist(role_code text NOT NULL REFERENCES public.pke_project_role_policy(role_code) ON DELETE CASCADE,permission_code text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(role_code,permission_code));
REVOKE ALL ON public.pke_project_role_policy FROM PUBLIC,app_runtime_secure;
REVOKE ALL ON public.pke_project_role_permission_allowlist FROM PUBLIC,app_runtime_secure;
INSERT INTO public.pke_project_role_policy(role_code,canonical_role_code,template_version) VALUES
 ('platform_admin','platform_admin',1),
 ('project_admin','project_admin',1),
 ('pm','pm',1),
 ('internal_auditor','internal_auditor',1),
 ('procurement','procurement',1),
 ('pks_site_manager','pks_site_manager',1),
 ('supplier','supplier',1),
 ('buyer','buyer',1),
 ('contract_manager','contract_manager',1),
 ('production_manager','production_manager',1),
 ('packing_supervisor','packing_supervisor',1),
 ('qc_officer','qc_officer',1),
 ('qa_manager','qa_manager',1),
 ('laboratory_officer','laboratory_officer',1),
 ('hse_officer','hse_officer',1),
 ('warehouse_manager','warehouse_manager',1),
 ('warehouse_officer','warehouse_officer',1),
 ('inventory_controller','inventory_controller',1),
 ('transport_manager','transport_manager',1),
 ('dispatcher','dispatcher',1),
 ('transporter','transporter',1),
 ('checker','checker',1),
 ('driver','driver',1),
 ('master_of_loading','master_of_loading',1),
 ('loading_supervisor','loading_supervisor',1),
 ('loading_operator','loading_operator',1),
 ('terminal_representative','terminal_representative',1),
 ('shipping_agent','shipping_agent',1),
 ('marine_surveyor','marine_surveyor',1),
 ('ship_master','ship_master',1),
 ('finance','finance',1),
 ('accounting','accounting',1),
 ('cashier','cashier',1),
 ('funder','funder',1),
 ('document_officer','document_officer',1),
 ('external_provider','external_provider',1),
 ('field_manager','field_manager',1),
 ('viewer','viewer',1),
 ('warehouse','warehouse_manager',1),
 ('loading_manager','master_of_loading',1)
ON CONFLICT(role_code) DO UPDATE SET canonical_role_code=EXCLUDED.canonical_role_code,template_version=EXCLUDED.template_version;
DELETE FROM public.pke_project_role_permission_allowlist;
INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code) VALUES
 ('project_admin','project.view'),
 ('project_admin','project.update'),
 ('project_admin','project.members.view'),
 ('project_admin','project.members.invite'),
 ('project_admin','project.members.manage'),
 ('project_admin','project.roles.manage'),
 ('project_admin','project.configuration.manage'),
 ('project_admin','project.change.view'),
 ('project_admin','project.change.create'),
 ('project_admin','project.change.update'),
 ('project_admin','audit.view'),
 ('project_admin','accounting.view'),
 ('project_admin','reports.view'),
 ('project_admin','report.view'),
 ('project_admin','documents.view'),
 ('project_admin','workflow.view'),
 ('project_admin','approvals.view'),
 ('project_admin','finance.view'),
 ('pm','project.view'),
 ('pm','project.update'),
 ('pm','project.members.view'),
 ('pm','project.members.invite'),
 ('pm','project.members.manage'),
 ('pm','project.roles.manage'),
 ('pm','project.configuration.manage'),
 ('pm','contract.view'),
 ('pm','manage_contract_programs'),
 ('pm','shipping.view'),
 ('pm','shipment.view'),
 ('pm','finance.view'),
 ('pm','inventory.view'),
 ('pm','operations.view'),
 ('pm','logistics.view'),
 ('pm','warehouse.view'),
 ('pm','documents.view'),
 ('pm','workflow.view'),
 ('pm','approvals.view'),
 ('pm','reports.view'),
 ('pm','audit.view'),
 ('pm','project.tasks.view'),
 ('pm','project.tasks.create'),
 ('pm','project.tasks.assign'),
 ('pm','project.tasks.update'),
 ('pm','project.tasks.resolve'),
 ('pm','project.tasks.escalate'),
 ('internal_auditor','project.view'),
 ('internal_auditor','audit.view'),
 ('internal_auditor','operations.view'),
 ('internal_auditor','inventory.view'),
 ('internal_auditor','warehouse.view'),
 ('internal_auditor','logistics.view'),
 ('internal_auditor','shipping.view'),
 ('internal_auditor','shipment.view'),
 ('internal_auditor','finance.view'),
 ('internal_auditor','accounting.view'),
 ('internal_auditor','documents.view'),
 ('internal_auditor','workflow.view'),
 ('internal_auditor','reports.view'),
 ('procurement','supplier.view'),
 ('procurement','supplier.manage'),
 ('procurement','buyer.requirement.view'),
 ('procurement','buyer.requirement.manage'),
 ('procurement','contract.view'),
 ('procurement','product.view'),
 ('procurement','facility.view'),
 ('procurement','facility.capacity.view'),
 ('pks_site_manager','facility.view'),
 ('pks_site_manager','facility.update'),
 ('pks_site_manager','facility.capacity.view'),
 ('pks_site_manager','facility.capacity.manage'),
 ('pks_site_manager','facility.product.view'),
 ('pks_site_manager','facility.product.manage'),
 ('pks_site_manager','product.view'),
 ('supplier','supplier.view'),
 ('supplier','product.view'),
 ('supplier','documents.view'),
 ('supplier','shipment.view'),
 ('buyer','buyer.requirement.view'),
 ('buyer','buyer.shipment.view'),
 ('buyer','documents.view'),
 ('buyer','shipment.view'),
 ('contract_manager','contract.view'),
 ('contract_manager','manage_contract_programs'),
 ('contract_manager','buyer.requirement.view'),
 ('contract_manager','buyer.requirement.manage'),
 ('production_manager','operations.view'),
 ('production_manager','operations.create'),
 ('production_manager','operations.update'),
 ('production_manager','inventory.view'),
 ('production_manager','facility.view'),
 ('production_manager','facility.capacity.view'),
 ('production_manager','product.view'),
 ('packing_supervisor','operations.view'),
 ('packing_supervisor','operations.create'),
 ('packing_supervisor','operations.update'),
 ('packing_supervisor','record_packing'),
 ('packing_supervisor','inventory.view'),
 ('packing_supervisor','product.view'),
 ('qc_officer','quality.sample.create'),
 ('qc_officer','quality.result.create'),
 ('qc_officer','product.view'),
 ('qc_officer','inventory.view'),
 ('qa_manager','quality.result.review'),
 ('qa_manager','product.view'),
 ('qa_manager','inventory.view'),
 ('qa_manager','documents.view'),
 ('laboratory_officer','quality.result.create'),
 ('laboratory_officer','product.view'),
 ('laboratory_officer','documents.view'),
 ('hse_officer','operations.view'),
 ('hse_officer','operations.update'),
 ('hse_officer','compliance.view'),
 ('hse_officer','compliance.assess'),
 ('hse_officer','documents.view'),
 ('warehouse_manager','warehouse.view'),
 ('warehouse_manager','warehouse.create'),
 ('warehouse_manager','warehouse.update'),
 ('warehouse_manager','warehouse.receipt.create'),
 ('warehouse_manager','inventory.view'),
 ('warehouse_manager','inventory.update'),
 ('warehouse_manager','inventory.reserve'),
 ('warehouse_manager','inventory.hold'),
 ('warehouse_manager','inventory.reconcile'),
 ('warehouse_officer','warehouse.view'),
 ('warehouse_officer','warehouse.receipt.create'),
 ('warehouse_officer','inventory.view'),
 ('inventory_controller','inventory.view'),
 ('inventory_controller','inventory.create'),
 ('inventory_controller','inventory.update'),
 ('inventory_controller','inventory.reserve'),
 ('inventory_controller','inventory.hold'),
 ('inventory_controller','inventory.reconcile'),
 ('inventory_controller','warehouse.view'),
 ('transport_manager','logistics.view'),
 ('transport_manager','logistics.create'),
 ('transport_manager','logistics.update'),
 ('transport_manager','record_truck_trips'),
 ('transport_manager','shipping.view'),
 ('transport_manager','shipment.view'),
 ('dispatcher','logistics.view'),
 ('dispatcher','logistics.create'),
 ('dispatcher','logistics.update'),
 ('dispatcher','record_truck_trips'),
 ('transporter','logistics.view'),
 ('transporter','record_truck_trips'),
 ('transporter','verify_checkpoints'),
 ('checker','logistics.view'),
 ('checker','verify_checkpoints'),
 ('checker','operations.view'),
 ('driver','record_truck_trips'),
 ('driver','verify_checkpoints'),
 ('master_of_loading','shipping.view'),
 ('master_of_loading','shipping.update'),
 ('master_of_loading','shipment.view'),
 ('master_of_loading','loading.ticket.create'),
 ('master_of_loading','inventory.view'),
 ('master_of_loading','documents.view'),
 ('master_of_loading','workflow.view'),
 ('master_of_loading','voyage.view'),
 ('master_of_loading','vessel.view'),
 ('master_of_loading','port.view'),
 ('loading_supervisor','shipping.view'),
 ('loading_supervisor','shipping.update'),
 ('loading_supervisor','shipment.view'),
 ('loading_supervisor','loading.ticket.create'),
 ('loading_operator','shipping.view'),
 ('loading_operator','shipment.view'),
 ('loading_operator','loading.ticket.create'),
 ('terminal_representative','port.view'),
 ('terminal_representative','shipping.view'),
 ('terminal_representative','shipment.view'),
 ('terminal_representative','loading.ticket.create'),
 ('shipping_agent','shipment.view'),
 ('shipping_agent','shipping.view'),
 ('shipping_agent','shipping.create'),
 ('shipping_agent','vessel.view'),
 ('shipping_agent','voyage.view'),
 ('shipping_agent','documents.view'),
 ('marine_surveyor','shipment.view'),
 ('marine_surveyor','vessel.view'),
 ('marine_surveyor','shipping.view'),
 ('marine_surveyor','documents.view'),
 ('ship_master','vessel.view'),
 ('ship_master','voyage.view'),
 ('ship_master','shipment.view'),
 ('ship_master','documents.view'),
 ('finance','finance.view'),
 ('finance','finance.create'),
 ('finance','finance.update'),
 ('finance','finance.delete'),
 ('finance','reports.view'),
 ('finance','reports.create'),
 ('finance','report.view'),
 ('finance','view_financial'),
 ('finance','view_rab'),
 ('finance','manage_rab'),
 ('accounting','accounting.view'),
 ('accounting','accounting.create'),
 ('accounting','reports.view'),
 ('accounting','report.view'),
 ('accounting','view_financial'),
 ('accounting','view_rab'),
 ('cashier','payment.view'),
 ('cashier','finance.view'),
 ('cashier','reports.view'),
 ('document_officer','project.view'),
 ('document_officer','document.view'),
 ('document_officer','document.download'),
 ('document_officer','documents.view'),
 ('document_officer','documents.create'),
 ('document_officer','documents.update'),
 ('document_officer','documents.upload'),
 ('document_officer','documents.verify'),
 ('document_officer','documents.manage'),
 ('external_provider','project.view'),
 ('external_provider','document.view'),
 ('external_provider','document.download'),
 ('external_provider','documents.view'),
 ('external_provider','documents.create'),
 ('external_provider','documents.upload'),
 ('external_provider','view_published_docs'),
 ('field_manager','project.view'),
 ('field_manager','logistics.view'),
 ('field_manager','logistics.create'),
 ('field_manager','logistics.update'),
 ('field_manager','operations.view'),
 ('field_manager','operations.update'),
 ('field_manager','record_truck_trips'),
 ('field_manager','verify_checkpoints'),
 ('field_manager','shipment.event.create'),
 ('viewer','project.view'),
 ('viewer','documents.view'),
 ('viewer','inventory.view'),
 ('viewer','report.view'),
 ('viewer','reports.view'),
 ('viewer','shipment.view'),
 ('viewer','shipping.view'),
 ('warehouse','warehouse.view'),
 ('warehouse','warehouse.create'),
 ('warehouse','warehouse.update'),
 ('warehouse','warehouse.receipt.create'),
 ('warehouse','inventory.view'),
 ('warehouse','inventory.update'),
 ('warehouse','inventory.reserve'),
 ('warehouse','inventory.hold'),
 ('warehouse','inventory.reconcile'),
 ('loading_manager','shipping.view'),
 ('loading_manager','shipping.update'),
 ('loading_manager','shipment.view'),
 ('loading_manager','loading.ticket.create'),
 ('loading_manager','inventory.view'),
 ('loading_manager','documents.view'),
 ('loading_manager','workflow.view'),
 ('loading_manager','voyage.view'),
 ('loading_manager','vessel.view'),
 ('loading_manager','port.view');

CREATE OR REPLACE FUNCTION public.pke_guard_project_role_permission_allowlist() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $function$
DECLARE v_role_code text; v_permission_code text;
BEGIN
 SELECT pr.role_code,perm.code INTO v_role_code,v_permission_code FROM public.project_roles pr JOIN public.permissions perm ON perm.id=NEW.permission_id AND perm.is_active=true WHERE pr.id=NEW.project_role_id AND pr.project_id=NEW.project_id;
 IF v_role_code IS NULL OR v_permission_code IS NULL THEN RAISE EXCEPTION 'Project role permission must reference an active Project role and permission.' USING ERRCODE='23503'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pke_project_role_policy p WHERE p.role_code=v_role_code) THEN RAISE EXCEPTION 'Project role has no canonical permission policy: %',v_role_code USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.pke_project_role_permission_allowlist a WHERE a.role_code=v_role_code AND a.permission_code=v_permission_code) THEN RAISE EXCEPTION 'Permission % is not allowed for Project role %.',v_permission_code,v_role_code USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;$function$;
REVOKE ALL ON FUNCTION public.pke_guard_project_role_permission_allowlist() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_guard_project_role_permission_allowlist() TO app_runtime_secure;
DROP TRIGGER IF EXISTS pke_project_role_permission_allowlist_guard ON public.project_role_permissions;
CREATE TRIGGER pke_project_role_permission_allowlist_guard BEFORE INSERT OR UPDATE OF project_id,project_role_id,permission_id ON public.project_role_permissions FOR EACH ROW EXECUTE FUNCTION public.pke_guard_project_role_permission_allowlist();

CREATE OR REPLACE FUNCTION public.pke_guard_project_role_code_policy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $function$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.pke_project_role_policy p WHERE p.role_code=NEW.role_code) THEN RAISE EXCEPTION 'Project role code has no canonical permission policy: %',NEW.role_code USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_role_permissions prp JOIN public.permissions perm ON perm.id=prp.permission_id WHERE prp.project_role_id=NEW.id AND prp.project_id=NEW.project_id AND NOT EXISTS(SELECT 1 FROM public.pke_project_role_permission_allowlist a WHERE a.role_code=NEW.role_code AND a.permission_code=perm.code)) THEN RAISE EXCEPTION 'Role code change would leave non-canonical permission grants.' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;$function$;
REVOKE ALL ON FUNCTION public.pke_guard_project_role_code_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_guard_project_role_code_policy() TO app_runtime_secure;
DROP TRIGGER IF EXISTS pke_project_role_code_policy_guard ON public.project_roles;
CREATE TRIGGER pke_project_role_code_policy_guard BEFORE UPDATE OF role_code ON public.project_roles FOR EACH ROW WHEN(OLD.role_code IS DISTINCT FROM NEW.role_code) EXECUTE FUNCTION public.pke_guard_project_role_code_policy();

-- Normalize all existing grants to exact canonical role templates.
DELETE FROM public.project_role_permissions prp USING public.project_roles pr,public.permissions perm WHERE prp.project_role_id=pr.id AND prp.project_id=pr.project_id AND prp.permission_id=perm.id AND NOT EXISTS(SELECT 1 FROM public.pke_project_role_permission_allowlist a WHERE a.role_code=pr.role_code AND a.permission_code=perm.code);
INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id,granted_at)
SELECT pr.project_id,pr.id,perm.id,now() FROM public.project_roles pr JOIN public.pke_project_role_permission_allowlist a ON a.role_code=pr.role_code JOIN public.permissions perm ON perm.code=a.permission_code AND perm.is_active=true ON CONFLICT(project_role_id,permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pke_current_user_project_permissions(p_project_id uuid) RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public' AS $function$
SELECT COALESCE((SELECT array_agg(DISTINCT perm.code ORDER BY perm.code)
 FROM public.project_role_assignments a
 JOIN public.project_members pm ON pm.id=a.project_member_id AND pm.project_id=a.project_id AND pm.user_id=a.user_id
 JOIN public.project_roles pr ON pr.id=a.project_role_id AND pr.project_id=a.project_id AND pr.is_active=true
 JOIN public.project_role_permissions prp ON prp.project_role_id=pr.id AND prp.project_id=pr.project_id
 JOIN public.permissions perm ON perm.id=prp.permission_id AND perm.is_active=true
 JOIN public.projects project ON project.id=a.project_id AND project.is_active=true
 JOIN public.users u ON u.id=a.user_id AND u.is_active=true
 WHERE a.project_id=p_project_id AND a.user_id=public.pke_current_user_id() AND a.is_active=true AND a.revoked_at IS NULL AND (a.expires_at IS NULL OR a.expires_at>now())
 AND pm.is_active=true AND pm.deactivated_at IS NULL AND (pm.expires_at IS NULL OR pm.expires_at>now())
 AND NOT(pr.role_code='funder' AND (perm.code LIKE 'finance.%' OR perm.code LIKE 'accounting.%' OR perm.code LIKE 'reports.%' OR perm.code LIKE 'payment.%' OR perm.code IN('report.view','view_financial','view_rab')))
),ARRAY[]::text[])
$function$;
REVOKE ALL ON FUNCTION public.pke_current_user_project_permissions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_current_user_project_permissions(uuid) TO app_runtime_secure;

DO $helpers$
DECLARE v_name text; v_oid oid; v_def text; v_new text;
 v_required text[]:=ARRAY['pke_has_project_permission','pke_has_any_project_permission','pke_has_any_project_access','pke_has_ai_run_permission','pke_has_buyer_permission','pke_has_contract_permission','pke_has_facility_permission','pke_has_journal_entry_permission','pke_has_partner_organization_permission','pke_has_payment_instruction_permission','pke_has_port_permission','pke_has_program_permission','pke_has_shipment_permission','pke_has_stage_permission','pke_has_template_permission','pke_has_tracking_event_permission','pke_has_truck_trip_permission','pke_has_warehouse_permission','pke_has_workflow_permission'];
BEGIN
 FOREACH v_name IN ARRAY v_required LOOP
  SELECT p.oid INTO v_oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_name AND p.prokind='f' ORDER BY p.oid LIMIT 1;
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Required permission helper missing: %',v_name; END IF;
  v_def:=pg_catalog.pg_get_functiondef(v_oid);
  v_new:=pg_catalog.regexp_replace(v_def,'public\.pke_is_platform_admin\(\)[[:space:]]+OR[[:space:]]+','','g');
  IF v_new=v_def THEN RAISE EXCEPTION 'Platform Admin bypass pattern missing in helper %.',v_name; END IF;
  EXECUTE v_new; v_oid:=NULL;
 END LOOP;
END;$helpers$;

DO $notification$
DECLARE v_def text; v_new text;
BEGIN
 v_def:=pg_catalog.pg_get_functiondef('public.pke_can_receive_finance_report_notification(uuid,uuid)'::regprocedure);
 v_new:=replace(v_def,E'recipient.role::text = ''admin''\n         OR ','');
 IF v_new=v_def THEN RAISE EXCEPTION 'Finance notification global-admin shortcut missing.'; END IF;
 EXECUTE v_new;
END;$notification$;

-- Platform Admin cannot execute payments, verify payment evidence/reconcile, or post/reverse journals.
DO $guards$
DECLARE v_name text; v_oid oid; v_def text; v_new text;
 v_required text[]:=ARRAY['pke_payment_approval_guard','pke_payment_evidence_guard','pke_payment_instruction_guard','pke_payment_reconciliation_guard','pke_guard_journal_entry'];
BEGIN
 FOREACH v_name IN ARRAY v_required LOOP
  SELECT p.oid INTO v_oid FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_name AND p.prokind='f' ORDER BY p.oid LIMIT 1;
  IF v_oid IS NULL THEN RAISE EXCEPTION 'Required transaction guard missing: %',v_name; END IF;
  v_def:=pg_catalog.pg_get_functiondef(v_oid);
  v_new:=replace(v_def,'NOT public.pke_is_platform_admin()','true');
  IF v_new=v_def THEN RAISE EXCEPTION 'Platform Admin transaction bypass missing in %.',v_name; END IF;
  EXECUTE v_new; v_oid:=NULL;
 END LOOP;
END;$guards$;

DO $regulatory$
DECLARE v_def text; v_new text;
BEGIN
 v_def:=pg_catalog.pg_get_functiondef('public.pke_regulatory_assessment_guard()'::regprocedure);
 v_new:=replace(v_def,E'ELSIF NOT public.pke_is_platform_admin()\n       AND NOT public.pke_has_project_permission',E'ELSIF NOT public.pke_has_project_permission');
 IF v_new=v_def THEN RAISE EXCEPTION 'Project regulatory assessment admin bypass missing.'; END IF;
 EXECUTE v_new;
END;$regulatory$;

-- Permission templates are system-governed; Platform Admin and Project roles cannot edit grants.
DROP POLICY IF EXISTS pke_admin_all ON public.project_role_permissions;
DROP POLICY IF EXISTS pke_project_role_permissions_select ON public.project_role_permissions;
CREATE POLICY pke_project_role_permissions_select ON public.project_role_permissions FOR SELECT TO app_runtime_secure
USING(public.pke_is_platform_admin() OR public.pke_has_project_permission(project_id,'project.roles.manage'));
REVOKE INSERT,UPDATE,DELETE ON public.project_role_permissions FROM app_runtime_secure;
GRANT SELECT ON public.project_role_permissions TO app_runtime_secure;

DO $rls$
DECLARE p record; v_roles text; v_using text; v_check text; v_sql text; v_cmd text;
BEGIN
 FOR p IN
  SELECT pol.oid,ns.nspname,cls.relname,pol.polname,pol.polcmd,pol.polpermissive,pol.polroles,
    pg_catalog.pg_get_expr(pol.polqual,pol.polrelid) AS using_expr,
    pg_catalog.pg_get_expr(pol.polwithcheck,pol.polrelid) AS check_expr
  FROM pg_catalog.pg_policy pol JOIN pg_catalog.pg_class cls ON cls.oid=pol.polrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=cls.relnamespace
  WHERE ns.nspname='public'
   AND (pol.polname='pke_admin_all' OR COALESCE(pg_catalog.pg_get_expr(pol.polqual,pol.polrelid),'') ILIKE '%pke_is_platform_admin()%' OR COALESCE(pg_catalog.pg_get_expr(pol.polwithcheck,pol.polrelid),'') ILIKE '%pke_is_platform_admin()%')
   AND cls.relname NOT IN('admin_action_queue','company_settings','permissions','role_catalog','role_permissions','users','projects','project_members','project_roles','project_invitations','project_templates','project_template_versions','project_role_assignments','project_role_assignment_events','project_role_permissions')
 LOOP
  EXECUTE pg_catalog.format('DROP POLICY %I ON %I.%I',p.polname,p.nspname,p.relname);
  IF p.polname='pke_admin_all' THEN CONTINUE; END IF;
  SELECT string_agg(CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE pg_catalog.quote_ident(r.rolname) END,', ' ORDER BY role_oid)
   INTO v_roles FROM unnest(p.polroles) AS role_ids(role_oid) LEFT JOIN pg_catalog.pg_roles r ON r.oid=role_oid;
  v_cmd:=CASE p.polcmd WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE NULL END;
  IF v_cmd IS NULL OR v_roles IS NULL THEN RAISE EXCEPTION 'Cannot reconstruct policy % on %.%.',p.polname,p.nspname,p.relname; END IF;
  v_sql:=pg_catalog.format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',p.polname,p.nspname,p.relname,CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,v_cmd,v_roles);
  v_using:=CASE WHEN p.using_expr IS NULL THEN NULL ELSE replace(p.using_expr,'pke_is_platform_admin()','false') END;
  v_check:=CASE WHEN p.check_expr IS NULL THEN NULL ELSE replace(p.check_expr,'pke_is_platform_admin()','false') END;
  IF v_using IS NOT NULL THEN v_sql:=v_sql||pg_catalog.format(' USING (%s)',v_using); END IF;
  IF v_check IS NOT NULL THEN v_sql:=v_sql||pg_catalog.format(' WITH CHECK (%s)',v_check); END IF;
  EXECUTE v_sql;
 END LOOP;
END;$rls$;

DROP POLICY IF EXISTS pke_admin_all ON public.project_role_assignments;
DROP POLICY IF EXISTS pke_admin_all ON public.project_role_assignment_events;
DROP POLICY IF EXISTS pke_project_role_assignments_insert ON public.project_role_assignments;
CREATE POLICY pke_project_role_assignments_insert ON public.project_role_assignments FOR INSERT TO app_runtime_secure
WITH CHECK((public.pke_is_platform_admin() AND EXISTS(SELECT 1 FROM public.project_roles role WHERE role.id=project_role_assignments.project_role_id AND role.project_id=project_role_assignments.project_id AND role.role_code='pm')) OR public.pke_has_project_permission(project_id,'project.members.manage'));
DROP POLICY IF EXISTS pke_project_role_assignments_update ON public.project_role_assignments;
CREATE POLICY pke_project_role_assignments_update ON public.project_role_assignments FOR UPDATE TO app_runtime_secure
USING((public.pke_is_platform_admin() AND EXISTS(SELECT 1 FROM public.project_roles role WHERE role.id=project_role_assignments.project_role_id AND role.project_id=project_role_assignments.project_id AND role.role_code='pm')) OR public.pke_has_project_permission(project_id,'project.members.manage'))
WITH CHECK((public.pke_is_platform_admin() AND EXISTS(SELECT 1 FROM public.project_roles role WHERE role.id=project_role_assignments.project_role_id AND role.project_id=project_role_assignments.project_id AND role.role_code='pm')) OR public.pke_has_project_permission(project_id,'project.members.manage'));

DO $post$
DECLARE v_policy integer; v_admin_all integer; v_helpers integer;
BEGIN
 SELECT count(*) INTO v_policy FROM pg_catalog.pg_policies WHERE schemaname='public'
 AND tablename NOT IN('admin_action_queue','company_settings','permissions','role_catalog','role_permissions','users','projects','project_members','project_roles','project_invitations','project_templates','project_template_versions','project_role_assignments','project_role_assignment_events','project_role_permissions')
 AND (COALESCE(qual,'') ILIKE '%pke_is_platform_admin()%' OR COALESCE(with_check,'') ILIKE '%pke_is_platform_admin()%');
 IF v_policy<>0 THEN RAISE EXCEPTION 'Platform Admin RLS bypass remains on % non-governance policies.',v_policy; END IF;
 SELECT count(*) INTO v_admin_all FROM pg_catalog.pg_policies WHERE schemaname='public' AND policyname='pke_admin_all'
 AND tablename NOT IN('admin_action_queue','company_settings','permissions','role_catalog','role_permissions','users','projects','project_members','project_roles','project_invitations','project_templates','project_template_versions');
 IF v_admin_all<>0 THEN RAISE EXCEPTION 'Non-governance pke_admin_all policies remain: %.',v_admin_all; END IF;
 SELECT count(*) INTO v_helpers FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f'
 AND p.proname IN('pke_has_project_permission','pke_has_any_project_permission','pke_has_any_project_access','pke_has_ai_run_permission','pke_has_buyer_permission','pke_has_contract_permission','pke_has_facility_permission','pke_has_journal_entry_permission','pke_has_partner_organization_permission','pke_has_payment_instruction_permission','pke_has_port_permission','pke_has_program_permission','pke_has_shipment_permission','pke_has_stage_permission','pke_has_template_permission','pke_has_tracking_event_permission','pke_has_truck_trip_permission','pke_has_warehouse_permission','pke_has_workflow_permission')
 AND pg_catalog.pg_get_functiondef(p.oid) ILIKE '%pke_is_platform_admin()%';
 IF v_helpers<>0 THEN RAISE EXCEPTION 'Project/object permission helpers still contain Platform Admin bypasses: %.',v_helpers; END IF;
 IF EXISTS(SELECT 1 FROM public.project_role_permissions prp JOIN public.project_roles pr ON pr.id=prp.project_role_id AND pr.project_id=prp.project_id JOIN public.permissions perm ON perm.id=prp.permission_id WHERE NOT EXISTS(SELECT 1 FROM public.pke_project_role_permission_allowlist a WHERE a.role_code=pr.role_code AND a.permission_code=perm.code)) THEN RAISE EXCEPTION 'Non-canonical Project role permission grants remain.'; END IF;
END;$post$;
COMMIT;
