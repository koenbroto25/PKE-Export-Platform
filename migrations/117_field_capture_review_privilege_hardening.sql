-- Migration 117: explicitly harden Field Capture review function and immutable review history privileges.
BEGIN;
REVOKE ALL ON FUNCTION public.pke_review_field_capture_submission(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pke_review_field_capture_submission(uuid,text,text) TO app_runtime_secure;
REVOKE INSERT,UPDATE,DELETE ON public.project_field_capture_review_events FROM app_runtime_secure;
GRANT SELECT ON public.project_field_capture_review_events TO app_runtime_secure;
REVOKE UPDATE,DELETE ON public.project_field_capture_submissions FROM app_runtime_secure;
GRANT SELECT,INSERT ON public.project_field_capture_submissions TO app_runtime_secure;
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.pke_review_field_capture_submission(uuid,text,text)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'PUBLIC execute remains on review function'; END IF;
 IF has_table_privilege('app_runtime_secure','public.project_field_capture_review_events','INSERT') OR has_table_privilege('app_runtime_secure','public.project_field_capture_review_events','UPDATE') OR has_table_privilege('app_runtime_secure','public.project_field_capture_review_events','DELETE') THEN RAISE EXCEPTION 'Runtime mutation grant remains on immutable review history'; END IF;
END;
$verify$;
COMMIT;
