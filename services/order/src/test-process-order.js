const assert = require("node:assert/strict");
const { randomUUID, randomInt } = require("node:crypto");
const pool = require("./infrastructure/database");
const {
  grpc,
  callCustomer,
  callProduct,
  closeClients,
} = require("./infrastructure/grpc-clients");
const {
  acceptOrderRequest,
} = require("./application/accept-order-request");
const {
  processOrder,
  createOrderProcessor,
} = require("./application/process-order");
const { calculateOrder } = require("./domain/order-pricing");

function unavailable() {
  const error = new Error("Simulated interrupted RPC");
  error.code = grpc.status.UNAVAILABLE;
  return error;
}

async function readOrder(oid) {
  return (await pool.query(
    "SELECT * FROM orders WHERE oid = $1", [oid]
  )).rows[0];
}

async function quantity(pid) {
  return (await callProduct("getProduct", { pid })).quantity;
}

async function eventCount(oid) {
  return (await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM outbox_events WHERE aggregate_id = $1`,
    [oid]
  )).rows[0].total;
}

async function main() {
  let uid;

  // Find an unused test customer ID without modifying an existing profile.
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomInt(1000000000, 2000000000);
    try {
      await callCustomer("getCustomer", { uid: candidate });
    } catch (error) {
      if (error.code !== grpc.status.NOT_FOUND) throw error;
      uid = candidate;
      break;
    }
  }
  assert.ok(uid, "Cannot allocate test customer ID");

  const customer = await callCustomer("createCustomer", {
    uid,
    fullname: "Order integration test " + randomUUID(),
  });

  const suffix = randomUUID();
  const a = await callProduct("createProduct", {
    pname: "Order test A " + suffix,
    price: "100.00",
    quantity: 10,
  });
  const b = await callProduct("createProduct", {
    pname: "Order test B " + suffix,
    price: "50.00",
    quantity: 10,
  });
  const empty = await callProduct("createProduct", {
    pname: "Order test empty " + suffix,
    price: "20.00",
    quantity: 0,
  });

  async function pending(items) {
    return (await acceptOrderRequest({
      uid,
      requestId: randomUUID(),
      items,
    })).order;
  }

  const success = await pending([
    { pid: a.pid, qty: 2 },
    { pid: b.pid, qty: 1 },
  ]);

  const concurrent = await Promise.allSettled(
    Array.from({ length: 3 }, () => processOrder(success.oid))
  );
  for (const result of concurrent) {
    if (result.status === "rejected") throw result.reason;
    assert.equal(result.value.status, "CONFIRMED");
  }

  assert.equal(await quantity(a.pid), 8);
  assert.equal(await quantity(b.pid), 9);
  assert.equal(await eventCount(success.oid), 1);
  console.log("PASS: Concurrent processing confirms one order and one event.");

  const stored = await readOrder(success.oid);
  const expected = calculateOrder({
    membershipScore: customer.score,
    items: [
      { pid: a.pid, qty: 2, unit_price: "100.00" },
      { pid: b.pid, qty: 1, unit_price: "50.00" },
    ],
  });
  assert.equal(stored.subtotal, "250.00");
  assert.equal(stored.membership_score, customer.score);
  assert.equal(stored.discount, expected.discount);
  assert.equal(stored.total_amount, expected.total_amount);

  const details = (await pool.query(
    `SELECT pid, qty, unit_price
     FROM order_details WHERE oid = $1 ORDER BY pid`,
    [success.oid]
  )).rows;
  assert.deepEqual(details, expected.details);

  const event = (await pool.query(
    "SELECT payload, published_at FROM outbox_events WHERE aggregate_id = $1",
    [success.oid]
  )).rows[0];
  assert.deepEqual(event.payload.data.details, expected.details);
  assert.equal(event.payload.data.total_amount, stored.total_amount);
  assert.equal(event.published_at, null);
  console.log("PASS: Prices, score, totals, details and unpublished event persisted.");

  await processOrder(success.oid);
  assert.equal(await quantity(a.pid), 8);
  assert.equal(await eventCount(success.oid), 1);
  console.log("PASS: Confirmed order retry does not reserve or publish twice.");

  const failed = await pending([
    { pid: a.pid, qty: 1 },
    { pid: empty.pid, qty: 1 },
  ]);
  assert.equal((await processOrder(failed.oid)).status, "FAILED");
  assert.equal(await quantity(a.pid), 8);
  assert.equal(await eventCount(failed.oid), 0);
  assert.equal((await pool.query(
    "SELECT COUNT(*)::int AS total FROM order_details WHERE oid = $1",
    [failed.oid]
  )).rows[0].total, 0);
  console.log("PASS: Later stock failure restores earlier reservation.");

  const interrupted = await pending([{ pid: a.pid, qty: 1 }]);
  let dropReply = true;
  const loseReserveReply = createOrderProcessor({
    callProduct: async (method, input) => {
      const result = await callProduct(method, input);
      if (method === "reserveStock" && dropReply) {
        dropReply = false;
        throw unavailable();
      }
      return result;
    },
  });

  await assert.rejects(
    () => loseReserveReply(interrupted.oid),
    error => error.code === grpc.status.UNAVAILABLE
  );
  assert.equal((await readOrder(interrupted.oid)).status, "PENDING");
  assert.equal(await quantity(a.pid), 7);

  assert.equal((await processOrder(interrupted.oid)).status, "CONFIRMED");
  assert.equal(await quantity(a.pid), 7);
  assert.equal(await eventCount(interrupted.oid), 1);
  console.log("PASS: Lost reservation reply can be retried without double deduction.");

  const compensating = await pending([
    { pid: a.pid, qty: 1 },
    { pid: empty.pid, qty: 1 },
  ]);
  let interruptRelease = true;
  const failRelease = createOrderProcessor({
    callProduct: async (method, input) => {
      if (method === "releaseStock" && interruptRelease) {
        interruptRelease = false;
        throw unavailable();
      }
      return callProduct(method, input);
    },
  });

  await assert.rejects(
    () => failRelease(compensating.oid),
    error => error.code === grpc.status.UNAVAILABLE
  );
  assert.equal(
    (await readOrder(compensating.oid)).status,
    "COMPENSATING"
  );
  assert.equal(await quantity(a.pid), 6);

  assert.equal(
    (await processOrder(compensating.oid)).status,
    "FAILED"
  );
  assert.equal(await quantity(a.pid), 7);
  assert.equal(await eventCount(compensating.oid), 0);
  console.log("PASS: Interrupted compensation resumes and restores stock.");

  console.table([
    { oid: success.oid, expected: "CONFIRMED" },
    { oid: failed.oid, expected: "FAILED" },
    { oid: interrupted.oid, expected: "CONFIRMED" },
    { oid: compensating.oid, expected: "FAILED" },
  ]);

  console.log("ALL ORDER PROCESSING CHECKS PASSED");
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
