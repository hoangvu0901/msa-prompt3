const { createHash } = require("node:crypto");

const MAX_INT = 2147483647;
const MAX_ITEMS = 50;

function invalid(message) {
  const error = new Error(message);
  error.kind = "VALIDATION";
  throw error;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value <= 0 || value > MAX_INT) {
    invalid(field + " must be a positive integer");
  }
  return value;
}

function normalizeOrderRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    invalid("Order request must be an object");
  }

  const allowed = new Set(["uid", "requestId", "items"]);
  if (Object.keys(input).some(key => !allowed.has(key))) {
    invalid("Unknown order field");
  }

  const uid = positiveInteger(input.uid, "uid");

  if (
    typeof input.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(input.requestId)
  ) {
    invalid("requestId must be a UUID");
  }

  if (
    !Array.isArray(input.items) ||
    input.items.length === 0 ||
    input.items.length > MAX_ITEMS
  ) {
    invalid("Order must contain between 1 and 50 products");
  }

  const seen = new Set();

  const items = input.items.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      invalid("Invalid order item");
    }

    if (Object.keys(item).some(key => key !== "pid" && key !== "qty")) {
      invalid("Order item accepts only pid and qty");
    }

    const pid = positiveInteger(item.pid, "pid");
    const qty = positiveInteger(item.qty, "qty");

    if (seen.has(pid)) invalid("Duplicate product ID");
    seen.add(pid);

    return { pid, qty };
  });

  items.sort((a, b) => a.pid - b.pid);

  const requestId = input.requestId.toLowerCase();

  const requestHash = createHash("sha256")
    .update(JSON.stringify({
      version: 1,
      uid,
      items,
    }))
    .digest("hex");

  return {
    uid,
    requestId,
    requestHash,
    items,
  };
}

module.exports = { normalizeOrderRequest };
