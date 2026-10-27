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

let testOid;
let testEventId;

async function main() {
  await connectDatabase();
  const collection = database.collection("shipments");

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomInt(1000000000, 2000000000);
    if (!await collection.findOne({ oid: candidate })) {
      testOid = candidate;
      break;
    }
  }
  assert.ok(testOid, "Cannot allocate test order ID");

  testEventId = randomUUID();

  const event = {
    eventId: testEventId,
    eventType: "OrderCreated",
    version: 1,
    data: {
      oid: testOid,
      uid: 1,
      details: [
        { pid: 1, qty: 2, unit_price: "100.00" },
        { pid: 2, qty: 1, unit_price: "50.00" },
      ],
      subtotal: "250.00",
      discount: "12.50",
      total_amount: "237.50",
    },
  };

  const settled = await Promise.allSettled(
    Array.from({ length: 15 }, () => handleOrderCreated(event))
  );

  const failure = settled.find(result => result.status === "rejected");
  if (failure) throw failure.reason;

  const results = settled.map(result => result.value);
  assert.equal(results.filter(result => result.created).length, 1);
  assert.equal(
    new Set(results.map(result => result.shipment.shipid)).size,
    1
  );
  assert.equal(await collection.countDocuments({ oid: testOid }), 1);
  console.log("PASS: Concurrent events create exactly one shipment.");

  const shipment = results[0].shipment;
  assert.equal(shipment.status, "PENDING");
  assert.equal(shipment.uid, 1);
  assert.deepEqual(shipment.order_snapshot, event.data);
  console.log("PASS: Shipment stores customer and order snapshot.");

  const repeated = await handleOrderCreated(event);
  assert.equal(repeated.created, false);
  assert.equal(repeated.shipment.shipid, shipment.shipid);
  console.log("PASS: Repeated event returns the existing shipment.");

  const anotherEvent = await handleOrderCreated({
    ...event,
    eventId: randomUUID(),
  });
  assert.equal(anotherEvent.created, false);
  assert.equal(anotherEvent.shipment.shipid, shipment.shipid);
  console.log("PASS: Same order with another event ID does not duplicate shipment.");

  await collection.updateOne(
    { shipid: shipment.shipid },
    { $set: { status: "SHIPPING" } }
  );
  assert.equal(
    (await handleOrderCreated(event)).shipment.status,
    "SHIPPING"
  );
  console.log("PASS: Event replay preserves shipment status.");

  await assert.rejects(
    () => handleOrderCreated({
      ...event,
      data: { ...event.data, uid: 2 },
    }),
    error => error.kind === "CONFLICT"
  );
  console.log("PASS: Changed order content is rejected.");

  await assert.rejects(
    () => handleOrderCreated({
      ...event,
      data: { ...event.data, oid: testOid - 1 },
    }),
    error => error.kind === "CONFLICT"
  );
  console.log("PASS: Same event ID cannot create another order's shipment.");

  await assert.rejects(
    () => handleOrderCreated({
      ...event,
      data: { ...event.data, total_amount: "1.00" },
    }),
    error => error.kind === "VALIDATION"
  );
  await assert.rejects(
    () => handleOrderCreated({ ...event, version: 99 }),
    error => error.kind === "VALIDATION"
  );
  console.log("PASS: Invalid amounts and event version rejected.");

  console.log("ALL SHIPMENT EVENT CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (testOid && testEventId) {
        await database.collection("shipments").deleteOne({
          oid: testOid,
          event_id: testEventId,
        });
      }
    } finally {
      await client.close();
    }
  });
