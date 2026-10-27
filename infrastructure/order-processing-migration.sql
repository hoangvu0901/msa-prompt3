BEGIN;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS chk_orders_status;

ALTER TABLE orders
  ADD CONSTRAINT chk_orders_status CHECK (
    status IN ('PENDING', 'COMPENSATING', 'CONFIRMED', 'FAILED')
  );

CREATE INDEX IF NOT EXISTS idx_orders_compensating
  ON orders(created_at)
  WHERE status = 'COMPENSATING';

COMMIT;
