const { randomUUID } = require("node:crypto");
const {
  withOrderLock,
} = require("../infrastructure/with-order-lock");
const clients = require("../infrastructure/grpc-clients");
const { calculateOrder } = require("../domain/order-pricing");

function isBusinessError(error) {
  return error.kind === "VALIDATION" || [
    clients.grpc.status.INVALID_ARGUMENT,
    clients.grpc.status.NOT_FOUND,
    clients.grpc.status.ALREADY_EXISTS,
    clients.grpc.status.FAILED_PRECONDITION,
  ].includes(error.code);
}

function stockRequest(order, item) {
  return {
    pid: item.pid,
    qty: item.qty,
    reservationId: order.reservation_id,
  };
}

// Dependency injection allows tests to simulate interrupted RPC calls.
function createOrderProcessor({
  callCustomer = clients.callCustomer,
  callProduct = clients.callProduct,
} = {}) {
  async function confirmOrMarkCompensation(oid) {
    return withOrderLock(oid, async (connection, order) => {
      if (order.status !== "PENDING") return order;

      let pricing;

      // Only business errors during preparation trigger compensation.
      // SQL errors and ambiguous COMMIT results must be retried.
      try {
        const customer = await callCustomer("getCustomer", {
          uid: order.uid,
        });

        if (customer.uid !== order.uid) {
          throw new Error("Customer response identity mismatch");
        }

        const items = [];

        for (const item of order.request_items) {
          const reserved = await callProduct(
            "reserveStock",
            stockRequest(order, item)
          );

          if (
            reserved.pid !== item.pid ||
            reserved.qty !== item.qty ||
            reserved.reservationId !== order.reservation_id ||
            reserved.state !== "HELD"
          ) {
            throw new Error("Unexpected reservation response");
          }

          items.push({
            pid: item.pid,
            qty: item.qty,
            unit_price: reserved.unit_price,
          });
        }

        pricing = calculateOrder({
          membershipScore: customer.score,
          items,
        });
      } catch (error) {
        if (!isBusinessError(error)) throw error;

        const result = await connection.query(
          `UPDATE orders
           SET status = 'COMPENSATING',
               failure_reason = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE oid = $1
           RETURNING *`,
          [
            oid,
            String(error.details || error.message).slice(0, 1000),
          ]
        );

        return result.rows[0];
      }

      for (const detail of pricing.details) {
        await connection.query(
          `INSERT INTO order_details (oid, pid, qty, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [oid, detail.pid, detail.qty, detail.unit_price]
        );
      }

      const confirmed = await connection.query(
        `UPDATE orders
         SET status = 'CONFIRMED',
             membership_score = $2,
             discount_rate = $3,
             subtotal = $4,
             discount = $5,
             total_amount = $6,
             failure_reason = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE oid = $1
         RETURNING *`,
        [
          oid,
          pricing.membership_score,
          pricing.discount_rate,
          pricing.subtotal,
          pricing.discount,
          pricing.total_amount,
        ]
      );

      const eventId = randomUUID();
      const event = {
        eventId,
        eventType: "OrderCreated",
        version: 1,
        occurredAt: new Date().toISOString(),
        data: {
          oid,
          uid: order.uid,
          reservationId: order.reservation_id,
          membership_score: pricing.membership_score,
          discount_rate: pricing.discount_rate,
          subtotal: pricing.subtotal,
          discount: pricing.discount,
          total_amount: pricing.total_amount,
          details: pricing.details,
        },
      };

      await connection.query(
        `INSERT INTO outbox_events (
           event_id, event_type, aggregate_id, payload
         )
         VALUES ($1, 'OrderCreated', $2, $3::jsonb)`,
        [eventId, oid, JSON.stringify(event)]
      );

      // Details, confirmation and outbox are committed together.
      return confirmed.rows[0];
    });
  }

  async function compensate(oid) {
    return withOrderLock(oid, async (connection, order) => {
      if (order.status !== "COMPENSATING") return order;

      for (const item of order.request_items) {
        try {
          const released = await callProduct(
            "releaseStock",
            stockRequest(order, item)
          );

          if (
            released.pid !== item.pid ||
            released.qty !== item.qty ||
            released.reservationId !== order.reservation_id ||
            released.state !== "RELEASED"
          ) {
            throw new Error("Unexpected release response");
          }
        } catch (error) {
          // A missing product cannot hold a reservation under
          // the current Product deletion guards.
          if (error.code !== clients.grpc.status.NOT_FOUND) {
            throw error;
          }
        }
      }

      const result = await connection.query(
        `UPDATE orders
         SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
         WHERE oid = $1
         RETURNING *`,
        [oid]
      );

      return result.rows[0];
    });
  }

  return async function processOrder(oid) {
    if (!Number.isInteger(oid) || oid <= 0 || oid > 2147483647) {
      const error = new Error("Invalid order ID");
      error.kind = "VALIDATION";
      throw error;
    }

    const order = await confirmOrMarkCompensation(oid);

    if (order.status === "COMPENSATING") {
      return compensate(oid);
    }

    return order;
  };
}

module.exports = {
  createOrderProcessor,
  processOrder: createOrderProcessor(),
};
