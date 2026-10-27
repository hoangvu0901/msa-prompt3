const {
  withOrderLock,
} = require("../infrastructure/with-order-lock");
const clients = require("../infrastructure/grpc-clients");

function createStockFinalizer({
  callProduct = clients.callProduct,
} = {}) {
  return async function finalizeOrderStock(oid) {
    if (!Number.isInteger(oid) || oid <= 0 || oid > 2147483647) {
      const error = new Error("Invalid order ID");
      error.kind = "VALIDATION";
      throw error;
    }

    return withOrderLock(oid, async (connection, order) => {
      if (order.status !== "CONFIRMED") {
        const error = new Error("Only confirmed orders can commit stock");
        error.kind = "CONFLICT";
        throw error;
      }

      if (order.stock_committed_at) return order;

      for (const item of order.request_items) {
        const result = await callProduct("commitStock", {
          pid: item.pid,
          qty: item.qty,
          reservationId: order.reservation_id,
        });

        if (
          result.pid !== item.pid ||
          result.qty !== item.qty ||
          result.reservationId !== order.reservation_id ||
          result.state !== "COMMITTED"
        ) {
          throw new Error("Unexpected CommitStock response");
        }
      }

      const updated = await connection.query(
        `UPDATE orders
         SET stock_committed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE oid = $1
         RETURNING *`,
        [oid]
      );

      return updated.rows[0];
    });
  };
}

module.exports = {
  createStockFinalizer,
  finalizeOrderStock: createStockFinalizer(),
};
