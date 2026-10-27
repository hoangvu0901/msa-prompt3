const assert = require("node:assert/strict");
const { randomUUID, randomInt } = require("node:crypto");
const {
  client,
  database,
  connectDatabase,
} = require("./infrastructure/database");
const {
  handleOrderCreated,
} = require("./application/handle-order-created");

const base = "http://api-gateway:3002";
const eventId = randomUUID();
let shipid;

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

  const data = await response.json();
  return { status: response.status, data };
}

function expect(result, status) {
  assert.equal(
    result.status,
    status,
    "Unexpected HTTP response: " + JSON.stringify(result)
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
  const username = "ship_" + suffix;
  const password = "ShipmentTest_" + suffix;

  const registered = expect(await request(
    "POST", "/api/auth/register", null, {
      username,
      password,
      email: username + "@example.com",
    }
  ), 201);

  assert.ok(Number.isInteger(registered.uid));
  return {
    uid: registered.uid,
    token: await login(username, password),
  };
}

async function main() {
  assert.ok(process.env.BOOTSTRAP_ADMIN_USERNAME, "Missing admin username");
  assert.ok(process.env.BOOTSTRAP_ADMIN_PASSWORD, "Missing admin password");

  await connectDatabase();

  const admin = await login(
    process.env.BOOTSTRAP_ADMIN_USERNAME,
    process.env.BOOTSTRAP_ADMIN_PASSWORD
  );

  const owner = await createCustomer();
  const other = await createCustomer();

  let oid;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomInt(1000000000, 2000000000);
    if (!await database.collection("shipments").findOne({ oid: candidate })) {
      oid = candidate;
      break;
    }
  }
  assert.ok(oid, "Cannot allocate test order ID");

  const created = await handleOrderCreated({
    eventId,
    eventType: "OrderCreated",
    version: 1,
    data: {
      oid,
      uid: owner.uid,
      details: [{ pid: 1, qty: 1, unit_price: "100.00" }],
      subtotal: "100.00",
      discount: "0.00",
      total_amount: "100.00",
    },
  });
  assert.equal(created.created, true);
  shipid = created.shipment.shipid;

  const path = "/api/shipments/" + shipid;
  const statusPath = path + "/status";

  expect(await request("GET", path), 401);
  expect(await request("GET", path, "invalid-token"), 401);
  console.log("PASS: Missing and invalid JWT rejected.");

  const owned = expect(await request("GET", path, owner.token), 200);
  assert.equal(owned.uid, owner.uid);
  assert.equal(owned.shipid, shipid);
  console.log("PASS: Customer can view their own shipment.");

  expect(await request("GET", path, other.token), 403);
  console.log("PASS: Customer cannot view another customer's shipment.");

  expect(await request("GET", path, admin), 200);
  console.log("PASS: Admin can view customer shipment.");

  expect(await request("PATCH", statusPath, owner.token, {
    status: "SHIPPING",
  }), 403);
  expect(await request("PATCH", statusPath, null, {
    status: "SHIPPING",
  }), 401);
  console.log("PASS: Customer and unauthenticated requests cannot update status.");

  expect(await request("PATCH", statusPath, admin, {
    status: "DELIVERED",
  }), 409);
  console.log("PASS: Skipping SHIPPING returns 409.");

  const shipping = expect(await request("PATCH", statusPath, admin, {
    status: "SHIPPING",
  }), 200);
  assert.equal(shipping.status, "SHIPPING");

  const visible = expect(await request("GET", path, owner.token), 200);
  assert.equal(visible.status, "SHIPPING");
  console.log("PASS: Admin update is visible to the owner.");

  expect(await request("PATCH", statusPath, admin, {
    status: "UNKNOWN",
  }), 400);
  expect(await request("PATCH", statusPath, admin, {
    status: "SHIPPING",
    uid: other.uid,
  }), 400);
  expect(await request("GET", "/api/shipments/0", owner.token), 400);
  console.log("PASS: Invalid status, extra fields and invalid ID rejected.");

  const delivered = expect(await request("PATCH", statusPath, admin, {
    status: "DELIVERED",
  }), 200);
  assert.equal(delivered.status, "DELIVERED");

  expect(await request("PATCH", statusPath, admin, {
    status: "DELIVERED",
  }), 200);
  expect(await request("PATCH", statusPath, admin, {
    status: "SHIPPING",
  }), 409);
  console.log("PASS: DELIVERED retry succeeds; backward transition returns 409.");

  const stored = await database.collection("shipments").findOne({ shipid });
  assert.equal(stored.status, "DELIVERED");
  assert.equal(stored.status_history.length, 2);
  console.log("PASS: Status and transition history persisted.");

  const health = expect(await request("GET", "/api/health"), 200);
  assert.equal(health.services.shipment, "UP");
  console.log("PASS: Gateway health includes Shipment.");

  await database.collection("shipments").deleteOne({
    shipid,
    event_id: eventId,
  });
  expect(await request("GET", path, admin), 404);
  console.log("PASS: Missing shipment returns 404.");

  console.log("ALL SHIPMENT REST CUSTOMER/ADMIN CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (shipid) {
        await database.collection("shipments").deleteOne({
          shipid,
          event_id: eventId,
        });
      }
    } finally {
      await client.close();
    }
  });
