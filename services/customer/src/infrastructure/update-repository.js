const pool = require("./database");
const { findByUid } = require("./customer-repository");

async function updateCustomerRecord(data) {
  try {
    const result = await pool.query(
      `UPDATE customers
       SET fullname = CASE WHEN $2::boolean THEN $3 ELSE fullname END,
           mid = CASE WHEN $4::boolean THEN $5::integer ELSE mid END,
           updated_at = CURRENT_TIMESTAMP
       WHERE uid = $1
       RETURNING uid`,
      [
        data.uid,
        data.updateFullname,
        data.fullname,
        data.updateMembership,
        data.mid,
      ]
    );

    if (result.rowCount === 0) {
      const error = new Error("Customer not found");
      error.kind = "NOT_FOUND";
      throw error;
    }

    return await findByUid(data.uid);
  } catch (error) {
    if (error.code === "23503") {
      const missing = new Error("Membership not found");
      missing.kind = "NOT_FOUND";
      throw missing;
    }

    throw error;
  }
}

module.exports = { updateCustomerRecord };
