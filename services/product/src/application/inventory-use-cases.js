const { database } = require("../infrastructure/database");

const products = database.collection("products");
const MAX_HISTORY = 1000;
const MAX_INT = 2147483647;

function fail(kind, message) {
  const error = new Error(message);
  error.kind = kind;
  throw error;
}

function validate(input) {
  if (!input || !Number.isInteger(input.pid) ||
      input.pid <= 0 || input.pid > MAX_INT) {
    fail("VALIDATION", "Invalid product ID");
  }

  if (!Number.isInteger(input.qty) ||
      input.qty <= 0 || input.qty > MAX_INT) {
    fail("VALIDATION", "Invalid quantity");
  }

  if (typeof input.reservationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(input.reservationId)) {
    fail("VALIDATION", "reservationId must be a UUID");
  }

  return {
    pid: input.pid,
    qty: input.qty,
    reservationId: input.reservationId.toLowerCase(),
  };
}

function response(pid, entry) {
  return {
    pid,
    reservationId: entry.reservationId,
    qty: entry.qty,
    state: entry.state,
    unit_price: entry.unit_price,
  };
}

async function changeInventory(rawInput, release) {
  const input = validate(rawInput);

  for (let attempt = 0; attempt < 50; attempt++) {
    const document = await products.findOne({ pid: input.pid });

    if (!document) fail("NOT_FOUND", "Product not found");

    const history = document.reservations || [];
    const index = history.findIndex(
      entry => entry.reservationId === input.reservationId
    );
    const existing = index >= 0 ? history[index] : null;

    if (existing && existing.qty !== input.qty) {
      fail("CONFLICT", "Reservation ID was used with another quantity");
    }

    if (existing && existing.state === "COMMITTED") {
      if (release) {
        fail("CONFLICT", "Committed reservation cannot be released");
      }
      return response(input.pid, existing);
    }

    if (existing) {
      if (!release && existing.state === "RELEASED") {
        fail("CONFLICT", "Reservation has already been released");
      }

      if ((!release && existing.state === "HELD") ||
          (release && existing.state === "RELEASED")) {
        return response(input.pid, existing);
      }
    }

    if (!existing && history.length >= MAX_HISTORY) {
      fail("CONFLICT", "Reservation history capacity reached");
    }

    if (!release && document.quantity < input.qty) {
      fail("OUT_OF_STOCK", "Insufficient stock");
    }

    // A release arriving before reserve creates a cancellation record.
    // It must not add stock because no stock has been reserved yet.
    let nextQuantity = document.quantity;

    if (!release) nextQuantity -= input.qty;
    if (release && existing?.state === "HELD") {
      nextQuantity += input.qty;
    }

    if (!Number.isInteger(nextQuantity) ||
        nextQuantity < 0 || nextQuantity > MAX_INT) {
      fail("CONFLICT", "Stock quantity exceeds allowed range");
    }

    const entry = {
      reservationId: input.reservationId,
      qty: input.qty,
      state: release ? "RELEASED" : "HELD",
      unit_price: existing
        ? existing.unit_price
        : document.price.toString(),
    };

    const nextHistory = [...history];

    if (index >= 0) nextHistory[index] = entry;
    else nextHistory.push(entry);

    // Compare the values read earlier before committing the change.
    // If another request changed them, reload and retry.
    const result = await products.updateOne(
      {
        _id: document._id,
        quantity: document.quantity,
        price: document.price,
        reservations: document.reservations === undefined
          ? { $exists: false }
          : document.reservations,
      },
      {
        $set: {
          quantity: nextQuantity,
          reservations: nextHistory,
          updated_at: new Date(),
        },
      }
    );

    if (result.matchedCount === 1) {
      return response(input.pid, entry);
    }
  }

  fail("CONFLICT", "Concurrent stock changes; retry with the same reservationId");
}

// COMMIT_STOCK_V1
async function commitStock(rawInput) {
  const input = validate(rawInput);

  for (let attempt = 0; attempt < 50; attempt++) {
    const document = await products.findOne({ pid: input.pid });
    if (!document) fail("NOT_FOUND", "Product not found");

    const history = document.reservations || [];
    const index = history.findIndex(
      entry => entry.reservationId === input.reservationId
    );

    if (index < 0) {
      fail("CONFLICT", "Reservation does not exist");
    }

    const existing = history[index];

    if (existing.qty !== input.qty) {
      fail("CONFLICT", "Reservation quantity does not match");
    }

    if (existing.state === "COMMITTED") {
      return response(input.pid, existing);
    }

    if (existing.state !== "HELD") {
      fail("CONFLICT", "Only HELD reservations can be committed");
    }

    const entry = { ...existing, state: "COMMITTED" };
    const nextHistory = [...history];
    nextHistory[index] = entry;

    const result = await products.updateOne(
      {
        _id: document._id,
        reservations: document.reservations,
      },
      {
        $set: {
          reservations: nextHistory,
          updated_at: new Date(),
        },
      }
    );

    if (result.matchedCount === 1) {
      return response(input.pid, entry);
    }
  }

  fail("CONFLICT", "Concurrent reservation changes; retry the same request");
}

module.exports = {
  commitStock,
  reserveStock: input => changeInventory(input, false),
  releaseStock: input => changeInventory(input, true),
};
