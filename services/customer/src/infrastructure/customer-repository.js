const pool = require("./database");

async function findByUid(uid) {
  const result = await pool.query(
    `SELECT c.uid, c.fullname, c.mid, m.mname, m.score
     FROM customers c
     JOIN memberships m ON m.mid = c.mid
     WHERE c.uid = $1`,
    [uid]
  );

  return result.rows[0] || null;
}

async function createIfMissing(data) {
  await pool.query(
    `INSERT INTO customers (uid, fullname, mid)
     SELECT $1, $2, mid
     FROM memberships
     WHERE mname = 'STANDARD'
     ON CONFLICT (uid) DO NOTHING`,
    [data.uid, data.fullname]
  );

  const customer = await findByUid(data.uid);

  if (!customer) {
    throw new Error("Cannot create customer; check STANDARD membership");
  }

  return customer;
}

module.exports = { findByUid, createIfMissing };
