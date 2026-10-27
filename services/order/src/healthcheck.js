const { grpc, order } = require("./infrastructure/grpc-contract");

const client = new order.OrderService(
  "127.0.0.1:" + (process.env.GRPC_PORT || "50054"),
  grpc.credentials.createInsecure()
);

client.healthCheck(
  {},
  { deadline: Date.now() + 4000 },
  (error, result) => {
    client.close();

    if (error || result?.status !== "UP" ||
        result?.database !== "connected") {
      console.error("Order health check failed");
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify(result));
  }
);
