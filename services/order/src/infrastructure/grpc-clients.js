const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

function createClient(filename, packageName, serviceName, address) {
  const definition = protoLoader.loadSync(
    path.resolve(__dirname, "../../proto", filename),
    {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    }
  );

  const contract = grpc.loadPackageDefinition(definition);

  return new contract[packageName][serviceName](
    address,
    grpc.credentials.createInsecure()
  );
}

const customerClient = createClient(
  "customer.proto",
  "customer",
  "CustomerService",
  process.env.CUSTOMER_GRPC_ADDRESS || "customer-service:50052"
);

const productClient = createClient(
  "product.proto",
  "product",
  "ProductService",
  process.env.PRODUCT_GRPC_ADDRESS || "product-service:50053"
);

function call(client, method, input, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    client[method](
      input,
      { deadline: new Date(Date.now() + timeoutMs) },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
  });
}

function closeClients() {
  customerClient.close();
  productClient.close();
}

module.exports = {
  grpc,
  callCustomer: (method, input, timeoutMs) =>
    call(customerClient, method, input, timeoutMs),
  callProduct: (method, input, timeoutMs) =>
    call(productClient, method, input, timeoutMs),
  closeClients,
};
