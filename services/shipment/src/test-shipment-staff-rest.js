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

  return {
    status: response.status,
    data: await response.json(),
  };
}

function expect(result, status) {
  // Do not include response bodies that might contain tokens.
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
  assert.ok(process.env.BOOTSTRAP_STAFF_USERNAME, "Missing staff username");
  assert.ok(process.env.BOOTSTRAP_STAFF_PASSWORD, "Missing staff password");

  await connectDatabase();

  const staffToken = await login(
    process.env.BOOTSTRAP_STAFF_USERNAME,
    process.env.BOOTSTRAP_STAFF_PASSWORD
  );

  const identity = expect(
    await request("GET", "/api/auth/me", staffToken),
    200
  );
  assert.equal(identity.role, "SHIPMENT_STAFF");
  console.log("PASS: Real staff login returns verified SHIPMENT_STAFF identity.");

  const suffix = randomUUID().replaceAll("-", "");
  const username = "stafftest_" + suffix;
  const password = "CustomerTest_" + suffix;

  const owner = expect(await request(
    "POST", "/api/auth/register", null, {
      username,
      password,
      email: username + "@example.com",
    }
  ), 201);

  assert.ok(Number.isInteger(owner.uid));
  assert.notEqual(Number(identity.uid), owner.uid);

  const ownerToken = await login(username, password);

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

  const viewed = expect(
    await request("GET", path, staffToken),
    200
  );
  assert.equal(viewed.uid, owner.uid);
  console.log("PASS: Staff can view a customer's shipment.");

  expect(await request("PATCH", statusPath, staffToken, {
    status: "DELIVERED",
  }), 409);
  console.log("PASS: Staff cannot skip shipment transitions.");

  const shipping = expect(
    await request("PATCH", statusPath, staffToken, {
      status: "SHIPPING",
    }),
    200
  );
  assert.equal(shipping.status, "SHIPPING");

  const ownerView = expect(
    await request("GET", path, ownerToken),
    200
  );
  assert.equal(ownerView.status, "SHIPPING");
  console.log("PASS: Staff update is visible to the shipment owner.");

  expect(await request("GET", "/api/admin/health", staffToken), 403);
  console.log("PASS: Staff cannot access ADMIN-only route.");

  expect(await request("POST", "/api/products", staffToken, {
    pname: "Unauthorized staff product",
    price: 100,
    quantity: 1,
  }), 403);
  console.log("PASS: Staff cannot create products.");

  expect(await request("POST", "/api/memberships", staffToken, {
    mname: "STAFFTEST",
    score: 100,
  }), 403);
  console.log("PASS: Staff cannot create memberships.");

  const delivered = expect(
    await request("PATCH", statusPath, staffToken, {
      status: "DELIVERED",
    }),
    200
  );
  assert.equal(delivered.status, "DELIVERED");

  expect(await request("PATCH", statusPath, staffToken, {
    status: "DELIVERED",
  }), 200);

  expect(await request("PATCH", statusPath, staffToken, {
    status: "SHIPPING",
  }), 409);

  const stored = await database.collection("shipments").findOne({ shipid });
  assert.equal(stored.status, "DELIVERED");
  assert.equal(stored.status_history.length, 2);
  console.log("PASS: Staff delivery updates persist without duplicate history.");

  console.log("ALL SHIPMENT STAFF REST CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error.message);
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
