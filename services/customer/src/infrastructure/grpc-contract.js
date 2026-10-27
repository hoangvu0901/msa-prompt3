const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

function loadContract(filename, packageName) {
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

  return grpc.loadPackageDefinition(definition)[packageName];
}

const customer = loadContract("customer.proto", "customer");

module.exports = { grpc, customer, loadContract };
