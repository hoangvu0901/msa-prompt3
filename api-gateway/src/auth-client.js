const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const definition = protoLoader.loadSync(
  path.resolve(__dirname, "../proto/auth.proto"),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  }
);

const auth = grpc.loadPackageDefinition(definition).auth;

const client = new auth.AuthService(
  process.env.AUTH_GRPC_ADDRESS || "auth-service:50051",
  grpc.credentials.createInsecure()
);

function callAuth(method, input, timeout = 5000) {
  return new Promise((resolve, reject) => {
    client[method](
      input,
      { deadline: Date.now() + timeout },
      (error, response) => error ? reject(error) : resolve(response)
    );
  });
}

module.exports = { client, callAuth, grpc };
