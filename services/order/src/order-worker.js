const { setTimeout: delay } = require("node:timers/promises");
const pool = require("./infrastructure/database");
const { closeClients } = require("./infrastructure/grpc-clients");
const { recoverOrders } = require("./application/recover-orders");

let stopping = false;
let shutdownTimer;

function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("Order worker stopping after current order.");

  shutdownTimer = setTimeout(() => {
    console.error("Order worker shutdown timeout; recovery will resume later.");
    process.exit(1);
  }, 20000);

  shutdownTimer.unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

async function main() {
  const once = process.argv.includes("--once");

  await pool.query("SELECT 1");
  console.log("Order recovery worker started.");

  do {
    try {
      await recoverOrders({ shouldStop: () => stopping });
    } catch (error) {
      console.error("Recovery scan failed:", error.message);
      if (once) throw error;
    }

    if (once || stopping) break;
    await delay(2000);
  } while (!stopping);
}

main()
  .catch(error => {
    console.error("Worker failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    closeClients();
    await pool.end();
    if (shutdownTimer) clearTimeout(shutdownTimer);
  });
