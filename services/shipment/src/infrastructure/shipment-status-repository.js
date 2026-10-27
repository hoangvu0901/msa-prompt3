const { database } = require("./database");

const shipments = database.collection("shipments");

function fail(kind, message) {
  const error = new Error(message);
  error.kind = kind;
  throw error;
}

function toResponse(document) {
  if (!document) fail("NOT_FOUND", "Shipment not found");

  return {
    shipid: document.shipid,
    oid: document.oid,
    uid: document.uid,
    status: document.status,
    created_at: document.created_at.toISOString(),
    updated_at: document.updated_at.toISOString(),
  };
}

async function getShipment(shipid) {
  return toResponse(await shipments.findOne({ shipid }));
}

async function getShipmentByOrder(oid) {
  return toResponse(await shipments.findOne({ oid }));
}

async function updateStatus(shipid, target) {
  const current = await shipments.findOne({ shipid });
  if (!current) fail("NOT_FOUND", "Shipment not found");

  if (current.status === target) return toResponse(current);

  const next = {
    PENDING: "SHIPPING",
    SHIPPING: "DELIVERED",
  };

  if (next[current.status] !== target) {
    fail(
      "CONFLICT",
      "Invalid transition from " + current.status + " to " + target
    );
  }

  const now = new Date();

  const updated = await shipments.findOneAndUpdate(
    { shipid, status: current.status },
    {
      $set: {
        status: target,
        updated_at: now,
      },
      $push: {
        status_history: {
          from: current.status,
          to: target,
          changed_at: now,
        },
      },
    },
    {
      returnDocument: "after",
      includeResultMetadata: false,
    }
  );

  if (updated) return toResponse(updated);

  const latest = await shipments.findOne({ shipid });

  // Another request may have completed the same transition.
  if (latest?.status === target) return toResponse(latest);
  if (!latest) fail("NOT_FOUND", "Shipment not found");

  fail("CONFLICT", "Shipment status changed concurrently; reload shipment");
}

module.exports = { getShipment, getShipmentByOrder, updateStatus };
