-- P1 quality chain: QC and QA must see source production batches and lab sample context.
INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
SELECT x.role_code,x.permission_code
FROM (VALUES
 ('qc_officer','operations.view'),
 ('qa_manager','operations.view'),
 ('laboratory_officer','operations.view'),
 ('laboratory_officer','quality.sample.view')
) x(role_code,permission_code)
JOIN public.pke_project_role_policy p ON p.role_code=x.role_code
JOIN public.permissions perm ON perm.code=x.permission_code AND perm.is_active
ON CONFLICT(role_code,permission_code) DO NOTHING;

INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
SELECT pr.project_id,pr.id,perm.id
FROM public.project_roles pr
JOIN public.pke_project_role_permission_allowlist a ON a.role_code=pr.role_code
JOIN public.permissions perm ON perm.code=a.permission_code AND perm.is_active
WHERE (pr.role_code IN ('qc_officer','qa_manager','laboratory_officer') AND perm.code='operations.view')
   OR (pr.role_code='laboratory_officer' AND perm.code='quality.sample.view')
ON CONFLICT(project_role_id,permission_id) DO NOTHING;

