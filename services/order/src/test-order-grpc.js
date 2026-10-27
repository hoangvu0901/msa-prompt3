const assert = require("node:assert/strict");
const { randomUUID, randomInt } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");

const { grpc, order } = require("./infrastructure/grpc-contract");
const {
  callCustomer,
  callProduct,
  closeClients,
} = require("./infrastructure/grpc-clients");
const { calculateOrder } = require("./domain/order-pricing");

const client = new order.OrderService(
  "127.0.0.1:" + (process.env.GRPC_PORT || "50054"),
  grpc.credentials.createInsecure()
);

function call(method, input) {
  return new Promise((resolve, reject) => {
    client[method](
      input,
      { deadline: Date.now() + 10000 },
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
}

async function expectCode(method, input, code) {
  await assert.rejects(
    () => call(method, input),
    error => error.code === code
  );
}

async function main() {
  let uid;

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomInt(1000000000, 1900000000);

    try {
      await callCustomer("getCustomer", { uid: candidate });
    } catch (error) {
      if (error.code !== grpc.status.NOT_FOUND) throw error;
      uid = candidate;
      break;
    }
  }

  assert.ok(uid, "Cannot allocate test customer ID");

  const customer = await callCustomer("createCustomer", {
    uid,
    fullname: "Order gRPC test " + randomUUID(),
  });

  const product = await callProduct("createProduct", {
    pname: "Order gRPC product " + randomUUID(),
    price: "100.00",
    quantity: 10,
  });

  const actor = { uid, role: "CUSTOMER" };
  const otherCustomer = { uid: uid + 1, role: "CUSTOMER" };
  const admin = { uid: 1, role: "ADMIN" };
  const staff = { uid: 1, role: "SHIPMENT_STAFF" };

  const request = {
    actor,
    requestId: randomUUID(),
    items: [{ pid: product.pid, qty: 2 }],
  };

  const created = await call("createOrder", request);
  assert.equal(created.created, true);
  assert.equal(created.order.uid, uid);
  assert.equal(created.order.requestId, request.requestId);
  assert.ok(created.order.oid > 0);

  const oid = created.order.oid;
  console.log("PASS: CreateOrder accepts a new request. oid =", oid);

  const concurrent = await Promise.allSettled(
    Array.from({ length: 5 }, () => call("createOrder", request))
  );

  for (const result of concurrent) {
    if (result.status === "rejected") throw result.reason;
    assert.equal(result.value.created, false);
    assert.equal(result.value.order.oid, oid);
  }
  console.log("PASS: Concurrent retries return the same order.");

  await expectCode(
    "createOrder",
    {
      ...request,
      items: [{ pid: product.pid, qty: 3 }],
    },
    grpc.status.ALREADY_EXISTS
  );
  console.log("PASS: Changed content with the same request ID rejected.");

  const own = await call("getOrder", { actor, oid });
  assert.equal(own.uid, uid);

  await expectCode(
    "getOrder",
    { actor: otherCustomer, oid },
    grpc.status.PERMISSION_DENIED
  );

  const adminView = await call("getOrder", { actor: admin, oid });
  assert.equal(adminView.oid, oid);
  console.log("PASS: Owner and ADMIN can read; another customer cannot.");

  await expectCode(
    "getOrder",
    { actor: staff, oid },
    grpc.status.PERMISSION_DENIED
  );
  await expectCode(
    "listOrders",
    { actor: staff, page: 1, pageSize: 20 },
    grpc.status.PERMISSION_DENIED
  );
  await expectCode(
    "createOrder",
    { ...request, actor: staff },
    grpc.status.PERMISSION_DENIED
  );
  await expectCode(
    "createOrder",
    { ...request, actor: admin },
    grpc.status.PERMISSION_DENIED
  );
  console.log("PASS: Staff cannot use Order APIs; creation requires CUSTOMER.");

  const list = await call("listOrders", {
    actor,
    page: 1,
    pageSize: 20,
  });
  assert.ok(list.items.some(item => item.oid === oid));
  assert.ok(list.items.every(item => item.uid === uid));
  assert.ok(list.total >= 1);
  console.log("PASS: Customer list contains only their own orders.");

  const otherList = await call("listOrders", {
    actor: otherCustomer,
    page: 1,
    pageSize: 20,
  });
  assert.ok(otherList.items.every(item => item.uid === otherCustomer.uid));
  assert.ok(!otherList.items.some(item => item.oid === oid));
  console.log("PASS: Another customer's list excludes the order.");

  await expectCode(
    "getOrder",
    { actor, oid: 0 },
    grpc.status.INVALID_ARGUMENT
  );
  await expectCode(
    "listOrders",
    { actor, page: 1, pageSize: 101 },
    grpc.status.INVALID_ARGUMENT
  );
  await expectCode(
    "createOrder",
    { actor, requestId: randomUUID(), items: [] },
    grpc.status.INVALID_ARGUMENT
  );
  console.log("PASS: Invalid ID, pagination and empty order rejected.");

  // Wait for the real recovery worker to process and finalize this order.
  let completed;
  const deadline = Date.now() + 60000;

  do {
    completed = await call("getOrder", { actor, oid });

    if (completed.status === "FAILED") {
      throw new Error("Test order failed; inspect order-worker logs. oid=" + oid);
    }

    if (completed.status === "CONFIRMED" && completed.stock_committed) {
      break;
    }

    await delay(1000);
  } while (Date.now() < deadline);

  assert.equal(completed.status, "CONFIRMED");
  assert.equal(
    completed.stock_committed,
    true,
    "Worker did not finalize stock within the test window"
  );

  const expected = calculateOrder({
    membershipScore: customer.score,
    items: [{ pid: product.pid, qty: 2, unit_price: "100.00" }],
  });

  assert.equal(completed.subtotal, expected.subtotal);
  assert.equal(completed.discount, expected.discount);
  assert.equal(completed.total_amount, expected.total_amount);
  assert.equal(completed.membership_score, customer.score);
  assert.deepEqual(completed.details, expected.details);
  console.log("PASS: Worker confirms order with correct prices, score and totals.");

  const completedList = await call("listOrders", {
    actor,
    page: 1,
    pageSize: 20,
  });
  const listed = completedList.items.find(item => item.oid === oid);
  assert.ok(listed);
  assert.equal(listed.subtotal, expected.subtotal);
  assert.equal(listed.total_amount, expected.total_amount);
  assert.deepEqual(listed.details, expected.details);
  console.log("PASS: List API preserves monetary strings and order details.");

  const retry = await call("createOrder", request);
  assert.equal(retry.created, false);
  assert.equal(retry.order.oid, oid);
  assert.equal(retry.order.status, "CONFIRMED");

  const remaining = await callProduct("getProduct", { pid: product.pid });
  assert.equal(remaining.quantity, 8);
  console.log("PASS: Confirmed order retry does not deduct stock again.");

  console.log("ALL ORDER GRPC CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    client.close();
    closeClients();
  });
