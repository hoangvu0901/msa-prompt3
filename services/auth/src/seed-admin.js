const bcrypt = require("bcryptjs");
const pool = require("./infrastructure/database");

async function main() {
  let connection;
  let transactionStarted = false;

  try {
    const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

    if (
      !username ||
      !email ||
      !password ||
      password.length < 12 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      throw new Error("Missing or invalid bootstrap credentials");
    }

    connection = await pool.connect();
    await connection.query("BEGIN");
    transactionStarted = true;

    const existing = await connection.query(
      `SELECT u.uid, u.email, u.password, r.rolename
       FROM users u
       JOIN roles r ON r.roleid = u.roleid
       WHERE u.username = $1`,
      [username]
    );

    if (existing.rowCount > 0) {
      const user = existing.rows[0];

      if (user.rolename !== "ADMIN" || user.email !== email) {
        throw new Error("Username already belongs to another account");
      }

      if (!(await bcrypt.compare(password, user.password))) {
        throw new Error("Existing admin password differs from local credentials");
      }

      await connection.query("COMMIT");
      transactionStarted = false;

      console.log("PASS: Admin already exists. uid =", user.uid);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await connection.query(
      `INSERT INTO users (username, email, password, roleid)
       SELECT $1, $2, $3, roleid
       FROM roles
       WHERE rolename = 'ADMIN'
       RETURNING uid`,
      [username, email, passwordHash]
    );

    if (result.rowCount !== 1) {
      throw new Error("ADMIN role is missing");
    }

    await connection.query("COMMIT");
    transactionStarted = false;

    console.log("PASS: Admin created. uid =", result.rows[0].uid);
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.query("ROLLBACK");
    }

    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

main();
