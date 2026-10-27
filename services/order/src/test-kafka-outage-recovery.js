const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const pool = require("./infrastructure/database");

const base = "http://api-gateway:3002";

async function main() {
  const oid = Number(process.argv[2]);
  assert.ok(Number.isInteger(oid) && oid > 0, "Pass the outage test order ID");
  assert.ok(process.env.BOOTSTRAP_ADMIN_USERNAME);
  assert.ok(process.env.BOOTSTRAP_ADMIN_PASSWORD);

  const loginResponse = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.BOOTSTRAP_ADMIN_USERNAME,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(loginResponse.status, 200);

  const login = await loginResponse.json();
  assert.ok(login.accessToken);

  const deadline = Date.now() + 180000;
  let event;
  let shipment;

  do {
    const rows = await pool.query(
      `SELECT event_id, published_at, attempts, last_error
       FROM outbox_events WHERE aggregate_id = $1`,
      [oid]
    );
    assert.equal(rows.rowCount, 1, "Expected one Outbox event");
    event = rows.rows[0];

    const response = await fetch(
      base + "/api/shipments/by-order/" + oid,
      {
        headers: { Authorization: "Bearer " + login.accessToken },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (response.status === 200) {
      shipment = await response.json();
    } else {
      assert.equal(response.status, 404);
    }

    if (event.published_at && shipment) break;
    await delay(3000);
  } while (Date.now() < deadline);

  assert.ok(event?.published_at, "Event was not published within 180 seconds");
  assert.equal(event.last_error, null);
  console.log("PASS: Outbox event is published after Kafka recovery.");

  assert.ok(shipment, "Shipment was not created within 180 seconds");
  assert.equal(shipment.oid, oid);
  assert.equal(shipment.status, "PENDING");
  console.log("PASS: Shipment is created after Kafka recovery.");

  const order = (await pool.query(
    `SELECT status, stock_committed_at
     FROM orders WHERE oid = $1`,
    [oid]
  )).rows[0];

  assert.equal(order.status, "CONFIRMED");
  assert.ok(order.stock_committed_at);
  console.log("PASS: Confirmed order remains intact.");

  console.table([{
    oid,
    shipid: shipment.shipid,
    event_id: event.event_id,
    attempts: event.attempts,
    published_at: event.published_at,
  }]);

  console.log("ALL KAFKA RECOVERY CHECKS PASSED");
}

main()
  .catch(error => {
    console.error("FAIL:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
