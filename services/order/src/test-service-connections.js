const assert = require("node:assert/strict");
const {
  grpc,
  callCustomer,
  callProduct,
  closeClients,
} = require("./infrastructure/grpc-clients");

async function main() {
  const customerHealth = await callCustomer("healthCheck", {});
  assert.equal(customerHealth.status, "UP");
  assert.equal(customerHealth.database, "connected");
  console.log("PASS: Order connects to Customer Service.");

  const productHealth = await callProduct("healthCheck", {});
  assert.equal(productHealth.status, "UP");
  assert.equal(productHealth.database, "connected");
  console.log("PASS: Order connects to Product Service.");

  const products = await callProduct("listProducts", {
    page: 1,
    pageSize: 5,
  });
  assert.ok(Array.isArray(products.items));
  assert.equal(products.page, 1);
  assert.equal(products.pageSize, 5);
  assert.ok(Number.isInteger(products.total));
  assert.ok(products.total >= 0);
  console.log("PASS: Order reads product list through gRPC.");

  await assert.rejects(
    () => callCustomer("getCustomer", { uid: 0 }),
    error => error.code === grpc.status.INVALID_ARGUMENT
  );
  console.log("PASS: Customer validation errors reach Order.");

  await assert.rejects(
    () => callProduct("reserveStock", {
      pid: 0,
      qty: 1,
      reservationId: "invalid",
    }),
    error => error.code === grpc.status.INVALID_ARGUMENT
  );
  console.log("PASS: Inventory RPC is available to Order.");

  console.log("ALL ORDER SERVICE CONNECTION CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error);
    process.exitCode = 1;
  })
  .finally(closeClients);
