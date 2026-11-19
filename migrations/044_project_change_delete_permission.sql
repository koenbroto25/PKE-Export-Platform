-- Migration 044: restore the permission referenced by the existing
-- project change-request DELETE RLS policy. No Project role receives this grant.
INSERT INTO public.permissions (name, code, description, is_active, created_at, updated_at)
VALUES (
  'Delete Project Change Request',
  'project.change.delete',
  'Allows deletion of a Project change request where explicitly granted by a future, separately approved role-permission change.',
  true,
  now(),
  now()
)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_active = true,
      updated_at = now();

-- Intentionally do not insert into role_permissions or project_role_permissions.
