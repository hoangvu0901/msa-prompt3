const pool = require("../infrastructure/database");
const { processOrder } = require("./process-order");
const { finalizeOrderStock } = require("./finalize-order-stock");

const eligible = `(
  status IN ('PENDING', 'COMPENSATING')
  OR (status = 'CONFIRMED' AND stock_committed_at IS NULL)
)`;

async function recoverOrders({
  onlyIds = null,
  shouldStop = () => false,
} = {}) {
  const candidates = await pool.query(
    `SELECT oid
     FROM orders
     WHERE ${eligible}
       AND next_processing_at <= CURRENT_TIMESTAMP
       AND ($1::int[] IS NULL OR oid = ANY($1::int[]))
     ORDER BY next_processing_at, oid
     LIMIT 10`,
    [onlyIds]
  );

  const results = [];

  for (const candidate of candidates.rows) {
    if (shouldStop()) break;

    const oid = candidate.oid;

    // Recheck because another process may already have completed this order.
    const attempt = await pool.query(
      `UPDATE orders
       SET processing_attempts = processing_attempts + 1
       WHERE oid = $1
         AND ${eligible}
         AND next_processing_at <= CURRENT_TIMESTAMP
       RETURNING processing_attempts`,
      [oid]
    );

    if (!attempt.rowCount) continue;

    try {
      let order = await processOrder(oid);

      if (order.status === "CONFIRMED") {
        order = await finalizeOrderStock(oid);
      }

      await pool.query(
        `UPDATE orders
         SET last_processing_error = NULL
         WHERE oid = $1`,
        [oid]
      );

      console.log(JSON.stringify({
        event: "order_recovery_completed",
        oid,
        status: order.status,
        stockCommitted: Boolean(order.stock_committed_at),
      }));

      results.push({ oid, ok: true, status: order.status });
    } catch (error) {
      const attempts = attempt.rows[0].processing_attempts;
      const retrySeconds = Math.min(
        60,
        5 * (2 ** Math.min(attempts - 1, 4))
      );

      await pool.query(
        `UPDATE orders
         SET next_processing_at =
               CURRENT_TIMESTAMP + ($2::int * INTERVAL '1 second'),
             last_processing_error = $3
         WHERE oid = $1 AND ${eligible}`,
        [
          oid,
          retrySeconds,
          String(error.details || error.message).slice(0, 1000),
        ]
      );

      console.error(JSON.stringify({
        event: "order_recovery_retry",
        oid,
        retrySeconds,
        code: error.code || error.kind || "UNKNOWN",
      }));

      results.push({ oid, ok: false });
    }
  }

  return results;
}

module.exports = { recoverOrders };
