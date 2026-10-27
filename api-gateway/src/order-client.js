const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const definition = protoLoader.loadSync(
  path.resolve(__dirname, "../proto/order.proto"),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  }
);

const order = grpc.loadPackageDefinition(definition).order;

const orderClient = new order.OrderService(
  process.env.ORDER_GRPC_ADDRESS || "order-service:50054",
  grpc.credentials.createInsecure()
);

function callOrder(method, input, timeout = 5000) {
  return new Promise((resolve, reject) => {
    orderClient[method](
      input,
      { deadline: Date.now() + timeout },
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
}

module.exports = { orderClient, callOrder };
