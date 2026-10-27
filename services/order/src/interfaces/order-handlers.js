const { grpc } = require("../infrastructure/grpc-contract");
const pool = require("../infrastructure/database");
const useCases = require("../application/order-api");

function handle(useCase) {
  return async (call, callback) => {
    try {
      callback(null, await useCase(call.request));
    } catch (error) {
      const codes = {
        VALIDATION: grpc.status.INVALID_ARGUMENT,
        PERMISSION: grpc.status.PERMISSION_DENIED,
        NOT_FOUND: grpc.status.NOT_FOUND,
        CONFLICT: grpc.status.ALREADY_EXISTS,
      };

      if (codes[error.kind] !== undefined) {
        callback({ code: codes[error.kind], details: error.message });
        return;
      }

      console.error("Order API failed:", error.message);
      callback({
        code: grpc.status.INTERNAL,
        details: "Order operation failed",
      });
    }
  };
}

async function healthCheck(call, callback) {
  try {
    await pool.query({ text: "SELECT 1", query_timeout: 3000 });
    callback(null, { status: "UP", database: "connected" });
  } catch {
    callback({
      code: grpc.status.UNAVAILABLE,
      details: "Order database unavailable",
    });
  }
}

module.exports = {
  healthCheck,
  createOrder: handle(useCases.createOrder),
  getOrder: handle(useCases.getOrder),
  listOrders: handle(useCases.listOrders),
};
