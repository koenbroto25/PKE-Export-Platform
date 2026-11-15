-- Read-only preflight checks
SELECT current_database(), current_user, session_user, version();
SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema') ORDER BY 1;
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
SELECT count(*) AS rls_table_count FROM pg_tables WHERE schemaname='public' AND rowsecurity=true;
SELECT count(*) AS policy_count FROM pg_policies WHERE schemaname='public';
SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='neon_auth_user_id';
SELECT proname FROM pg_proc WHERE proname='resolve_pke_user_by_neon_auth_user_id';
SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='project_workflows';
