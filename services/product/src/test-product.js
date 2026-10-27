const assert = require("node:assert/strict");
const { grpc, product } = require("./infrastructure/grpc-contract");
const {
  client: mongoClient,
  database,
} = require("./infrastructure/database");

const client = new product.ProductService(
  "127.0.0.1:" + (process.env.GRPC_PORT || "50053"),
  grpc.credentials.createInsecure()
);

function rpc(method, input) {
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
    const created = await rpc("createProduct", {
      pname: "San pham kiem thu",
      price: "19.90",
      quantity: 10,
    });

    assert.ok(created.pid > 0);
    assert.equal(created.price, "19.90");
    assert.equal(created.quantity, 10);
    console.log("PASS: Product created.");

    const stored = await database.collection("products")
      .findOne({ pid: created.pid });

    assert.equal(stored.price._bsontype, "Decimal128");
    assert.equal(stored.price.toString(), "19.90");
    console.log("PASS: Price stored as Decimal128.");

    const fetched = await rpc("getProduct", { pid: created.pid });
    assert.deepEqual(fetched, created);
    console.log("PASS: Product retrieved.");

    const list = await rpc("listProducts", {
      page: 1,
      pageSize: 20,
    });

    assert.equal(list.page, 1);
    assert.equal(list.pageSize, 20);
    assert.ok(list.total >= 1);
    assert.ok(list.items.length >= 1);
    assert.ok(list.items.length <= 20);
    console.log("PASS: Product list with pagination.");

    const updated = await rpc("updateProduct", {
      pid: created.pid,
      pname: "San pham da cap nhat",
      price: "24.50",
      quantity: 7,
    });

    assert.equal(updated.pname, "San pham da cap nhat");
    assert.equal(updated.price, "24.50");
    assert.equal(updated.quantity, 7);

    const afterUpdate = await rpc("getProduct", { pid: created.pid });
    assert.deepEqual(afterUpdate, updated);
    console.log("PASS: Product update persisted.");

    await assert.rejects(
      () => rpc("createProduct", {
        pname: "Invalid stock",
        price: "10.00",
        quantity: -1,
      }),
      (error) => error.code === grpc.status.INVALID_ARGUMENT
    );
    console.log("PASS: Negative quantity rejected.");

    await assert.rejects(
      () => rpc("createProduct", {
        pname: "Invalid price",
        price: "10.999",
        quantity: 1,
      }),
      (error) => error.code === grpc.status.INVALID_ARGUMENT
    );
    console.log("PASS: Price with more than 2 decimals rejected.");

    const deleted = await rpc("deleteProduct", { pid: created.pid });
    assert.equal(deleted.pid, created.pid);

    await assert.rejects(
      () => rpc("getProduct", { pid: created.pid }),
      (error) => error.code === grpc.status.NOT_FOUND
    );
    console.log("PASS: Deleted product returns NOT_FOUND.");

    console.log("ALL PRODUCT GRPC CHECKS PASSED");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    client.close();
    await mongoClient.close();
  }
}

main();
