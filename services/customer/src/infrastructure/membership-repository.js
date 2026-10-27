const pool = require("./database");

async function listMemberships() {
  const result = await pool.query(
    "SELECT mid, mname, score FROM memberships ORDER BY mid"
  );

  return { items: result.rows };
}

async function createMembership(data) {
  try {
    const result = await pool.query(
      `INSERT INTO memberships (mname, score)
       VALUES ($1, $2)
       RETURNING mid, mname, score`,
      [data.mname, data.score]
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      const conflict = new Error("Membership name already exists");
      conflict.kind = "CONFLICT";
      throw conflict;
    }

    throw error;
  }
}

async function updateMembershipScore(mid, score) {
  const result = await pool.query(
    `UPDATE memberships
     SET score = $2
     WHERE mid = $1
     RETURNING mid, mname, score`,
    [mid, score]
  );

  if (result.rowCount === 0) {
    const error = new Error("Membership not found");
    error.kind = "NOT_FOUND";
    throw error;
  }

  return result.rows[0];
}

module.exports = {
  listMemberships,
  createMembership,
  updateMembershipScore,
};
