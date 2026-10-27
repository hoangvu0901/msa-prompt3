const pool = require("./database");

async function findByUsername(username) {
  const result = await pool.query(
    `SELECT u.uid, u.username, u.password, r.rolename
     FROM users u
     JOIN roles r ON r.roleid = u.roleid
     WHERE u.username = $1`,
    [username]
  );

  return result.rows[0] || null;
}

module.exports = { findByUsername };
