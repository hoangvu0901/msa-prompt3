const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const databaseModule = require("./infrastructure/database");
const pool = databaseModule.pool || databaseModule;
const {
  acceptOrderRequest,
} = require("./application/accept-order-request");

const requestIds = [];

function makeRequest() {
  const requestId = randomUUID();
  requestIds.push(requestId);

  return {
    uid: 1,
    requestId,
    items: [
      { pid: 2, qty: 3 },
      { pid: 1, qty: 2 },
    ],
  };
}

async function main() {
  const input = makeRequest();
  const first = await acceptOrderRequest(input);

  assert.equal(first.created, true);
  assert.equal(first.order.status, "PENDING");
  assert.equal(first.order.uid, input.uid);
  assert.equal(first.order.request_id, input.requestId);
  assert.deepEqual(first.order.request_items, [
    { pid: 1, qty: 2 },
    { pid: 2, qty: 3 },
  ]);
  assert.match(
    first.order.reservation_id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  );
  console.log("PASS: New request creates a PENDING order.");

  const repeated = await acceptOrderRequest(input);
  assert.equal(repeated.created, false);
  assert.equal(repeated.order.oid, first.order.oid);
  assert.equal(
    repeated.order.reservation_id,
    first.order.reservation_id
  );
  console.log("PASS: Retry returns the same order and reservation ID.");

  const reordered = await acceptOrderRequest({
    ...input,
    items: [...input.items].reverse(),
  });
  assert.equal(reordered.order.oid, first.order.oid);
  console.log("PASS: Reordered items return the same order.");

  await assert.rejects(
    () => acceptOrderRequest({
      ...input,
      items: [{ pid: 1, qty: 99 }],
    }),
    error => error.kind === "CONFLICT"
  );
  console.log("PASS: Same request ID with changed content is rejected.");

  const anotherCustomer = await acceptOrderRequest({
    ...input,
    uid: 2,
  });
  assert.equal(anotherCustomer.created, true);
  assert.notEqual(anotherCustomer.order.oid, first.order.oid);
  assert.notEqual(
    anotherCustomer.order.reservation_id,
    first.order.reservation_id
  );
  console.log("PASS: Customers have separate idempotency scopes.");

  const concurrentInput = makeRequest();

  // Wait for all calls to finish before asserting or cleaning up.
  const settled = await Promise.allSettled(
    Array.from(
      { length: 15 },
      () => acceptOrderRequest(concurrentInput)
    )
  );

  const failure = settled.find(result => result.status === "rejected");
  if (failure) throw failure.reason;

  const results = settled.map(result => result.value);
  assert.equal(results.filter(result => result.created).length, 1);
  assert.equal(new Set(results.map(result => result.order.oid)).size, 1);
  assert.equal(
    new Set(results.map(result => result.order.reservation_id)).size,
    1
  );

  const count = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM orders
     WHERE uid = $1 AND request_id = $2`,
    [concurrentInput.uid, concurrentInput.requestId]
  );
  assert.equal(count.rows[0].total, 1);
  console.log("PASS: Concurrent identical requests create exactly one order.");

  const persisted = await pool.query(
    `SELECT request_items, request_hash, reservation_id, status
     FROM orders WHERE oid = $1`,
    [first.order.oid]
  );
  assert.deepEqual(
    persisted.rows[0].request_items,
    first.order.request_items
  );
  assert.equal(
    persisted.rows[0].request_hash,
    first.order.request_hash
  );
  assert.equal(
    persisted.rows[0].reservation_id,
    first.order.reservation_id
  );
  assert.equal(persisted.rows[0].status, "PENDING");
  console.log("PASS: Original request and reservation ID are persisted.");

  const related = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM order_details WHERE oid = $1)
         AS details,
       (SELECT COUNT(*)::int FROM outbox_events WHERE aggregate_id = $1)
         AS events`,
    [first.order.oid]
  );
  assert.equal(related.rows[0].details, 0);
  assert.equal(related.rows[0].events, 0);
  console.log("PASS: Accepting a request does not create details or events.");

  console.log("ALL ORDER IDEMPOTENCY CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.query(
        `DELETE FROM orders
         WHERE request_id = ANY($1::uuid[])
           AND uid IN (1, 2)
           AND status = 'PENDING'`,
        [requestIds]
      );
    } finally {
      await pool.end();
    }
  });
