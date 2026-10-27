const assert = require("node:assert/strict");
const pool = require("./infrastructure/database");

async function main() {
  try {
    const connection = await pool.query(`
      SELECT
        current_database() AS database,
        current_user AS username
    `);

    assert.equal(connection.rows[0].database, "customer_db");
    assert.equal(connection.rows[0].username, "customer_user");

    console.log("Database connection:", connection.rows[0]);

    const memberships = await pool.query(`
      SELECT mid, mname, score
      FROM memberships
      ORDER BY mid
    `);

    console.table(memberships.rows);

    const standard = memberships.rows.find(
      (membership) => membership.mname === "STANDARD"
    );

    assert.ok(standard, "STANDARD membership is missing");
    assert.equal(standard.score, 0);

    const customers = await pool.query(`
      SELECT COUNT(*) AS total_customers
      FROM customers
    `);

    console.log(
      "Total customers:",
      customers.rows[0].total_customers
    );

    const constraints = await pool.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.customers'::regclass
        AND contype = 'f'
    `);

    assert.ok(
      constraints.rows.some(
        (constraint) => constraint.conname === "fk_customer_membership"
      ),
      "Customer membership foreign key is missing"
    );

    console.log("PASS: Customer database connection and checks.");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
