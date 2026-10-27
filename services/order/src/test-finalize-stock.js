const assert = require("node:assert/strict");
const pool = require("./infrastructure/database");
const {
  grpc,
  callProduct,
  closeClients,
} = require("./infrastructure/grpc-clients");
const {
  finalizeOrderStock,
  createStockFinalizer,
} = require("./application/finalize-order-stock");

async function main() {
  const ids = process.argv.slice(2).map(Number);
  assert.ok(ids.length > 0, "Pass at least one confirmed order ID");
  assert.ok(ids.every(id => Number.isInteger(id) && id > 0));

  for (const oid of ids) {
    const order = (await pool.query(
      "SELECT * FROM orders WHERE oid = $1", [oid]
    )).rows[0];

    assert.ok(order, "Order not found: " + oid);
    assert.equal(order.status, "CONFIRMED");

    const before = new Map();

    for (const item of order.request_items) {
      const product = await callProduct("getProduct", { pid: item.pid });
      before.set(item.pid, product.quantity);
    }

    if (!order.stock_committed_at) {
      let interrupted = false;

      const loseCommitReply = createStockFinalizer({
        callProduct: async (method, input) => {
          const result = await callProduct(method, input);

          if (method === "commitStock" && !interrupted) {
            interrupted = true;
            const error = new Error("Simulated lost CommitStock reply");
            error.code = grpc.status.UNAVAILABLE;
            throw error;
          }

          return result;
        },
      });

      await assert.rejects(
        () => loseCommitReply(oid),
        error => error.code === grpc.status.UNAVAILABLE
      );

      const pending = (await pool.query(
        "SELECT stock_committed_at FROM orders WHERE oid = $1",
        [oid]
      )).rows[0];
      assert.equal(pending.stock_committed_at, null);
      console.log("PASS: Lost commit reply leaves finalization retryable. oid =", oid);
    } else {
      console.log("SKIP: Lost reply simulation; order already finalized. oid =", oid);
    }

    const results = await Promise.allSettled([
      finalizeOrderStock(oid),
      finalizeOrderStock(oid),
    ]);

    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
      assert.ok(result.value.stock_committed_at);
    }

    console.log("PASS: Concurrent finalization completes. oid =", oid);

    for (const item of order.request_items) {
      const input = {
        pid: item.pid,
        qty: item.qty,
        reservationId: order.reservation_id,
      };

      const committed = await callProduct("commitStock", input);
      assert.equal(committed.state, "COMMITTED");

      assert.deepEqual(
        await callProduct("commitStock", input),
        committed
      );

      await assert.rejects(
        () => callProduct("releaseStock", input),
        error => error.code === grpc.status.ALREADY_EXISTS
      );

      await assert.rejects(
        () => callProduct("commitStock", {
          ...input,
          qty: input.qty === 1 ? 2 : 1,
        }),
        error => error.code === grpc.status.ALREADY_EXISTS
      );

      // Repeating reserve after commit must not deduct again.
      const repeated = await callProduct("reserveStock", input);
      assert.equal(repeated.state, "COMMITTED");

      const product = await callProduct("getProduct", { pid: item.pid });
      assert.equal(product.quantity, before.get(item.pid));
    }

    console.log("PASS: Commit retries preserve stock; release and changed quantity rejected.");

    await finalizeOrderStock(oid);

    const saved = (await pool.query(
      "SELECT status, stock_committed_at FROM orders WHERE oid = $1",
      [oid]
    )).rows[0];
    assert.equal(saved.status, "CONFIRMED");
    assert.ok(saved.stock_committed_at);

    console.log("PASS: Finalization timestamp is persisted. oid =", oid);
  }

  console.log("ALL STOCK FINALIZATION CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    closeClients();
    await pool.end();
  });
