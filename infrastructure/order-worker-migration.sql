BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_processing_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_processing_error TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_recovery
  ON orders(next_processing_at, oid)
  WHERE status IN ('PENDING', 'COMPENSATING')
     OR (status = 'CONFIRMED' AND stock_committed_at IS NULL);

COMMIT;
