const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({
  max: 1,
  connectionTimeoutMillis: 5000,
});

async function main() {
  const username = process.env.BOOTSTRAP_STAFF_USERNAME;
  const email = process.env.BOOTSTRAP_STAFF_EMAIL;
  const password = process.env.BOOTSTRAP_STAFF_PASSWORD;

  if (
    !username || !email || !password ||
    !/^[a-z0-9_]{3,50}$/.test(username) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new Error("Missing or invalid staff bootstrap credentials");
  }

  const hash = await bcrypt.hash(password, 12);
  const connection = await pool.connect();

  try {
    await connection.query("BEGIN");

    const role = await connection.query(
      "SELECT roleid FROM roles WHERE rolename = $1",
      ["SHIPMENT_STAFF"]
    );

    if (role.rowCount !== 1) {
      throw new Error("SHIPMENT_STAFF role is missing");
    }

    await connection.query(
      `INSERT INTO users (username, password, email, roleid)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      [username, hash, email, role.rows[0].roleid]
    );

    const result = await connection.query(
      `SELECT u.uid, u.email, u.password, r.rolename
       FROM users u
       JOIN roles r ON r.roleid = u.roleid
       WHERE u.username = $1
       FOR UPDATE OF u`,
      [username]
    );

    const user = result.rows[0];

    if (
      !user ||
      user.email !== email ||
      user.rolename !== "SHIPMENT_STAFF" ||
      !await bcrypt.compare(password, user.password)
    ) {
      throw new Error(
        "Existing account does not match staff bootstrap credentials; unchanged"
      );
    }

    await connection.query("COMMIT");

    console.log("PASS: Shipment staff account ready.");
    console.log("uid =", user.uid, "role =", user.rolename);
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

main()
  .catch(error => {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
