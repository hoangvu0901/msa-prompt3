const pool = require("./database");

async function createCustomerAccount(data) {
  try {
    const result = await pool.query(
      `INSERT INTO users (username, password, email, phone, roleid)
       SELECT $1, $2, $3, $4, roleid
       FROM roles
       WHERE rolename = 'CUSTOMER'
       RETURNING uid`,
      [
        data.username,
        data.passwordHash,
        data.email,
        data.phone || null,
      ]
    );

    if (result.rowCount !== 1) {
      throw new Error("CUSTOMER role is not configured");
    }

    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      const conflict = new Error("Username or email already exists");
      conflict.kind = "CONFLICT";
      throw conflict;
    }

    throw error;
  }
}

module.exports = { createCustomerAccount };
