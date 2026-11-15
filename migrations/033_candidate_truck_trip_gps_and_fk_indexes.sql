-- PKE Migration 033 — CANDIDATE FOR OWNER REVIEW ONLY
-- Target: Neon project lucky-glitter-99553107 / branch production / database neondb
-- Status: NOT APPLIED. This file has not been executed against Neon.
-- Baseline: migration_history latest id=32, filename 032_seed_core_currency_reference_data.sql.
-- Scope: two missing FK-supporting indexes + coherent optional GPS tuple on truck_trips
-- + report_runs queued default and a completed=>nonblank file_reference guard.
-- Deliberately excluded: report status enum (allowed values are not fully verified),
-- truck/shipment status enums, payment execution schema, MFA, Auth origins, and storage changes.
--
-- Preconditions (run read-only immediately before any future approval/application):
-- 1) Confirm migration_history still ends at id=32 and 033 filename is absent.
-- 2) Confirm both FK columns still have no valid index with that column as the leading key:
--      warehouse_receipts.reviewed_by
--      payment_instructions.returned_by
-- 3) Confirm truck_trips still has gps_latitude, gps_longitude, gps_accuracy and the
--    constraint name below is absent.
-- 4) Confirm report_runs status default and constraint name below have not changed/been added.
-- 5) Confirm no partial/invalid GPS tuples exist (query below). Existing table was observed
--    empty in the read-only audit, but recheck before execution.
-- 6) Confirm the active application contract treats trip GPS as optional as a whole tuple;
--    when supplied, all three values must be present, coordinates within legal ranges,
--    and accuracy positive/finite. This CHECK does not replace server-side GPS validation.
-- 7) Confirm current report API queues reports and only marks completed after storing the
--    generated file. The DB guard requires a nonblank reference; it cannot verify object existence.
--
-- PRE-FLIGHT SQL (READ ONLY; execute separately, do not include in migration runner):
-- SELECT id, filename, sha256, status FROM public.migration_history ORDER BY id DESC LIMIT 3;
-- SELECT column_default FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='report_runs' AND column_name='status';
-- SELECT count(*) AS completed_without_file_reference
-- FROM public.report_runs
-- WHERE status='completed' AND NULLIF(btrim(file_reference),'') IS NULL;
-- SELECT count(*) AS invalid_gps_rows
-- FROM public.truck_trips
-- WHERE NOT (
--   (gps_latitude IS NULL AND gps_longitude IS NULL AND gps_accuracy IS NULL)
--   OR (
--     gps_latitude IS NOT NULL AND gps_longitude IS NOT NULL AND gps_accuracy IS NOT NULL
--     AND gps_latitude BETWEEN -90 AND 90
--     AND gps_longitude BETWEEN -180 AND 180
--     AND gps_accuracy > 0
--     AND gps_accuracy NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
--   )
-- );
-- SELECT v.table_name, v.column_name,
--        EXISTS (
--          SELECT 1 FROM pg_index i
--          WHERE i.indrelid = v.table_name::regclass
--            AND i.indisvalid AND i.indisready
--            AND i.indkey[0] = a.attnum
--        ) AS has_leading_index
-- FROM (VALUES
--   ('public.warehouse_receipts','reviewed_by'),
--   ('public.payment_instructions','returned_by')
-- ) AS v(table_name,column_name)
-- JOIN pg_attribute a
--   ON a.attrelid=v.table_name::regclass AND a.attname=v.column_name
-- ORDER BY v.table_name, v.column_name;
--
-- MIGRATION SQL:
BEGIN;

CREATE INDEX IF NOT EXISTS idx_warehouse_receipts_reviewed_by
  ON public.warehouse_receipts (reviewed_by);

CREATE INDEX IF NOT EXISTS idx_payment_instructions_returned_by
  ON public.payment_instructions (returned_by);

ALTER TABLE public.report_runs
  ALTER COLUMN status SET DEFAULT 'queued';

ALTER TABLE public.report_runs
  ADD CONSTRAINT report_runs_completed_requires_file_reference
  CHECK (status <> 'completed' OR NULLIF(btrim(file_reference), '') IS NOT NULL)
  NOT VALID;

ALTER TABLE public.report_runs
  VALIDATE CONSTRAINT report_runs_completed_requires_file_reference;

ALTER TABLE public.truck_trips
  ADD CONSTRAINT truck_trips_gps_tuple_valid
  CHECK (
    (gps_latitude IS NULL AND gps_longitude IS NULL AND gps_accuracy IS NULL)
    OR (
      gps_latitude IS NOT NULL
      AND gps_longitude IS NOT NULL
      AND gps_accuracy IS NOT NULL
      AND gps_latitude BETWEEN -90 AND 90
      AND gps_longitude BETWEEN -180 AND 180
      AND gps_accuracy > 0
      AND gps_accuracy NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    )
  ) NOT VALID;

ALTER TABLE public.truck_trips
  VALIDATE CONSTRAINT truck_trips_gps_tuple_valid;

COMMIT;

-- POST-APPLY VERIFICATION (READ ONLY; execute separately after a separately approved apply):
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE schemaname='public' AND indexname IN (
--   'idx_warehouse_receipts_reviewed_by',
--   'idx_payment_instructions_returned_by'
-- ) ORDER BY indexname;
-- SELECT conname, convalidated, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE (conrelid='public.truck_trips'::regclass AND conname='truck_trips_gps_tuple_valid')
--    OR (conrelid='public.report_runs'::regclass AND conname='report_runs_completed_requires_file_reference');
-- SELECT column_default FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='report_runs' AND column_name='status';
-- Confirm migration runner recorded filename + SHA-256 + status='applied'; do not manually
-- insert migration_history unless the repository's migration runner explicitly requires it.
--
-- ROLLBACK SQL (only if this exact migration was applied and rollback is separately approved):
-- BEGIN;
-- ALTER TABLE public.truck_trips
--   DROP CONSTRAINT IF EXISTS truck_trips_gps_tuple_valid;
-- ALTER TABLE public.report_runs
--   DROP CONSTRAINT IF EXISTS report_runs_completed_requires_file_reference;
-- ALTER TABLE public.report_runs
--   ALTER COLUMN status SET DEFAULT 'completed';
-- DROP INDEX IF EXISTS public.idx_warehouse_receipts_reviewed_by;
-- DROP INDEX IF EXISTS public.idx_payment_instructions_returned_by;
-- COMMIT;
--
-- Rollback removes the integrity guard and indexes. It does not alter business rows.
