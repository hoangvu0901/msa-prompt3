const { discountRateBps } = require("./discount-policy");

// Maximum value of NUMERIC(18,2), expressed in minor units.
const MAX_ORDER_MINOR = 999999999999999999n;

function invalid(message) {
  const error = new Error(message);
  error.kind = "VALIDATION";
  throw error;
}

function priceToMinor(value) {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?$/.test(value)
  ) {
    invalid("Invalid unit price");
  }

  const [whole, fraction = ""] = value.split(".");

  return BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));
}

function formatMinor(value) {
  return (
    (value / 100n).toString() +
    "." +
    (value % 100n).toString().padStart(2, "0")
  );
}

function calculateOrder({ membershipScore, items }) {
  const rateBps = discountRateBps(membershipScore);

  if (!Array.isArray(items) || items.length === 0) {
    invalid("Order must contain at least one item");
  }

  let subtotalMinor = 0n;
  const seen = new Set();
  const details = [];

  for (const item of items) {
    if (
      !item ||
      !Number.isInteger(item.pid) ||
      item.pid <= 0 ||
      item.pid > 2147483647
    ) {
      invalid("Invalid product ID");
    }

    if (seen.has(item.pid)) {
      invalid("Duplicate product ID in order");
    }

    seen.add(item.pid);

    if (
      !Number.isInteger(item.qty) ||
      item.qty <= 0 ||
      item.qty > 2147483647
    ) {
      invalid("Quantity must be a positive integer");
    }

    const unitMinor = priceToMinor(item.unit_price);
    subtotalMinor += unitMinor * BigInt(item.qty);

    if (subtotalMinor > MAX_ORDER_MINOR) {
      invalid("Order amount exceeds database limit");
    }

    details.push({
      pid: item.pid,
      qty: item.qty,
      unit_price: formatMinor(unitMinor),
    });
  }

  // Half-up rounding to the nearest minor currency unit.
  const discountMinor =
    (subtotalMinor * BigInt(rateBps) + 5000n) / 10000n;

  const totalMinor = subtotalMinor - discountMinor;

  return {
    membership_score: membershipScore,
    discount_rate: formatMinor(BigInt(rateBps)),
    subtotal: formatMinor(subtotalMinor),
    discount: formatMinor(discountMinor),
    total_amount: formatMinor(totalMinor),
    details,
  };
}

module.exports = { calculateOrder };
