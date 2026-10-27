const { randomUUID } = require("node:crypto");
const databaseModule = require("./database");
const pool = databaseModule.pool || databaseModule;

async function createOrGetPending(request) {
  const inserted = await pool.query(
    `INSERT INTO orders (
       uid,
       request_id,
       request_hash,
       request_items,
       reservation_id,
       status
     )
     VALUES ($1, $2, $3, $4::jsonb, $5, 'PENDING')
     ON CONFLICT (uid, request_id) DO NOTHING
     RETURNING *`,
    [
      request.uid,
      request.requestId,
      request.requestHash,
      JSON.stringify(request.items),
      randomUUID(),
    ]
  );

  if (inserted.rowCount === 1) {
    return {
      created: true,
      order: inserted.rows[0],
    };
  }

  // Use a separate query to read the committed competing insert.
  const existing = await pool.query(
    `SELECT *
     FROM orders
     WHERE uid = $1 AND request_id = $2`,
    [request.uid, request.requestId]
  );

  if (existing.rowCount !== 1) {
    throw new Error("Order request could not be retrieved; retry the same request");
  }

  const order = existing.rows[0];

  if (order.request_hash !== request.requestHash) {
    const error = new Error(
      "requestId was already used with different order content"
    );
    error.kind = "CONFLICT";
    throw error;
  }

  return {
    created: false,
    order,
  };
}

module.exports = { createOrGetPending };
