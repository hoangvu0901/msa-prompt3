const pool = require("./infrastructure/database");
const { grpc, order } = require("./infrastructure/grpc-contract");
const handlers = require("./interfaces/order-handlers");

const server = new grpc.Server();
const port = process.env.GRPC_PORT || "50054";

server.addService(order.OrderService.service, handlers);

async function main() {
  try {
    await pool.query("SELECT 1");

    await new Promise((resolve, reject) => {
      server.bindAsync(
        "0.0.0.0:" + port,
        grpc.ServerCredentials.createInsecure(),
        error => error ? reject(error) : resolve()
      );
    });

    console.log("Order gRPC server listening on port " + port);
  } catch (error) {
    console.error("Cannot start Order Service:", error.message);
    await pool.end();
    process.exit(1);
  }
}

let stopping = false;

function shutdown() {
  if (stopping) return;
  stopping = true;

  const timer = setTimeout(() => {
    server.forceShutdown();
    process.exit(1);
  }, 8000);
  timer.unref();

  server.tryShutdown(async () => {
    try {
      await pool.end();
      clearTimeout(timer);
      process.exit(0);
    } catch {
      process.exit(1);
    }
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
main();
