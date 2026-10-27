const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { grpc, product } = require("./infrastructure/grpc-contract");
const {
  client: mongoClient,
  database,
  connectDatabase,
} = require("./infrastructure/database");

const rpcClient = new product.ProductService(
  "127.0.0.1:" + (process.env.GRPC_PORT || "50053"),
  grpc.credentials.createInsecure()
);

let pid;

function call(method, input) {
  return new Promise((resolve, reject) => {
    rpcClient[method](
      input,
      { deadline: new Date(Date.now() + 10000) },
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
}

async function expectCode(method, input, expected) {
  await assert.rejects(
    () => call(method, input),
    error => error.code === expected
  );
}

async function getQuantity() {
  return (await call("getProduct", { pid })).quantity;
}

async function main() {
  await connectDatabase();

  const created = await call("createProduct", {
    pname: "Inventory RPC test " + randomUUID(),
    price: "125000.00",
    quantity: 10,
  });
  pid = created.pid;

  const input = {
    pid,
    qty: 3,
    reservationId: randomUUID(),
  };

  const reserved = await call("reserveStock", input);
  assert.equal(reserved.pid, pid);
  assert.equal(reserved.qty, 3);
  assert.equal(reserved.reservationId, input.reservationId);
  assert.equal(reserved.state, "HELD");
  assert.equal(reserved.unit_price, "125000.00");
  assert.equal(await getQuantity(), 7);
  console.log("PASS: ReserveStock RPC returns reservation and price snapshot.");

  assert.deepEqual(await call("reserveStock", input), reserved);
  assert.equal(await getQuantity(), 7);
  console.log("PASS: Repeated ReserveStock RPC does not deduct twice.");

  await expectCode(
    "reserveStock",
    { ...input, qty: 4 },
    grpc.status.ALREADY_EXISTS
  );
  console.log("PASS: Changed quantity with same ID returns ALREADY_EXISTS.");

  await expectCode(
    "reserveStock",
    { pid, qty: 8, reservationId: randomUUID() },
    grpc.status.FAILED_PRECONDITION
  );
  assert.equal(await getQuantity(), 7);
  console.log("PASS: Insufficient stock returns FAILED_PRECONDITION.");

  await expectCode(
    "reserveStock",
    { ...input, reservationId: "invalid" },
    grpc.status.INVALID_ARGUMENT
  );
  await expectCode(
    "reserveStock",
    { ...input, qty: 0 },
    grpc.status.INVALID_ARGUMENT
  );
  console.log("PASS: Invalid reservation input returns INVALID_ARGUMENT.");

  await expectCode(
    "updateProduct",
    { pid, pname: "Blocked", price: "1.00", quantity: 100 },
    grpc.status.ALREADY_EXISTS
  );
  await expectCode(
    "deleteProduct",
    { pid },
    grpc.status.ALREADY_EXISTS
  );
  assert.equal(await getQuantity(), 7);
  console.log("PASS: Product update and delete cannot bypass reservation guards.");

  const released = await call("releaseStock", input);
  assert.equal(released.state, "RELEASED");
  assert.equal(await getQuantity(), 10);

  assert.deepEqual(await call("releaseStock", input), released);
  assert.equal(await getQuantity(), 10);
  console.log("PASS: ReleaseStock RPC restores stock exactly once.");

  await expectCode(
    "reserveStock",
    input,
    grpc.status.ALREADY_EXISTS
  );
  console.log("PASS: Released reservation cannot be reused.");

  const cancelled = {
    pid,
    qty: 2,
    reservationId: randomUUID(),
  };
  await call("releaseStock", cancelled);
  await expectCode(
    "reserveStock",
    cancelled,
    grpc.status.ALREADY_EXISTS
  );
  assert.equal(await getQuantity(), 10);
  console.log("PASS: Release before reserve blocks late requests.");

  // Verify persistence directly, using only this test's product.
  const stored = await database.collection("products").findOne({ pid });
  const entry = stored.reservations.find(
    item => item.reservationId === input.reservationId
  );
  assert.equal(entry.state, "RELEASED");
  assert.equal(entry.unit_price, "125000.00");
  assert.equal(stored.quantity, 10);
  console.log("PASS: Reservation state and stock are persisted.");

  console.log("ALL INVENTORY GRPC CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    rpcClient.close();

    try {
      if (pid) {
        // Remove only the product created by this test.
        await database.collection("products").deleteOne({ pid });
      }
    } finally {
      await mongoClient.close();
    }
  });
