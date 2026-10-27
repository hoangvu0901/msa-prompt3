const assert = require("node:assert/strict");
const { calculateOrder } = require("./domain/order-pricing");

function calculate(score, items) {
  return calculateOrder({
    membershipScore: score,
    items,
  });
}

function invalid(action) {
  assert.throws(
    action,
    (error) => error.kind === "VALIDATION"
  );
}

function main() {
  const items = [
    { pid: 1, qty: 2, unit_price: "150000.00" },
    { pid: 2, qty: 3, unit_price: "100000.00" },
  ];

  const standard = calculate(0, items);

  assert.equal(standard.subtotal, "600000.00");
  assert.equal(standard.discount_rate, "0.00");
  assert.equal(standard.discount, "0.00");
  assert.equal(standard.total_amount, "600000.00");
  console.log("PASS: Score 0 gives no discount.");

  const silver = calculate(100, items);

  assert.equal(silver.discount_rate, "5.00");
  assert.equal(silver.discount, "30000.00");
  assert.equal(silver.total_amount, "570000.00");
  console.log("PASS: Score 100 gives 5 percent discount.");

  const gold = calculate(500, items);

  assert.equal(gold.discount_rate, "10.00");
  assert.equal(gold.discount, "60000.00");
  assert.equal(gold.total_amount, "540000.00");
  console.log("PASS: Score 500 gives 10 percent discount.");

  assert.equal(calculate(99, items).discount_rate, "0.00");
  assert.equal(calculate(499, items).discount_rate, "5.00");
  console.log("PASS: Discount threshold boundaries.");

  const decimal = calculate(0, [
    { pid: 1, qty: 3, unit_price: "0.10" },
    { pid: 2, qty: 1, unit_price: "0.20" },
  ]);

  assert.equal(decimal.subtotal, "0.50");
  assert.equal(decimal.total_amount, "0.50");
  console.log("PASS: Decimal arithmetic is exact.");

  const rounding = calculate(100, [
    { pid: 1, qty: 1, unit_price: "0.10" },
  ]);

  assert.equal(rounding.discount, "0.01");
  assert.equal(rounding.total_amount, "0.09");
  console.log("PASS: Discount uses half-up rounding.");

  invalid(() => calculate(0, []));
  invalid(() => calculate(0, [
    { pid: 1, qty: 0, unit_price: "10.00" },
  ]));
  invalid(() => calculate(0, [
    { pid: 1, qty: -1, unit_price: "10.00" },
  ]));
  invalid(() => calculate(0, [
    { pid: 1, qty: 1.5, unit_price: "10.00" },
  ]));
  console.log("PASS: Empty order and invalid quantities rejected.");

  invalid(() => calculate(0, [
    { pid: 1, qty: 1, unit_price: "10.00" },
    { pid: 1, qty: 2, unit_price: "10.00" },
  ]));
  console.log("PASS: Duplicate product IDs rejected.");

  invalid(() => calculate(undefined, items));
  invalid(() => calculate(-1, items));
  invalid(() => calculate(0, [
    { pid: 1, qty: 1, unit_price: "10.999" },
  ]));
  console.log("PASS: Invalid score and price rejected.");

  invalid(() => calculate(0, [
    { pid: 1, qty: 2147483647, unit_price: "99999999.99" },
  ]));
  console.log("PASS: Amount exceeding database capacity rejected.");

  assert.deepEqual(silver.details, items);
  assert.equal(silver.membership_score, 100);
  console.log("PASS: Price and membership score snapshots preserved.");

  console.log("ALL ORDER PRICING CHECKS PASSED");
}

try {
  main();
} catch (error) {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
}
