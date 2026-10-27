const assert = require("node:assert/strict");
const pool = require("./infrastructure/database");

async function main() {
  try {
    const connection = await pool.query(`
      SELECT
        current_database() AS database,
        current_user AS username
    `);

    assert.equal(connection.rows[0].database, "order_db");
    assert.equal(connection.rows[0].username, "order_user");

    console.log("Database connection:", connection.rows[0]);

    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('orders', 'order_details', 'outbox_events')
      ORDER BY table_name
    `);

    assert.deepEqual(
      tables.rows.map((row) => row.table_name),
      ["order_details", "orders", "outbox_events"]
    );

    console.log("PASS: All three Order tables exist.");

    const constraints = await pool.query(`
      SELECT conrelid::regclass::text AS table_name, conname, contype
      FROM pg_constraint
      WHERE conrelid IN (
        'orders'::regclass,
        'order_details'::regclass,
        'outbox_events'::regclass
      )
    `);

    const required = [
      ["orders", "uq_orders_customer_request", "u"],
      ["orders", "chk_orders_amounts", "c"],
      ["orders", "chk_orders_status", "c"],
      ["order_details", "fk_order_details_order", "f"],
      ["outbox_events", "fk_outbox_order", "f"],
    ];

    for (const [table, name, type] of required) {
      assert.ok(
        constraints.rows.some(
          (row) =>
            row.table_name === table &&
            row.conname === name &&
            row.contype === type
        ),
        "Missing constraint: " + name
      );
    }

    console.log("PASS: Required Order constraints exist.");

    const counts = await pool.query(`
      SELECT 'orders' AS table_name, COUNT(*) AS total
      FROM orders
      UNION ALL
      SELECT 'order_details', COUNT(*)
      FROM order_details
      UNION ALL
      SELECT 'outbox_events', COUNT(*)
      FROM outbox_events
    `);

    console.table(counts.rows);

    console.log("PASS: Order database connection and checks.");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
