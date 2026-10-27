const pool = require("./database");

const columns = `
  o.*,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'pid', d.pid,
          'qty', d.qty,
          'unit_price', d.unit_price::text
        ) ORDER BY d.pid
      )
      FROM order_details d
      WHERE d.oid = o.oid
    ),
    '[]'::jsonb
  ) AS details
`;

function toResponse(row) {
  return {
    oid: row.oid,
    uid: row.uid,
    requestId: row.request_id,
    status: row.status,
    membership_score: row.membership_score,
    discount_rate: row.discount_rate,
    subtotal: row.subtotal,
    discount: row.discount,
    total_amount: row.total_amount,
    items: row.request_items,
    details: row.details,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    stock_committed: Boolean(row.stock_committed_at),
  };
}

async function getOrder(oid) {
  const result = await pool.query(
    `SELECT ${columns} FROM orders o WHERE o.oid = $1`,
    [oid]
  );

  return result.rowCount ? toResponse(result.rows[0]) : null;
}

async function listOrders({ uid, page, pageSize }) {
  // Count and rows share one SQL statement snapshot.
  const result = await pool.query(
    `WITH selected AS (
       SELECT ${columns}
       FROM orders o
       WHERE ($1::int IS NULL OR o.uid = $1)
       ORDER BY o.oid DESC
       LIMIT $2 OFFSET $3
     )
     SELECT
       (SELECT COUNT(*)::int FROM orders
        WHERE ($1::int IS NULL OR uid = $1)) AS total,
       COALESCE(
         (SELECT jsonb_agg(
           to_jsonb(s) || jsonb_build_object(
             'discount_rate', s.discount_rate::text,
             'subtotal', s.subtotal::text,
             'discount', s.discount::text,
             'total_amount', s.total_amount::text
           )
           ORDER BY s.oid DESC
         ) FROM selected s),
         '[]'::jsonb
       ) AS items`,
    [uid, pageSize, (page - 1) * pageSize]
  );

  const row = result.rows[0];

  // JSONB timestamps are strings; NUMERIC values must remain strings
  // for monetary precision. Fetch formatted money from the JSON query below.
  return {
    items: row.items.map(item => toResponse({
      ...item,
      created_at: new Date(item.created_at),
      updated_at: new Date(item.updated_at),
    })),
    total: row.total,
    page,
    pageSize,
  };
}

module.exports = { getOrder, listOrders };
