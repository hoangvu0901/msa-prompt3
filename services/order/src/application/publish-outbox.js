const pool = require("../infrastructure/database");

async function publishNext(producer) {
  const connection = await pool.connect();
  let broken = false;

  const onError = () => {
    broken = true;
  };
  connection.on("error", onError);

  try {
    await connection.query("BEGIN");

    const selected = await connection.query(
      `SELECT e.*
       FROM outbox_events e
       JOIN orders o ON o.oid = e.aggregate_id
       WHERE e.published_at IS NULL
         AND e.next_attempt_at <= CURRENT_TIMESTAMP
         AND e.event_type = 'OrderCreated'
         AND o.status = 'CONFIRMED'
         AND o.stock_committed_at IS NOT NULL
       ORDER BY e.next_attempt_at, e.created_at, e.event_id
       LIMIT 1
       FOR UPDATE OF e SKIP LOCKED`
    );

    const event = selected.rows[0];

    if (!event) {
      await connection.query("COMMIT");
      return null;
    }

    let sendError;

    try {
      if (
        event.payload.eventId !== event.event_id ||
        event.payload.eventType !== event.event_type ||
        event.payload.data?.oid !== event.aggregate_id
      ) {
        throw new Error("Outbox payload identity mismatch");
      }

      await producer.send({
        topic: process.env.ORDER_CREATED_TOPIC || "order-created",
        acks: -1,
        timeout: 10000,
        messages: [{
          key: String(event.aggregate_id),
          value: JSON.stringify(event.payload),
          headers: {
            eventId: event.event_id,
            eventType: event.event_type,
          },
        }],
      });
    } catch (error) {
      sendError = error;
    }

    if (sendError) {
      const retrySeconds = Math.min(
        60,
        5 * (2 ** Math.min(event.attempts, 4))
      );

      await connection.query(
        `UPDATE outbox_events
         SET attempts = attempts + 1,
             last_error = $2,
             next_attempt_at =
               CURRENT_TIMESTAMP + ($3::int * INTERVAL '1 second')
         WHERE event_id = $1`,
        [
          event.event_id,
          String(sendError.message).slice(0, 1000),
          retrySeconds,
        ]
      );

      await connection.query("COMMIT");

      return {
        status: "RETRY",
        eventId: event.event_id,
        oid: event.aggregate_id,
        retrySeconds,
      };
    }

    // Kafka acknowledged the send. Only now mark the event published.
    await connection.query(
      `UPDATE outbox_events
       SET published_at = CURRENT_TIMESTAMP,
           attempts = attempts + 1,
           last_error = NULL
       WHERE event_id = $1`,
      [event.event_id]
    );

    await connection.query("COMMIT");

    return {
      status: "PUBLISHED",
      eventId: event.event_id,
      oid: event.aggregate_id,
    };
  } catch (error) {
    try {
      await connection.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    connection.removeListener("error", onError);
    connection.release(broken);
  }
}

module.exports = { publishNext };
