const { grpc, product } = require("./infrastructure/grpc-contract");

const client = new product.ProductService(
  "127.0.0.1:" + (process.env.GRPC_PORT || "50053"),
  grpc.credentials.createInsecure()
);

client.healthCheck(
  {},
  { deadline: Date.now() + 5000 },
  (error, response) => {
    client.close();

    if (
      error ||
      response?.status !== "UP" ||
      response?.database !== "connected"
    ) {
      console.error("FAIL:", error?.message || "Product is not ready");
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify(response));
  }
);
