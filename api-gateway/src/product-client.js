const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const definition = protoLoader.loadSync(
  path.resolve(__dirname, "../proto/product.proto"),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  }
);

const product = grpc.loadPackageDefinition(definition).product;

const productClient = new product.ProductService(
  process.env.PRODUCT_GRPC_ADDRESS || "product-service:50053",
  grpc.credentials.createInsecure()
);

function callProduct(method, input, timeout = 5000) {
  return new Promise((resolve, reject) => {
    productClient[method](
      input,
      { deadline: Date.now() + timeout },
      (error, response) => error ? reject(error) : resolve(response)
    );
  });
}

module.exports = { productClient, callProduct };
