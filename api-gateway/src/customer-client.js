const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const definition = protoLoader.loadSync(
  path.resolve(__dirname, "../proto/customer.proto"),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  }
);

const customer = grpc.loadPackageDefinition(definition).customer;

const customerClient = new customer.CustomerService(
  process.env.CUSTOMER_GRPC_ADDRESS || "customer-service:50052",
  grpc.credentials.createInsecure()
);

function callCustomer(method, input, timeout = 5000) {
  return new Promise((resolve, reject) => {
    customerClient[method](
      input,
      { deadline: Date.now() + timeout },
      (error, response) => error ? reject(error) : resolve(response)
    );
  });
}

module.exports = { customerClient, callCustomer };
