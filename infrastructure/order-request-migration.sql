BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS request_items JSONB;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS reservation_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM orders
    WHERE request_items IS NULL OR reservation_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Existing orders need backfill. Stop migration; do not delete data.';
  END IF;
END
$$;

ALTER TABLE orders
  ALTER COLUMN request_items SET NOT NULL,
  ALTER COLUMN reservation_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass
      AND conname = 'chk_orders_request_items'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT chk_orders_request_items CHECK (
        CASE
          WHEN jsonb_typeof(request_items) = 'array'
          THEN jsonb_array_length(request_items) BETWEEN 1 AND 50
          ELSE FALSE
        END
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_reservation_id
  ON orders(reservation_id);

COMMIT;
