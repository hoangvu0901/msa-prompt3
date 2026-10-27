const { createHash } = require("node:crypto");

function invalid(message) {
  const error = new Error(message);
  error.kind = "VALIDATION";
  throw error;
}

function positive(value, name) {
  if (!Number.isInteger(value) || value <= 0 || value > 2147483647) {
    invalid("Invalid " + name);
  }
  return value;
}

function money(value, maxWholeDigits = 16) {
  if (typeof value !== "string" ||
      !/^(0|[1-9][0-9]*)\.[0-9]{2}$/.test(value) ||
      value.split(".")[0].length > maxWholeDigits) {
    invalid("Invalid monetary value");
  }
  return value;
}

function minor(value) {
  return BigInt(value.replace(".", ""));
}

function normalizeOrderCreated(event) {
  if (!event || event.eventType !== "OrderCreated" || event.version !== 1) {
    invalid("Unsupported event type or version");
  }

  if (typeof event.eventId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(event.eventId)) {
    invalid("Invalid event ID");
  }

  const data = event.data;
  if (!data || !Array.isArray(data.details) ||
      data.details.length === 0 || data.details.length > 50) {
    invalid("Invalid order details");
  }

  const oid = positive(data.oid, "order ID");
  const uid = positive(data.uid, "customer ID");
  const seen = new Set();

  const details = data.details.map(item => {
    if (!item || typeof item !== "object") invalid("Invalid order item");

    const pid = positive(item.pid, "product ID");
    if (seen.has(pid)) invalid("Duplicate product ID");
    seen.add(pid);

    return {
      pid,
      qty: positive(item.qty, "quantity"),
      unit_price: money(item.unit_price, 8),
    };
  }).sort((a, b) => a.pid - b.pid);

  const snapshot = {
    oid,
    uid,
    details,
    subtotal: money(data.subtotal),
    discount: money(data.discount),
    total_amount: money(data.total_amount),
  };

  const subtotal = details.reduce(
    (sum, item) => sum + minor(item.unit_price) * BigInt(item.qty),
    0n
  );

  if (
    subtotal !== minor(snapshot.subtotal) ||
    minor(snapshot.discount) > subtotal ||
    subtotal - minor(snapshot.discount) !== minor(snapshot.total_amount)
  ) {
    invalid("Order amounts do not match");
  }

  return {
    eventId: event.eventId.toLowerCase(),
    snapshot,
    payloadHash: createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex"),
  };
}

module.exports = { normalizeOrderCreated };
