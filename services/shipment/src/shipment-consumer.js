const {
  client,
  connectDatabase,
} = require("./infrastructure/database");
const { consumer } = require("./infrastructure/kafka-consumer");
const {
  handleOrderCreated,
} = require("./application/handle-order-created");

let stopping = false;

async function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;

  const timer = setTimeout(() => {
    console.error("Shipment consumer shutdown timeout.");
    process.exit(1);
  }, 20000);
  timer.unref();

  try {
    await consumer.stop();
    await consumer.disconnect();
    await client.close();
    clearTimeout(timer);
    process.exit(exitCode);
  } catch (error) {
    console.error("Shipment shutdown failed:", error.message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

consumer.on(consumer.events.CRASH, ({ payload }) => {
  console.error(JSON.stringify({
    event: "shipment_consumer_crashed",
    message: payload.error?.message || "Unknown consumer error",
  }));

  // Docker Compose restarts the process.
  // An uncommitted event may be delivered again.
  process.exit(1);
});

async function main() {
  await connectDatabase();
  await consumer.connect();

  await consumer.subscribe({
    topics: [process.env.ORDER_CREATED_TOPIC || "order-created"],
    fromBeginning: true,
  });

  await consumer.run({
    autoCommit: false,
    partitionsConsumedConcurrently: 1,

    eachMessage: async ({ topic, partition, message, heartbeat }) => {
      try {
        await heartbeat();

        if (!message.value) {
          throw new Error("OrderCreated message has no value");
        }

        const event = JSON.parse(message.value.toString("utf8"));
        const result = await handleOrderCreated(event);

        await heartbeat();

        // Kafka stores the offset of the NEXT message to consume.
        await consumer.commitOffsets([{
          topic,
          partition,
          offset: (BigInt(message.offset) + 1n).toString(),
        }]);

        console.log(JSON.stringify({
          event: "shipment_event_processed",
          eventId: event.eventId,
          oid: result.shipment.oid,
          shipid: result.shipment.shipid,
          created: result.created,
          status: result.shipment.status,
          partition,
          offset: message.offset,
        }));
      } catch (error) {
        console.error(JSON.stringify({
          event: "shipment_event_failed",
          topic,
          partition,
          offset: message.offset,
          kind: error.kind || "PROCESSING_ERROR",
          message: error.message,
        }));

        // Do not skip the event or commit its offset.
        throw error;
      }
    },
  });

  console.log("Shipment consumer started.");
}

main().catch(async error => {
  console.error("Cannot start Shipment consumer:", error.message);
  await shutdown(1);
});
