const { database } = require("./database");

const shipments = database.collection("shipments");
const counters = database.collection("counters");

function conflict() {
  const error = new Error("Order or event already exists with different content");
  error.kind = "CONFLICT";
  throw error;
}

async function findExisting(input) {
  const found = await shipments.find({
    $or: [
      { oid: input.snapshot.oid },
      { event_id: input.eventId },
    ],
  }).toArray();

  if (!found.length) return null;

  if (found.some(document =>
    document.oid !== input.snapshot.oid ||
    document.payload_hash !== input.payloadHash
  )) {
    conflict();
  }

  return found[0];
}

async function createFromOrder(input) {
  const existing = await findExisting(input);
  if (existing) return { created: false, shipment: existing };

  const counter = await counters.findOneAndUpdate(
    { _id: "shipment_shipid" },
    { $inc: { seq: 1 } },
    { returnDocument: "after", includeResultMetadata: false }
  );

  if (!counter || !Number.isInteger(counter.seq) ||
      counter.seq <= 0 || counter.seq > 2147483647) {
    throw new Error("Shipment counter is missing or exhausted");
  }

  const document = {
    shipid: counter.seq,
    oid: input.snapshot.oid,
    uid: input.snapshot.uid,
    event_id: input.eventId,
    payload_hash: input.payloadHash,
    order_snapshot: input.snapshot,
    status: "PENDING",
    created_at: new Date(),
    updated_at: new Date(),
  };

  try {
    await shipments.insertOne(document);
    return { created: true, shipment: document };
  } catch (error) {
    if (error.code !== 11000) throw error;

    // Another request may have inserted the shipment concurrently.
    const winner = await findExisting(input);
    if (!winner) throw error;

    return { created: false, shipment: winner };
  }
}

module.exports = { createFromOrder };
