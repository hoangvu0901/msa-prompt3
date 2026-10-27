const { grpc } = require("../infrastructure/grpc-contract");
const useCases = require("../application/customer-use-cases");
const pool = require("../infrastructure/database");

function handle(useCase) {
  return async (call, callback) => {
    try {
      callback(null, await useCase(call.request));
    } catch (error) {
      const codes = {
        VALIDATION: grpc.status.INVALID_ARGUMENT,
        NOT_FOUND: grpc.status.NOT_FOUND,
      };

      if (codes[error.kind] !== undefined) {
        callback({
          code: codes[error.kind],
          details: error.message,
        });
        return;
      }

      console.error("Customer operation failed:", error.message);

      callback({
        code: grpc.status.INTERNAL,
        details: "Customer operation failed",
      });
    }
  };
}

async function healthCheck(call, callback) {
  try {
    await pool.query({
      text: "SELECT 1",
      query_timeout: 3000,
    });

    callback(null, {
      status: "UP",
      database: "connected",
    });
  } catch {
    callback({
      code: grpc.status.UNAVAILABLE,
      details: "Customer database unavailable",
    });
  }
}

module.exports = {
  healthCheck,
  createCustomer: handle(useCases.createCustomer),
  getCustomer: handle(useCases.getCustomer),
};

const { updateCustomer } = require("../application/update-customer");
module.exports.updateCustomer = handle(updateCustomer);

Object.assign(module.exports, require("./membership-handlers"));
