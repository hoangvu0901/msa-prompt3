const assert = require("node:assert/strict");
const { randomUUID, randomInt } = require("node:crypto");
const { grpc, shipment } = require("./infrastructure/grpc-contract");
const {
  client: mongoClient,
  database,
  connectDatabase,
} = require("./infrastructure/database");
const {
  handleOrderCreated,
} = require("./application/handle-order-created");

const rpc = new shipment.ShipmentService(
  "127.0.0.1:" + (process.env.GRPC_PORT || "50055"),
  grpc.credentials.createInsecure()
);

let testShipid;
const eventId = randomUUID();

function call(method, input) {
  return new Promise((resolve, reject) => {
    rpc[method](
      input,
      { deadline: new Date(Date.now() + 5000) },
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
}

async function expectCode(method, input, code) {
  await assert.rejects(
    () => call(method, input),
    error => error.code === code
  );
}

async function main() {
  await connectDatabase();

  let oid;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomInt(1000000000, 2000000000);
    if (!await database.collection("shipments").findOne({ oid: candidate })) {
      oid = candidate;
      break;
    }
  }
  assert.ok(oid, "Cannot allocate test order ID");

  const event = {
    eventId,
    eventType: "OrderCreated",
    version: 1,
    data: {
      oid,
      uid: 1,
      details: [{ pid: 1, qty: 1, unit_price: "100.00" }],
      subtotal: "100.00",
      discount: "0.00",
      total_amount: "100.00",
    },
  };

  const created = await handleOrderCreated(event);
  assert.equal(created.created, true);
  testShipid = created.shipment.shipid;

  const health = await call("healthCheck", {});
  assert.equal(health.status, "UP");
  assert.equal(health.database, "connected");
  console.log("PASS: Shipment gRPC health check.");

  const initial = await call("getShipment", { shipid: testShipid });
  assert.equal(initial.oid, oid);
  assert.equal(initial.uid, 1);
  assert.equal(initial.status, "PENDING");

  const byOrder = await call("getShipmentByOrder", { oid });
  assert.equal(byOrder.shipid, testShipid);
  console.log("PASS: Shipment retrieved by shipment ID and order ID.");

  await expectCode(
    "updateShipmentStatus",
    { shipid: testShipid, status: "DELIVERED" },
    grpc.status.FAILED_PRECONDITION
  );
  console.log("PASS: Cannot skip SHIPPING.");

  const attempts = await Promise.allSettled([
    call("updateShipmentStatus", { shipid: testShipid, status: "SHIPPING" }),
    call("updateShipmentStatus", { shipid: testShipid, status: "SHIPPING" }),
  ]);
  for (const result of attempts) {
    if (result.status === "rejected") throw result.reason;
    assert.equal(result.value.status, "SHIPPING");
  }

  let stored = await database.collection("shipments").findOne({
    shipid: testShipid,
  });
  assert.equal(stored.status_history.length, 1);
  console.log("PASS: Concurrent SHIPPING requests create one transition.");

  await handleOrderCreated(event);
  assert.equal(
    (await call("getShipment", { shipid: testShipid })).status,
    "SHIPPING"
  );
  console.log("PASS: Order event replay preserves SHIPPING.");

  await call("updateShipmentStatus", {
    shipid: testShipid,
    status: "DELIVERED",
  });
  await call("updateShipmentStatus", {
    shipid: testShipid,
    status: "DELIVERED",
  });

  stored = await database.collection("shipments").findOne({
    shipid: testShipid,
  });
  assert.equal(stored.status, "DELIVERED");
  assert.equal(stored.status_history.length, 2);
  console.log("PASS: DELIVERED is persisted and repeated updates are idempotent.");

  await expectCode(
    "updateShipmentStatus",
    { shipid: testShipid, status: "SHIPPING" },
    grpc.status.FAILED_PRECONDITION
  );
  await expectCode(
    "updateShipmentStatus",
    { shipid: testShipid, status: "UNKNOWN" },
    grpc.status.INVALID_ARGUMENT
  );
  await expectCode(
    "getShipment",
    { shipid: 0 },
    grpc.status.INVALID_ARGUMENT
  );
  console.log("PASS: Backward transition and invalid inputs rejected.");

  await database.collection("shipments").deleteOne({
    shipid: testShipid,
    event_id: eventId,
  });
  await expectCode(
    "getShipment",
    { shipid: testShipid },
    grpc.status.NOT_FOUND
  );
  console.log("PASS: Missing shipment returns NOT_FOUND.");

  console.log("ALL SHIPMENT GRPC CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    rpc.close();
    try {
      if (testShipid) {
        await database.collection("shipments").deleteOne({
          shipid: testShipid,
          event_id: eventId,
        });
      }
    } finally {
      await mongoClient.close();
    }
  });
