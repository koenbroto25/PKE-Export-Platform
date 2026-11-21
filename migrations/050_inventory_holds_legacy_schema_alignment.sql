-- Migration 050: align the legacy inventory_holds table with the Project-scoped API contract.
-- This is additive: preserve legacy columns and backfill the API-facing aliases.
BEGIN;
ALTER TABLE public.inventory_holds
  ADD COLUMN IF NOT EXISTS held_quantity numeric,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.users(id) ON DELETE RESTRICT;

UPDATE public.inventory_holds
   SET held_quantity = COALESCE(held_quantity, quantity),
       unit = COALESCE(unit, unit_code),
       idempotency_key = COALESCE(idempotency_key, 'legacy:' || id::text),
       created_by = COALESCE(created_by, placed_by)
 WHERE held_quantity IS NULL
    OR unit IS NULL
    OR idempotency_key IS NULL
    OR created_by IS NULL;

ALTER TABLE public.inventory_holds
  ALTER COLUMN held_quantity SET NOT NULL,
  ALTER COLUMN unit SET NOT NULL,
  ALTER COLUMN idempotency_key SET NOT NULL,
  ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.inventory_holds
  ADD CONSTRAINT inventory_holds_held_quantity_positive CHECK (held_quantity > 0),
  ADD CONSTRAINT inventory_holds_unit_nonempty CHECK (length(btrim(unit)) > 0),
  ADD CONSTRAINT inventory_holds_idempotency_key_nonempty CHECK (length(btrim(idempotency_key)) > 0);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_holds_idempotency_key_uidx
  ON public.inventory_holds (idempotency_key);
COMMIT;
