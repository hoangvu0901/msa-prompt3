const { setTimeout: delay } = require("node:timers/promises");
const pool = require("./infrastructure/database");
const { producer } = require("./infrastructure/kafka-producer");
const { publishNext } = require("./application/publish-outbox");

let stopping = false;
let shutdownTimer;

function shutdown() {
  if (stopping) return;
  stopping = true;

  console.log("Outbox worker stopping after current event.");

  shutdownTimer = setTimeout(() => {
    console.error("Outbox shutdown timeout; event may be retried later.");
    process.exit(1);
  }, 20000);

  shutdownTimer.unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function main() {
  const once = process.argv.includes("--once");

  await pool.query("SELECT 1");
  await producer.connect();

  console.log("Outbox publisher connected to Kafka.");

  do {
    try {
      for (let index = 0; index < 20 && !stopping; index++) {
        const result = await publishNext(producer);

        if (!result) break;

        console.log(JSON.stringify({
          event: "outbox_publish",
          ...result,
        }));

        if (once && result.status === "RETRY") {
          process.exitCode = 1;
        }
      }
    } catch (error) {
      console.error("Outbox scan failed:", error.message);
      if (once) throw error;
    }

    if (once || stopping) break;
    await delay(2000);
  } while (!stopping);
}

main()
  .catch(error => {
    console.error("Outbox worker failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await producer.disconnect();
    } finally {
      await pool.end();
      if (shutdownTimer) clearTimeout(shutdownTimer);
    }
  });
