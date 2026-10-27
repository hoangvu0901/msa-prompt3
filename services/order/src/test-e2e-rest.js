const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");

const base = process.env.TEST_API_BASE || "http://api-gateway:3002";

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

  return {
    status: response.status,
    data: await response.json(),
    location: response.headers.get("location"),
    stockSource: response.headers.get("x-stock-source"),
  };
}

function expect(result, expected) {
  assert.equal(
    result.status,
    expected,
    "Expected HTTP " + expected + ", received " + result.status
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

async function createCustomer() {
  const suffix = randomUUID().replaceAll("-", "");
  const username = "e2e_" + suffix;
  const password = "E2eCustomer_" + suffix;

  const user = expect(await request(
    "POST", "/api/auth/register", null, {
      username,
      password,
      email: username + "@example.com",
    }
  ), 201);

  assert.ok(Number.isInteger(user.uid));

  return {
    uid: user.uid,
    token: await login(username, password),
  };
}

async function waitForOrder(path, token) {
  const deadline = Date.now() + 120000;
  let lastStatus = "UNKNOWN";

  do {
    const order = expect(await request("GET", path, token), 200);
    lastStatus = order.status;

    if (order.status === "FAILED" || order.status === "COMPENSATING") {
      throw new Error("Order did not succeed: " + path + ", status=" + order.status);
    }

    if (order.status === "CONFIRMED" && order.stock_committed) {
      return order;
    }

    await delay(2000);
  } while (Date.now() < deadline);

  throw new Error("Order processing timeout: " + path + ", last status=" + lastStatus);
}

async function waitForShipment(oid, token) {
  const path = "/api/shipments/by-order/" + oid;
  const deadline = Date.now() + 120000;

  do {
    const result = await request("GET", path, token);

    if (result.status === 200) return result.data;

    assert.equal(
      result.status,
      404,
      "Unexpected shipment lookup HTTP " + result.status
    );

    await delay(2000);
  } while (Date.now() < deadline);

  throw new Error("Shipment creation timeout for oid=" + oid);
}

async function main() {
  for (const name of [
    "BOOTSTRAP_ADMIN_USERNAME",
    "BOOTSTRAP_ADMIN_PASSWORD",
    "BOOTSTRAP_STAFF_USERNAME",
    "BOOTSTRAP_STAFF_PASSWORD",
  ]) {
    assert.ok(process.env[name], "Missing " + name);
  }

  const health = expect(await request("GET", "/api/health"), 200);
  assert.equal(health.status, "UP");
  console.log("PASS: REST services are healthy.");

  const admin = await login(
    process.env.BOOTSTRAP_ADMIN_USERNAME,
    process.env.BOOTSTRAP_ADMIN_PASSWORD
  );
  const staff = await login(
    process.env.BOOTSTRAP_STAFF_USERNAME,
    process.env.BOOTSTRAP_STAFF_PASSWORD
  );

  assert.equal(
    expect(await request("GET", "/api/auth/me", admin), 200).role,
    "ADMIN"
  );
  assert.equal(
    expect(await request("GET", "/api/auth/me", staff), 200).role,
    "SHIPMENT_STAFF"
  );

  const owner = await createCustomer();
  const other = await createCustomer();
  console.log("PASS: Real ADMIN, STAFF and CUSTOMER logins.");

  const membership = expect(await request(
    "POST", "/api/memberships", admin, {
      mname: "E2E_" + randomUUID().replaceAll("-", "").toUpperCase(),
      score: 100,
    }
  ), 201);

  assert.ok(Number.isInteger(membership.mid), "Membership response must contain mid");

  expect(await request(
    "PUT", "/api/customers/" + owner.uid, admin, {
      mid: membership.mid,
    }
  ), 200);
  console.log("PASS: Admin assigns membership with score 100.");

  const suffix = randomUUID();

  const a = expect(await request("POST", "/api/products", admin, {
    pname: "E2E A " + suffix,
    price: 150000,
    quantity: 10,
  }), 201);

  const b = expect(await request("POST", "/api/products", admin, {
    pname: "E2E B " + suffix,
    price: 100000,
    quantity: 10,
  }), 201);

  // Warm the product cache before workers change stock.
  for (const product of [a, b]) {
    expect(await request("GET", "/api/products/" + product.pid, owner.token), 200);
    expect(await request("GET", "/api/products/" + product.pid, owner.token), 200);
  }
  console.log("PASS: Products created and product cache warmed.");

  const body = {
    requestId: randomUUID(),
    items: [
      { pid: a.pid, qty: 2 },
      { pid: b.pid, qty: 3 },
    ],
  };

  const accepted = await request("POST", "/api/orders", owner.token, body);
  assert.ok(
    [201, 202].includes(accepted.status),
    "Unexpected create status: " + accepted.status
  );
  assert.equal(accepted.data.created, true);

  const oid = accepted.data.order.oid;
  const orderPath = "/api/orders/" + oid;
  assert.equal(accepted.location, orderPath);
  console.log("PASS: Order accepted through REST. oid =", oid);

  const order = await waitForOrder(orderPath, owner.token);

  assert.equal(order.uid, owner.uid);
  assert.equal(order.membership_score, 100);
  assert.equal(order.discount_rate, "5.00");
  assert.equal(order.subtotal, "600000.00");
  assert.equal(order.discount, "30000.00");
  assert.equal(order.total_amount, "570000.00");
  assert.deepEqual(order.details, [
    { pid: a.pid, qty: 2, unit_price: "150000.00" },
    { pid: b.pid, qty: 3, unit_price: "100000.00" },
  ]);
  console.log("PASS: Order confirmed with score-based discount and correct details.");

  for (const [product, quantity] of [[a, 8], [b, 7]]) {
    const result = await request(
      "GET", "/api/products/" + product.pid, owner.token
    );
    expect(result, 200);
    assert.equal(result.data.quantity, quantity);
    assert.equal(result.stockSource, "product-service");
  }
  console.log("PASS: REST product stock reflects the order despite warmed caches.");

  const retry = expect(
    await request("POST", "/api/orders", owner.token, body),
    200
  );
  assert.equal(retry.created, false);
  assert.equal(retry.order.oid, oid);

  expect(await request("POST", "/api/orders", owner.token, {
    ...body,
    items: [{ pid: a.pid, qty: 1 }],
  }), 409);
  console.log("PASS: Order retry is idempotent; changed content rejected.");

  const shipment = await waitForShipment(oid, owner.token);
  assert.equal(shipment.oid, oid);
  assert.equal(shipment.uid, owner.uid);
  assert.equal(shipment.status, "PENDING");
  assert.ok(shipment.shipid > 0);
  console.log("PASS: Shipment created asynchronously. shipid =", shipment.shipid);

  const shipmentPath = "/api/shipments/" + shipment.shipid;
  const lookupPath = "/api/shipments/by-order/" + oid;
  const statusPath = shipmentPath + "/status";

  expect(await request("GET", orderPath, other.token), 403);
  expect(await request("GET", shipmentPath, other.token), 403);
  expect(await request("GET", lookupPath, other.token), 403);
  expect(await request("GET", lookupPath), 401);
  expect(await request("GET", "/api/shipments/by-order/0", owner.token), 400);
  expect(await request("GET", lookupPath, admin), 200);
  console.log("PASS: Order and shipment ownership enforced.");

  expect(await request("PATCH", statusPath, owner.token, {
    status: "SHIPPING",
  }), 403);

  expect(await request("PATCH", statusPath, staff, {
    status: "DELIVERED",
  }), 409);

  const shipping = expect(await request("PATCH", statusPath, staff, {
    status: "SHIPPING",
  }), 200);
  assert.equal(shipping.status, "SHIPPING");

  assert.equal(
    expect(await request("GET", lookupPath, owner.token), 200).status,
    "SHIPPING"
  );
  console.log("PASS: Staff starts shipping; customer sees the new status.");

  const delivered = expect(await request("PATCH", statusPath, staff, {
    status: "DELIVERED",
  }), 200);
  assert.equal(delivered.status, "DELIVERED");

  expect(await request("PATCH", statusPath, staff, {
    status: "DELIVERED",
  }), 200);
  expect(await request("PATCH", statusPath, staff, {
    status: "SHIPPING",
  }), 409);

  const finalShipment = expect(
    await request("GET", lookupPath, owner.token),
    200
  );
  assert.equal(finalShipment.shipid, shipment.shipid);
  assert.equal(finalShipment.status, "DELIVERED");
  console.log("PASS: Delivery completed; retry succeeds and reversal is rejected.");

  const finalRetry = expect(
    await request("POST", "/api/orders", owner.token, body),
    200
  );
  assert.equal(finalRetry.order.oid, oid);

  assert.equal(
    expect(await request("GET", lookupPath, owner.token), 200).shipid,
    shipment.shipid
  );

  for (const [product, quantity] of [[a, 8], [b, 7]]) {
    const current = expect(await request(
      "GET", "/api/products/" + product.pid, owner.token
    ), 200);
    assert.equal(current.quantity, quantity);
  }
  console.log("PASS: Final retry preserves order identity, shipment identity and stock.");

  console.table([{
    oid,
    shipid: shipment.shipid,
    order_status: finalRetry.order.status,
    shipment_status: finalShipment.status,
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total_amount,
  }]);

  console.log("ALL REST E2E CHECKS PASSED");
}

main().catch(error => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
