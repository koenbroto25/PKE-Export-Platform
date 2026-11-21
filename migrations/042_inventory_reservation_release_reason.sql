-- P0 remediation: inventory reservation release metadata.
-- The existing guard and audit trigger already require/read NEW.release_reason.
-- Production schema lacked the column, making reservation release/audit paths fail.
ALTER TABLE public.inventory_reservations
  ADD COLUMN IF NOT EXISTS release_reason text;

COMMENT ON COLUMN public.inventory_reservations.release_reason IS
  'Required reason recorded when an inventory reservation is manually released or expired; immutable after transition.';
