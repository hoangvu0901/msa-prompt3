const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const {
  grpc,
  customer,
  loadContract,
} = require("./infrastructure/grpc-contract");
const pool = require("./infrastructure/database");

const auth = loadContract("auth.proto", "auth");

const authClient = new auth.AuthService(
  "auth-service:50051",
  grpc.credentials.createInsecure()
);

const customerClient = new customer.CustomerService(
  "127.0.0.1:" + (process.env.GRPC_PORT || "50052"),
  grpc.credentials.createInsecure()
);

function rpc(client, method, input) {
  return new Promise((resolve, reject) => {
    client[method](
      input,
      { deadline: Date.now() + 10000 },
      (error, response) => error ? reject(error) : resolve(response)
    );
  });
}

async function main() {
  try {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16);

    const account = await rpc(authClient, "register", {
      username: "customer_" + suffix,
      password: "DemoPass123!",
      email: "customer_" + suffix + "@example.com",
    });

    const uid = account.uid;

    await assert.rejects(
      () => rpc(customerClient, "getCustomer", { uid }),
      (error) => error.code === grpc.status.NOT_FOUND
    );
    console.log("PASS: Missing customer returns NOT_FOUND.");

    const created = await rpc(customerClient, "createCustomer", {
      uid,
      fullname: "Khach hang kiem thu",
    });

    assert.equal(created.uid, uid);
    assert.equal(created.fullname, "Khach hang kiem thu");
    assert.equal(created.mname, "STANDARD");
    assert.equal(created.score, 0);
    console.log("PASS: Customer created with STANDARD membership.");

    const repeated = await rpc(customerClient, "createCustomer", {
      uid,
      fullname: "Ten khong duoc ghi de",
    });

    assert.equal(repeated.fullname, "Khach hang kiem thu");

    const count = await pool.query(
      "SELECT COUNT(*) AS total FROM customers WHERE uid = $1",
      [uid]
    );

    assert.equal(Number(count.rows[0].total), 1);
    console.log("PASS: Repeated creation does not duplicate or overwrite.");

    const fetched = await rpc(customerClient, "getCustomer", { uid });
    assert.deepEqual(fetched, created);
    console.log("PASS: Customer and membership retrieved correctly.");

    await assert.rejects(
      () => rpc(customerClient, "getCustomer", { uid: 0 }),
      (error) => error.code === grpc.status.INVALID_ARGUMENT
    );
    console.log("PASS: Invalid uid rejected.");

    console.log("ALL CUSTOMER CHECKS PASSED");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    authClient.close();
    customerClient.close();
    await pool.end();
  }
}

main();
