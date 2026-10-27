const { grpc } = require("../infrastructure/grpc-contract");
const useCases = require("../application/membership-use-cases");

function handle(useCase) {
  return async (call, callback) => {
    try {
      callback(null, await useCase(call.request));
    } catch (error) {
      const codes = {
        VALIDATION: grpc.status.INVALID_ARGUMENT,
        NOT_FOUND: grpc.status.NOT_FOUND,
        CONFLICT: grpc.status.ALREADY_EXISTS,
      };

      if (codes[error.kind] !== undefined) {
        callback({
          code: codes[error.kind],
          details: error.message,
        });
        return;
      }

      console.error("Membership operation failed:", error.message);

      callback({
        code: grpc.status.INTERNAL,
        details: "Membership operation failed",
      });
    }
  };
}

module.exports = {
  listMemberships: handle(useCases.listMemberships),
  createMembership: handle(useCases.createMembership),
  updateMembershipScore: handle(useCases.updateMembershipScore),
};
