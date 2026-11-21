-- Migration 084: PM Project-scoped depth/tide submissions and vessel assessment read scope.
CREATE SCHEMA IF NOT EXISTS p2b_backup_083_20261121;
CREATE TABLE p2b_backup_083_20261121.p16_role_permissions_pre_084 AS
 SELECT prp.* FROM public.project_role_permissions prp
 JOIN public.project_roles pr ON pr.id=prp.project_role_id
 JOIN public.permissions p ON p.id=prp.permission_id
 WHERE pr.role_code='pm' AND p.code IN ('port.depth.submit','vessel.view');
CREATE TABLE p2b_backup_083_20261121.p16_allowlist_pre_084 AS
 SELECT * FROM public.pke_project_role_permission_allowlist
 WHERE role_code='pm' AND permission_code IN ('port.depth.submit','vessel.view');
INSERT INTO public.pke_project_role_permission_allowlist(role_code,permission_code)
 VALUES('pm','port.depth.submit'),('pm','vessel.view')
 ON CONFLICT(role_code,permission_code) DO NOTHING;
INSERT INTO public.project_role_permissions(project_id,project_role_id,permission_id)
 SELECT pr.project_id,pr.id,p.id FROM public.project_roles pr
 JOIN public.permissions p ON p.code IN ('port.depth.submit','vessel.view') AND p.is_active=true
 WHERE pr.role_code='pm' AND pr.is_active=true
 ON CONFLICT(project_role_id,permission_id) DO NOTHING;
