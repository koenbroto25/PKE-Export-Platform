-- RECONSTRUCTED CANDIDATE; NOT AUTHENTIC SOURCE; REVIEW ONLY
-- Historical SHA-256: c0265dfe554e55bebe5061ea90a41e74c10e1ff353616174cbfd0f590d46596a
-- Legacy catalog shows trigger-returning public functions are owner-only;
-- PUBLIC and app_runtime_secure do not have direct EXECUTE.
BEGIN;
DO $migration$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prorettype='pg_catalog.trigger'::pg_catalog.regtype
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, app_runtime_secure',
      fn.signature
    );
  END LOOP;
END
$migration$;
COMMIT;
