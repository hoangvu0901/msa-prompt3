const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const pool = require("./infrastructure/database");
const {
  grpc,
  callProduct,
  closeClients,
} = require("./infrastructure/grpc-clients");
const { acceptOrderRequest } = require("./application/accept-order-request");
const {
  processOrder,
  createOrderProcessor,
} = require("./application/process-order");
const { recoverOrders } = require("./application/recover-orders");

function rpcError(code) {
  const error = new Error("Simulated interruption for worker test");
  error.code = code;
  return error;
}

async function readOrder(oid) {
  return (await pool.query(
    "SELECT * FROM orders WHERE oid = $1", [oid]
  )).rows[0];
}

async function main() {
  const sourceId = Number(process.argv[2] || 21);
  const source = await readOrder(sourceId);
  assert.ok(source, "Source order not found");

  const pid = source.request_items[0].pid;
  const initial = await callProduct("getProduct", { pid });
  assert.ok(initial.quantity >= 3, "Test needs at least 3 available units");

  async function createPending() {
    return (await acceptOrderRequest({
      uid: source.uid,
      requestId: randomUUID(),
      items: [{ pid, qty: 1 }],
    })).order;
  }

  // Scenario 1: reservation succeeded but Order has not continued.
  const pending = await createPending();
  await callProduct("reserveStock", {
    pid,
    qty: 1,
    reservationId: pending.reservation_id,
  });

  // Scenario 2: order confirmed, stock finalization not yet called.
  const confirmed = await createPending();
  assert.equal((await processOrder(confirmed.oid)).status, "CONFIRMED");
  assert.equal((await readOrder(confirmed.oid)).stock_committed_at, null);

  // Scenario 3: compensation started but release was interrupted.
  const compensating = await createPending();
  const interruptedProcessor = createOrderProcessor({
    callProduct: async (method, input) => {
      if (method === "reserveStock") {
        await callProduct(method, input);
        throw rpcError(grpc.status.FAILED_PRECONDITION);
      }
      if (method === "releaseStock") {
        throw rpcError(grpc.status.UNAVAILABLE);
      }
      return callProduct(method, input);
    },
  });

  await assert.rejects(
    () => interruptedProcessor(compensating.oid),
    error => error.code === grpc.status.UNAVAILABLE
  );
  assert.equal(
    (await readOrder(compensating.oid)).status,
    "COMPENSATING"
  );

  const ids = [pending.oid, confirmed.oid, compensating.oid];
  const results = await recoverOrders({ onlyIds: ids });
  assert.equal(results.length, 3);
  assert.ok(results.every(result => result.ok));

  for (const oid of [pending.oid, confirmed.oid]) {
    const order = await readOrder(oid);
    assert.equal(order.status, "CONFIRMED");
    assert.ok(order.stock_committed_at);
    assert.equal(order.processing_attempts, 1);

    const events = await pool.query(
      "SELECT COUNT(*)::int AS total FROM outbox_events WHERE aggregate_id = $1",
      [oid]
    );
    assert.equal(events.rows[0].total, 1);
  }
  console.log("PASS: Worker completes PENDING and unfinalized CONFIRMED orders.");

  assert.equal(
    (await readOrder(compensating.oid)).status,
    "FAILED"
  );
  console.log("PASS: Worker resumes compensation.");

  const after = await callProduct("getProduct", { pid });
  assert.equal(after.quantity, initial.quantity - 2);
  console.log("PASS: Only the two successful orders consume stock.");

  assert.deepEqual(await recoverOrders({ onlyIds: ids }), []);
  console.log("PASS: Completed orders are excluded from later scans.");

  // Verify that retry time controls eligibility.
  const deferred = await createPending();
  await pool.query(
    `UPDATE orders
     SET next_processing_at = CURRENT_TIMESTAMP + INTERVAL '1 hour'
     WHERE oid = $1`,
    [deferred.oid]
  );
  assert.deepEqual(
    await recoverOrders({ onlyIds: [deferred.oid] }),
    []
  );
  console.log("PASS: Orders scheduled for later are not processed early.");

  // This test order never reserved stock; remove only this unused fixture.
  await pool.query(
    "DELETE FROM orders WHERE oid = $1 AND status = 'PENDING'",
    [deferred.oid]
  );

  console.table(ids.map(oid => ({ oid })));
  console.log("ALL ORDER WORKER CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    closeClients();
    await pool.end();
  });
