const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const protoPath = path.resolve(
  __dirname,
  "../../proto/auth.proto"
);

const definition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const auth = grpc.loadPackageDefinition(definition).auth;

module.exports = { grpc, auth };
