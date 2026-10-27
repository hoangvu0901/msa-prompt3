const { client, connectDatabase } = require("./infrastructure/database");
const { grpc, shipment } = require("./infrastructure/grpc-contract");
const handlers = require("./interfaces/shipment-handlers");

const server = new grpc.Server();
const port = process.env.GRPC_PORT || "50055";

server.addService(shipment.ShipmentService.service, handlers);

async function main() {
  try {
    await connectDatabase();

    await new Promise((resolve, reject) => {
      server.bindAsync(
        "0.0.0.0:" + port,
        grpc.ServerCredentials.createInsecure(),
        error => error ? reject(error) : resolve()
      );
    });

    console.log("Shipment gRPC server listening on port " + port);
  } catch (error) {
    console.error("Cannot start Shipment Service:", error.message);
    await client.close();
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
      await client.close();
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
