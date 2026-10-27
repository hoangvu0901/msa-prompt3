const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const pool = require("./infrastructure/database");

const base = "http://api-gateway:3002";

async function request(method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  return { status: response.status, data: await response.json() };
}

function expect(result, status) {
  assert.equal(
    result.status,
    status,
    "Expected HTTP " + status + ", received " + result.status
  );
  return result.data;
}

async function login(username, password) {
  const result = expect(await request(
    "POST", "/api/auth/login", null, { username, password }
  ), 200);
  assert.ok(result.accessToken);
  return result.accessToken;
}

async function main() {
  assert.ok(process.env.BOOTSTRAP_ADMIN_USERNAME);
  assert.ok(process.env.BOOTSTRAP_ADMIN_PASSWORD);

  const admin = await login(
    process.env.BOOTSTRAP_ADMIN_USERNAME,
    process.env.BOOTSTRAP_ADMIN_PASSWORD
  );

  const suffix = randomUUID().replaceAll("-", "");
  const username = "outage_" + suffix;
  const password = "OutageTest_" + suffix;

  const customer = expect(await request(
    "POST", "/api/auth/register", null, {
      username,
      password,
      email: username + "@example.com",
    }
  ), 201);

  const token = await login(username, password);

  const product = expect(await request(
    "POST", "/api/products", admin, {
      pname: "Kafka outage test " + suffix,
      price: 100,
      quantity: 10,
    }
  ), 201);

  const accepted = await request(
    "POST", "/api/orders", token, {
      requestId: randomUUID(),
      items: [{ pid: product.pid, qty: 2 }],
    }
  );
  assert.ok(
    [201, 202].includes(accepted.status),
    "Unexpected create status: " + accepted.status
  );

  const oid = accepted.data.order.oid;
  console.log("Created outage test order. oid =", oid);

  let order;
  const deadline = Date.now() + 120000;

  do {
    order = expect(
      await request("GET", "/api/orders/" + oid, token),
      200
    );

    if (["FAILED", "COMPENSATING"].includes(order.status)) {
      throw new Error("Order failed. oid=" + oid);
    }

    if (order.status === "CONFIRMED" && order.stock_committed) break;
    await delay(2000);
  } while (Date.now() < deadline);

  assert.equal(order.status, "CONFIRMED");
  assert.equal(order.stock_committed, true);
  assert.equal(order.uid, customer.uid);
  console.log("PASS: Order confirms and commits stock while Kafka is stopped.");

  const stock = expect(
    await request("GET", "/api/products/" + product.pid, token),
    200
  );
  assert.equal(stock.quantity, 8);
  console.log("PASS: Stock is deducted correctly.");

  const result = await pool.query(
    `SELECT event_id, aggregate_id, published_at, attempts
     FROM outbox_events
     WHERE aggregate_id = $1`,
    [oid]
  );

  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].published_at, null);
  console.log("PASS: Event remains unpublished in Outbox.");

  expect(
    await request("GET", "/api/shipments/by-order/" + oid, token),
    404
  );
  console.log("PASS: Shipment has not been created before event delivery.");

  console.table([{
    oid,
    pid: product.pid,
    event_id: result.rows[0].event_id,
    published_at: result.rows[0].published_at,
  }]);

  console.log("ALL KAFKA OUTAGE CREATION CHECKS PASSED");
  console.log("Save this order ID for the recovery check:", oid);
}

main()
  .catch(error => {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
