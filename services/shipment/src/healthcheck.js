const { grpc, shipment } = require("./infrastructure/grpc-contract");

const client = new shipment.ShipmentService(
  "127.0.0.1:" + (process.env.GRPC_PORT || "50055"),
  grpc.credentials.createInsecure()
);

client.healthCheck(
  {},
  { deadline: new Date(Date.now() + 4000) },
  (error, result) => {
    client.close();

    if (error || result?.status !== "UP" ||
        result?.database !== "connected") {
      console.error("Shipment health check failed");
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify(result));
  }
);
