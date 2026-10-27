const pool = require("./infrastructure/database");

async function main() {
  try {
    const connection = await pool.query(`
      SELECT
        current_database() AS database,
        current_user AS username
    `);

    console.log("Database connection:", connection.rows[0]);

    const roles = await pool.query(`
      SELECT roleid, rolename
      FROM roles
      ORDER BY roleid
    `);

    console.table(roles.rows);

    const requiredRoles = [
      "ADMIN",
      "CUSTOMER",
      "SHIPMENT_STAFF",
    ];

    const existingRoles = new Set(
      roles.rows.map((role) => role.rolename)
    );

    const missingRoles = requiredRoles.filter(
      (role) => !existingRoles.has(role)
    );

    if (missingRoles.length > 0) {
      throw new Error(
        `Missing roles: ${missingRoles.join(", ")}`
      );
    }

    const users = await pool.query(`
      SELECT COUNT(*) AS total_users
      FROM users
    `);

    console.log("Total users:", users.rows[0].total_users);
    console.log("PASS: Auth database connection and checks.");
  } catch (error) {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();