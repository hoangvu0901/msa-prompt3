const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const {
  normalizeOrderRequest,
} = require("./domain/order-request");

function reject(input) {
  assert.throws(
    () => normalizeOrderRequest(input),
    error => error.kind === "VALIDATION"
  );
}

function main() {
  const input = {
    uid: 1,
    requestId: randomUUID(),
    items: [
      { pid: 2, qty: 3 },
      { pid: 1, qty: 2 },
    ],
  };

  const original = JSON.stringify(input);
  const normalized = normalizeOrderRequest(input);

  assert.deepEqual(normalized.items, [
    { pid: 1, qty: 2 },
    { pid: 2, qty: 3 },
  ]);
  assert.match(normalized.requestHash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(input), original);
  console.log("PASS: Request normalized without mutating input.");

  assert.deepEqual(normalizeOrderRequest(input), normalized);
  console.log("PASS: Same request produces the same hash.");

  const reordered = normalizeOrderRequest({
    ...input,
    items: [...input.items].reverse(),
  });
  assert.equal(reordered.requestHash, normalized.requestHash);
  console.log("PASS: Product order does not change request hash.");

  const changed = normalizeOrderRequest({
    ...input,
    items: [{ pid: 1, qty: 9 }, { pid: 2, qty: 3 }],
  });
  assert.notEqual(changed.requestHash, normalized.requestHash);
  console.log("PASS: Changed quantity produces a different hash.");

  const anotherCustomer = normalizeOrderRequest({ ...input, uid: 2 });
  assert.notEqual(anotherCustomer.requestHash, normalized.requestHash);
  console.log("PASS: Customer identity is included in the hash.");

  const uppercase = normalizeOrderRequest({
    ...input,
    requestId: input.requestId.toUpperCase(),
  });
  assert.equal(uppercase.requestId, normalized.requestId);
  console.log("PASS: Request UUID is normalized.");

  reject({ ...input, uid: 0 });
  reject({ ...input, uid: "1" });
  reject({ ...input, requestId: "invalid" });
  console.log("PASS: Invalid customer ID and request ID rejected.");

  reject({ ...input, items: [] });
  reject({
    ...input,
    items: Array.from({ length: 51 }, (_, index) => ({
      pid: index + 1,
      qty: 1,
    })),
  });
  console.log("PASS: Empty and oversized orders rejected.");

  for (const qty of [0, -1, 1.5, "2", 2147483648]) {
    reject({ ...input, items: [{ pid: 1, qty }] });
  }
  reject({ ...input, items: [{ pid: 0, qty: 1 }] });
  console.log("PASS: Invalid product IDs and quantities rejected.");

  reject({
    ...input,
    items: [{ pid: 1, qty: 1 }, { pid: 1, qty: 2 }],
  });
  console.log("PASS: Duplicate product IDs rejected.");

  reject({
    ...input,
    items: [{ pid: 1, qty: 1, unit_price: "1.00" }],
  });
  reject({ ...input, discount: "999.00" });
  reject({ ...input, membershipScore: 500 });
  console.log("PASS: Caller-supplied price, discount and score rejected.");

  console.log("ALL ORDER REQUEST CHECKS PASSED");
}

try {
  main();
} catch (error) {
  console.error("FAIL:", error);
  process.exitCode = 1;
}
