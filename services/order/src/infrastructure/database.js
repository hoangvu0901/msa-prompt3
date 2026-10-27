const { Pool } = require("pg");

const pool = new Pool({
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

pool.on("error", (error) => {
  console.error("Order database error:", error.message);
});

module.exports = pool;
