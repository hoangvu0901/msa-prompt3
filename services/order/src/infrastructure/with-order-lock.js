const pool = require("./database");

async function withOrderLock(oid, action) {
  const connection = await pool.connect();
  let broken = false;

  const onError = () => {
    broken = true;
  };
  connection.on("error", onError);

  try {
    await connection.query("BEGIN");
    await connection.query("SET LOCAL lock_timeout = '5s'");

    const result = await connection.query(
      "SELECT * FROM orders WHERE oid = $1 FOR UPDATE",
      [oid]
    );

    if (!result.rows[0]) {
      const error = new Error("Order not found");
      error.kind = "NOT_FOUND";
      throw error;
    }

    const output = await action(connection, result.rows[0]);

    await connection.query("COMMIT");
    return output;
  } catch (error) {
    try {
      await connection.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    connection.removeListener("error", onError);
    connection.release(broken);
  }
}

module.exports = { withOrderLock };
