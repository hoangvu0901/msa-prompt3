const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const {
  client,
  database,
  connectDatabase,
} = require("./infrastructure/database");

async function main() {
  await connectDatabase();

  const collection = database.collection("shipments");
  const eventId = "65f64c34-874a-42e0-9958-2db80c7b302a";
  const deadline = Date.now() + 30000;
  let shipment;

  do {
    shipment = await collection.findOne({ event_id: eventId });
    if (shipment) break;
    await delay(500);
  } while (Date.now() < deadline);

  assert.ok(shipment, "Shipment for order 21 was not found within 30 seconds");
  assert.equal(shipment.oid, 21);
  assert.equal(shipment.uid, 1082470203);
  assert.ok(Number.isInteger(shipment.shipid) && shipment.shipid > 0);
  console.log("PASS: Kafka event for order 21 produced a shipment.");

  assert.equal(await collection.countDocuments({ oid: 21 }), 1);
  assert.equal(await collection.countDocuments({ event_id: eventId }), 1);
  console.log("PASS: Exactly one shipment exists for this order and event.");

  assert.equal(shipment.order_snapshot.subtotal, "250.00");
  assert.equal(shipment.order_snapshot.discount, "0.00");
  assert.equal(shipment.order_snapshot.total_amount, "250.00");
  assert.deepEqual(shipment.order_snapshot.details, [
    { pid: 9, qty: 2, unit_price: "100.00" },
    { pid: 10, qty: 1, unit_price: "50.00" },
  ]);
  console.log("PASS: Shipment snapshot matches the published order.");

  const documents = await collection.find(
    {},
    { projection: { _id: 0, shipid: 1, oid: 1, status: 1 } }
  ).sort({ shipid: 1 }).limit(20).toArray();

  console.table(documents);
  console.log("ALL SHIPMENT KAFKA CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error);
    process.exitCode = 1;
  })
  .finally(() => client.close());
