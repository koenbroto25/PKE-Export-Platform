-- Migration 067: enable Procurement/Contract Manager to create supplier delivery commitments.
-- UAT ONLY. Do not add to the Production migration manifest or apply through the generic Production runner.
BEGIN;

-- Suppliers retain the scoped update permission; Procurement and Contract Manager also need it
-- to originate the commitment workflow. API role guards still prohibit Supplier-side creation.
INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
SELECT p.role_code,'procurement.commitment.manage'
FROM public.pke_project_role_policy p
WHERE p.role_code IN ('procurement','contract_manager')
ON CONFLICT (role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,perm.id
FROM public.project_roles pr
JOIN public.pke_project_role_permission_allowlist a
  ON a.role_code=pr.role_code AND a.permission_code='procurement.commitment.manage'
JOIN public.permissions perm
  ON perm.code='procurement.commitment.manage' AND perm.is_active=true
WHERE pr.role_code IN ('procurement','contract_manager') AND pr.is_active=true
ON CONFLICT (project_role_id,permission_id) DO NOTHING;

COMMIT;
