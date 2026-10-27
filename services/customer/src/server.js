const pool = require("./infrastructure/database");
const { grpc, customer } = require("./infrastructure/grpc-contract");
const handlers = require("./interfaces/customer-handlers");

const server = new grpc.Server();
const port = process.env.GRPC_PORT || "50052";

server.addService(customer.CustomerService.service, handlers);

server.bindAsync(
  `0.0.0.0:${port}`,
  grpc.ServerCredentials.createInsecure(),
  (error) => {
    if (error) {
      console.error("Cannot start Customer Service:", error.message);
      pool.end().finally(() => process.exit(1));
      return;
    }

    console.log(`Customer gRPC server listening on port ${port}`);
  }
);

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
    } catch (error) {
      console.error("Shutdown error:", error.message);
      process.exit(1);
    }
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
