const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const {
  client,
  database,
  connectDatabase,
} = require("./infrastructure/database");
const repository = require("./infrastructure/product-repository");
const {
  reserveStock,
  releaseStock,
} = require("./application/inventory-use-cases");

const created = [];

async function create(quantity = 10) {
  const product = await repository.createProduct({
    pname: "Inventory test " + randomUUID(),
    price: "19.90",
    quantity,
  });
  created.push(product.pid);
  return product;
}

function request(pid, qty = 3) {
  return { pid, qty, reservationId: randomUUID() };
}

async function quantity(pid) {
  return (await repository.getProduct(pid)).quantity;
}

async function expectKind(operation, kind) {
  await assert.rejects(operation, error => error.kind === kind);
}

async function main() {
  await connectDatabase();

  const product = await create();
  const input = request(product.pid);

  const first = await reserveStock(input);
  assert.equal(first.state, "HELD");
  assert.equal(first.unit_price, "19.90");
  assert.equal(await quantity(product.pid), 7);
  console.log("PASS: Reserve decreases available stock.");

  assert.deepEqual(await reserveStock(input), first);
  assert.equal(await quantity(product.pid), 7);
  console.log("PASS: Repeated reserve does not deduct twice.");

  await expectKind(
    () => reserveStock({ ...input, qty: 4 }),
    "CONFLICT"
  );
  console.log("PASS: Same reservation ID with another quantity rejected.");

  await expectKind(
    () => reserveStock(request(product.pid, 8)),
    "OUT_OF_STOCK"
  );
  assert.equal(await quantity(product.pid), 7);
  console.log("PASS: Insufficient stock rejected.");

  await expectKind(
    () => repository.updateProduct(product.pid, {
      pname: "Blocked update",
      price: "25.00",
      quantity: 99,
    }),
    "CONFLICT"
  );
  await expectKind(
    () => repository.deleteProduct(product.pid),
    "CONFLICT"
  );
  console.log("PASS: Update and delete blocked while stock is held.");

  assert.equal((await releaseStock(input)).state, "RELEASED");
  assert.equal(await quantity(product.pid), 10);
  await releaseStock(input);
  assert.equal(await quantity(product.pid), 10);
  console.log("PASS: Release restores stock exactly once.");

  await expectKind(() => reserveStock(input), "CONFLICT");
  console.log("PASS: Released reservation cannot reserve again.");

  const cancelled = request(product.pid, 2);
  await releaseStock(cancelled);
  assert.equal(await quantity(product.pid), 10);
  await expectKind(() => reserveStock(cancelled), "CONFLICT");
  console.log("PASS: Release before reserve prevents a late reservation.");

  const same = request(product.pid, 2);
  const repeated = await Promise.all(
    Array.from({ length: 10 }, () => reserveStock(same))
  );
  assert.ok(repeated.every(result => result.state === "HELD"));
  assert.equal(await quantity(product.pid), 8);
  await Promise.all(
    Array.from({ length: 10 }, () => releaseStock(same))
  );
  assert.equal(await quantity(product.pid), 10);
  console.log("PASS: Concurrent duplicate reserve and release are idempotent.");

  const scarce = await create(5);
  const attempts = Array.from(
    { length: 10 },
    () => request(scarce.pid, 1)
  );
  const results = await Promise.allSettled(
    attempts.map(input => reserveStock(input))
  );
  assert.equal(
    results.filter(result => result.status === "fulfilled").length,
    5
  );
  const failures = results.filter(result => result.status === "rejected");
  assert.ok(failures.every(result => result.reason.kind === "OUT_OF_STOCK"));
  assert.equal(await quantity(scarce.pid), 0);
  await Promise.all(attempts.map(input => releaseStock(input)));
  assert.equal(await quantity(scarce.pid), 5);
  console.log("PASS: Concurrent buyers cannot oversell.");

  const race = request(product.pid, 2);
  const raceResults = await Promise.allSettled([
    reserveStock(race),
    releaseStock(race),
  ]);
  assert.equal(raceResults[1].status, "fulfilled");
  if (raceResults[0].status === "rejected") {
    assert.equal(raceResults[0].reason.kind, "CONFLICT");
  }
  assert.equal(await quantity(product.pid), 10);
  await expectKind(() => reserveStock(race), "CONFLICT");
  console.log("PASS: Concurrent reserve and release end in cancelled state.");

  await expectKind(
    () => reserveStock({ ...request(product.pid), qty: 0 }),
    "VALIDATION"
  );
  await expectKind(
    () => reserveStock({ ...request(product.pid), reservationId: "bad-id" }),
    "VALIDATION"
  );
  console.log("PASS: Invalid reservation input rejected.");

  console.log("ALL INVENTORY CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (created.length) {
        await database.collection("products").deleteMany({
          pid: { $in: created },
        });
      }
    } finally {
      await client.close();
    }
  });
