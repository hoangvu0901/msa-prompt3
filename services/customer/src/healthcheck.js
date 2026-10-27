const { grpc, customer } = require("./infrastructure/grpc-contract");

const client = new customer.CustomerService(
  "127.0.0.1:" + (process.env.GRPC_PORT || "50052"),
  grpc.credentials.createInsecure()
);

client.healthCheck(
  {},
  { deadline: Date.now() + 5000 },
  (error, response) => {
    client.close();

    if (error) {
      console.error("FAIL:", error.message);
      process.exitCode = 1;
      return;
    }

    if (
      response.status !== "UP" ||
      response.database !== "connected"
    ) {
      console.error("FAIL: Customer Service is not ready");
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify(response));
  }
);
