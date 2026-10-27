// INVENTORY_RPC_V1
const inventory = require("../application/inventory-use-cases");
const { grpc } = require("../infrastructure/grpc-contract");
const { database } = require("../infrastructure/database");
const useCases = require("../application/product-use-cases");

function handle(useCase) {
  return async (call, callback) => {
    try {
      callback(null, await useCase(call.request));
    } catch (error) {
      const codes = {
        VALIDATION: grpc.status.INVALID_ARGUMENT,
        NOT_FOUND: grpc.status.NOT_FOUND,
        OUT_OF_STOCK: grpc.status.FAILED_PRECONDITION,
        CONFLICT: grpc.status.ALREADY_EXISTS,
      };

      if (codes[error.kind] !== undefined) {
        callback({
          code: codes[error.kind],
          details: error.message,
        });
        return;
      }

      console.error("Product operation failed:", error.message);

      callback({
        code: grpc.status.INTERNAL,
        details: "Product operation failed",
      });
    }
  };
}

async function healthCheck(call, callback) {
  try {
    await database.command({ ping: 1 }, { timeoutMS: 3000 });

    callback(null, {
      status: "UP",
      database: "connected",
    });
  } catch {
    callback({
      code: grpc.status.UNAVAILABLE,
      details: "Product database unavailable",
    });
  }
}

module.exports = {
  commitStock: handle(inventory.commitStock),
  reserveStock: handle(inventory.reserveStock),
  releaseStock: handle(inventory.releaseStock),
  healthCheck,
  createProduct: handle(useCases.createProduct),
  getProduct: handle(useCases.getProduct),
  listProducts: handle(useCases.listProducts),
  updateProduct: handle(useCases.updateProduct),
  deleteProduct: handle(useCases.deleteProduct),
};

module.exports.getStocks = require("./stock-handlers").getStocks;
