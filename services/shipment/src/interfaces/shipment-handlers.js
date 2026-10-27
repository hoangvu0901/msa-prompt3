const { grpc } = require("../infrastructure/grpc-contract");
const { database } = require("../infrastructure/database");
const useCases = require("../application/shipment-use-cases");

function handle(useCase) {
  return async (call, callback) => {
    try {
      callback(null, await useCase(call.request));
    } catch (error) {
      const codes = {
        VALIDATION: grpc.status.INVALID_ARGUMENT,
        NOT_FOUND: grpc.status.NOT_FOUND,
        CONFLICT: grpc.status.FAILED_PRECONDITION,
      };

      if (codes[error.kind] !== undefined) {
        callback({
          code: codes[error.kind],
          details: error.message,
        });
        return;
      }

      console.error("Shipment operation failed:", error.message);
      callback({
        code: grpc.status.INTERNAL,
        details: "Shipment operation failed",
      });
    }
  };
}

async function healthCheck(call, callback) {
  try {
    await database.command({ ping: 1 }, { timeoutMS: 3000 });
    callback(null, { status: "UP", database: "connected" });
  } catch {
    callback({
      code: grpc.status.UNAVAILABLE,
      details: "Shipment database unavailable",
    });
  }
}

module.exports = {
  healthCheck,
  getShipment: handle(useCases.getShipment),
  getShipmentByOrder: handle(useCases.getShipmentByOrder),
  updateShipmentStatus: handle(useCases.updateShipmentStatus),
};
