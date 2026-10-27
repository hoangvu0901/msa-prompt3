const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");

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
  const data = expect(await request(
    "POST", "/api/auth/login", null, { username, password }
  ), 200);
  assert.ok(data.accessToken);
  return data.accessToken;
}

async function main() {
  const mode = process.argv[2];
  assert.ok(
    ["create", "verify"].includes(mode),
    "Use create or verify mode"
  );

  const admin = await login(
    process.env.BOOTSTRAP_ADMIN_USERNAME,
    process.env.BOOTSTRAP_ADMIN_PASSWORD
  );

  if (mode === "create") {
    const suffix = randomUUID().replaceAll("-", "");
    const username = "worker_" + suffix;
    const password = "WorkerTest_" + suffix;

    expect(await request("POST", "/api/auth/register", null, {
      username,
      password,
      email: username + "@example.com",
    }), 201);

    const customer = await login(username, password);

    const product = expect(await request("POST", "/api/products", admin, {
      pname: "Worker recovery " + suffix,
      price: 100,
      quantity: 10,
    }), 201);

    const accepted = expect(await request(
      "POST", "/api/orders", customer, {
        requestId: randomUUID(),
        items: [{ pid: product.pid, qty: 2 }],
      }
    ), 202);

    const oid = accepted.order.oid;
    assert.equal(accepted.order.status, "PENDING");

    // Ensure the order remains pending while the worker is stopped.
    await delay(5000);

    const order = expect(
      await request("GET", "/api/orders/" + oid, customer),
      200
    );
    assert.equal(order.status, "PENDING");
    assert.equal(order.stock_committed, false);

    const stock = expect(
      await request("GET", "/api/products/" + product.pid, customer),
      200
    );
    assert.equal(stock.quantity, 10);

    expect(await request(
      "GET", "/api/shipments/by-order/" + oid, customer
    ), 404);

    console.log("PASS: API accepts an order while worker is stopped.");
    console.log("PASS: Order remains PENDING; stock is unchanged.");
    console.log("PASS: No shipment exists yet.");
    console.log("RECOVERY_ORDER_ID=" + oid);
    return;
  }

  const oid = Number(process.argv[3]);
  assert.ok(Number.isInteger(oid) && oid > 0, "Provide the test order ID");

  const deadline = Date.now() + 180000;
  let order;
  let shipment;

  do {
    order = expect(
      await request("GET", "/api/orders/" + oid, admin),
      200
    );

    if (["FAILED", "COMPENSATING"].includes(order.status)) {
      throw new Error("Order failed. oid=" + oid);
    }

    if (order.status === "CONFIRMED" && order.stock_committed) {
      const result = await request(
        "GET", "/api/shipments/by-order/" + oid, admin
      );

      if (result.status === 200) {
        shipment = result.data;
        break;
      }
      expect(result, 404);
    }

    await delay(3000);
  } while (Date.now() < deadline);

  assert.equal(order.status, "CONFIRMED");
  assert.equal(order.stock_committed, true);
  assert.ok(shipment, "Shipment was not created within 180 seconds");
  assert.equal(shipment.oid, oid);

  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].qty, 2);

  const product = expect(await request(
    "GET", "/api/products/" + order.items[0].pid, admin
  ), 200);
  assert.equal(product.quantity, 8);

  console.log("PASS: Worker resumes and confirms the pending order.");
  console.log("PASS: Stock is committed and quantity is correct.");
  console.log("PASS: Outbox/Kafka flow creates the shipment.");
  console.table([{
    oid,
    shipid: shipment.shipid,
    order_status: order.status,
    shipment_status: shipment.status,
    quantity: product.quantity,
  }]);
  console.log("ALL WORKER RECOVERY CHECKS PASSED");
}

main().catch(error => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
