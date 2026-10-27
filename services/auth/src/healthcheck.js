const { grpc, auth } = require("./infrastructure/grpc-contract");

const port = process.env.GRPC_PORT || "50051";

const client = new auth.AuthService(
  `127.0.0.1:${port}`,
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
      console.error("FAIL: Unexpected response:", response);
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify(response));
  }
);
