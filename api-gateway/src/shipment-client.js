const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const definition = protoLoader.loadSync(
  path.resolve(__dirname, "../proto/shipment.proto"),
  {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  }
);

const shipment = grpc.loadPackageDefinition(definition).shipment;

const shipmentClient = new shipment.ShipmentService(
  process.env.SHIPMENT_GRPC_ADDRESS || "shipment-service:50055",
  grpc.credentials.createInsecure()
);

function callShipment(method, input, timeout = 5000) {
  return new Promise((resolve, reject) => {
    shipmentClient[method](
      input,
      { deadline: Date.now() + timeout },
      (error, response) => error ? reject(error) : resolve(response)
    );
  });
}

module.exports = { shipmentClient, callShipment };
