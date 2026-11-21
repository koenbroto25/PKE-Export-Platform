-- Migration 068: role-scoped P1 KPI visibility without broad reports.view access.
-- UAT ONLY. Do not add to the Production migration manifest or apply through the generic Production runner.
BEGIN;

INSERT INTO public.permissions(name,code,description,is_active)
VALUES ('View role-scoped P1 KPIs','p1.kpi.view','View only the P1 KPI templates scoped to the user’s active Project roles.',true)
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,is_active=true;

INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
SELECT rp.role_code,'p1.kpi.view'
FROM public.pke_project_role_policy rp
WHERE rp.role_code=ANY(ARRAY[
  'procurement','contract_manager','buyer','pks_site_manager',
  'production_manager','packing_supervisor','qc_officer','laboratory_officer','qa_manager','hse_officer',
  'transport_manager','dispatcher','transporter','driver','checker',
  'master_of_loading','loading_manager','loading_supervisor','loading_operator','marine_surveyor','ship_master',
  'terminal_representative','shipping_agent','document_officer',
  'warehouse','warehouse_manager','warehouse_officer','inventory_controller'
]::text[])
ON CONFLICT (role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,p.id
FROM public.project_roles pr
JOIN public.pke_project_role_permission_allowlist a
  ON a.role_code=pr.role_code AND a.permission_code='p1.kpi.view'
JOIN public.permissions p ON p.code='p1.kpi.view' AND p.is_active=true
WHERE pr.is_active=true
ON CONFLICT (project_role_id,permission_id) DO NOTHING;

COMMIT;
