const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const {
  callCustomer,
  callProduct,
  closeClients,
} = require("./infrastructure/grpc-clients");
const { calculateOrder } = require("./domain/order-pricing");

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

  return {
    status: response.status,
    data: await response.json(),
    location: response.headers.get("location"),
  };
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

async function customer() {
  const suffix = randomUUID().replaceAll("-", "");
  const username = "order_" + suffix;
  const password = "OrderTest_" + suffix;

  const data = expect(await request(
    "POST", "/api/auth/register", null, {
      username,
      password,
      email: username + "@example.com",
    }
  ), 201);

  return { uid: data.uid, token: await login(username, password) };
}

async function main() {
  assert.ok(process.env.BOOTSTRAP_ADMIN_USERNAME);
  assert.ok(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  assert.ok(process.env.BOOTSTRAP_STAFF_USERNAME);
  assert.ok(process.env.BOOTSTRAP_STAFF_PASSWORD);

  const admin = await login(
    process.env.BOOTSTRAP_ADMIN_USERNAME,
    process.env.BOOTSTRAP_ADMIN_PASSWORD
  );
  const staff = await login(
    process.env.BOOTSTRAP_STAFF_USERNAME,
    process.env.BOOTSTRAP_STAFF_PASSWORD
  );
  const owner = await customer();
  const other = await customer();

  const product = expect(await request(
    "POST", "/api/products", admin, {
      pname: "REST Order test " + randomUUID(),
      price: 100,
      quantity: 10,
    }
  ), 201);

  const body = {
    requestId: randomUUID(),
    items: [{ pid: product.pid, qty: 2 }],
  };

  expect(await request("POST", "/api/orders", null, body), 401);
  expect(await request("GET", "/api/orders", "invalid-token"), 401);
  expect(await request("POST", "/api/orders", staff, body), 403);
  expect(await request("POST", "/api/orders", admin, body), 403);
  expect(await request("GET", "/api/orders", staff), 403);
  console.log("PASS: JWT and role restrictions enforced.");

  expect(await request("POST", "/api/orders", owner.token, {
    ...body,
    uid: other.uid,
  }), 400);
  expect(await request("POST", "/api/orders", owner.token, {
    ...body,
    items: [{ pid: product.pid, qty: 2, unit_price: "1.00" }],
  }), 400);
  console.log("PASS: Caller cannot inject customer identity or price.");

  const accepted = await request("POST", "/api/orders", owner.token, body);
  assert.ok([201, 202].includes(accepted.status));
  assert.equal(accepted.data.created, true);
  assert.equal(accepted.data.order.uid, owner.uid);

  const oid = accepted.data.order.oid;
  const path = "/api/orders/" + oid;
  assert.equal(accepted.location, path);
  console.log("PASS: REST order accepted. oid =", oid);

  const retries = await Promise.all(
    Array.from({ length: 4 }, () =>
      request("POST", "/api/orders", owner.token, body)
    )
  );
  for (const result of retries) {
    assert.ok([200, 202].includes(result.status));
    assert.equal(result.data.created, false);
    assert.equal(result.data.order.oid, oid);
  }
  console.log("PASS: Concurrent REST retries return the same order.");

  expect(await request("POST", "/api/orders", owner.token, {
    ...body,
    items: [{ pid: product.pid, qty: 3 }],
  }), 409);
  console.log("PASS: Changed content with the same requestId returns 409.");

  expect(await request("GET", path, owner.token), 200);
  expect(await request("GET", path, admin), 200);
  expect(await request("GET", path, other.token), 403);
  expect(await request("GET", path, staff), 403);
  console.log("PASS: Order ownership and read permissions enforced.");

  const list = expect(
    await request("GET", "/api/orders?page=1&pageSize=20", owner.token),
    200
  );
  assert.ok(list.items.some(item => item.oid === oid));
  assert.ok(list.items.every(item => item.uid === owner.uid));

  const otherList = expect(
    await request("GET", "/api/orders", other.token),
    200
  );
  assert.ok(!otherList.items.some(item => item.oid === oid));

  expect(await request("GET", "/api/orders?pageSize=101", owner.token), 400);
  expect(await request("GET", "/api/orders/0", owner.token), 400);
  console.log("PASS: List filtering and pagination validation.");

  let completed;
  const deadline = Date.now() + 90000;

  do {
    completed = expect(await request("GET", path, owner.token), 200);
    if (completed.status === "FAILED") {
      throw new Error("Order failed; inspect worker logs. oid=" + oid);
    }
    if (completed.status === "CONFIRMED" && completed.stock_committed) break;
    await delay(2000);
  } while (Date.now() < deadline);

  assert.equal(completed.status, "CONFIRMED");
  assert.equal(completed.stock_committed, true);

  const profile = await callCustomer("getCustomer", { uid: owner.uid });
  const expected = calculateOrder({
    membershipScore: profile.score,
    items: [{ pid: product.pid, qty: 2, unit_price: "100.00" }],
  });

  assert.equal(completed.subtotal, expected.subtotal);
  assert.equal(completed.discount, expected.discount);
  assert.equal(completed.total_amount, expected.total_amount);
  assert.deepEqual(completed.details, expected.details);
  console.log("PASS: REST exposes confirmed order with correct totals and details.");

  const repeated = expect(
    await request("POST", "/api/orders", owner.token, body),
    200
  );
  assert.equal(repeated.order.oid, oid);

  const stock = await callProduct("getProduct", { pid: product.pid });
  assert.equal(stock.quantity, 8);
  console.log("PASS: Confirmed REST retry does not deduct stock again.");

  const health = expect(await request("GET", "/api/health"), 200);
  assert.equal(health.services.order, "UP");
  console.log("PASS: Gateway health includes Order.");

  console.log("ALL ORDER REST CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  })
  .finally(closeClients);
