const { grpc } = require("../infrastructure/grpc-contract");
const { registerUser } = require("../application/register-user");

async function register(call, callback) {
  try {
    const response = await registerUser(call.request);
    callback(null, response);
  } catch (error) {
    if (error.kind === "VALIDATION") {
      callback({
        code: grpc.status.INVALID_ARGUMENT,
        details: error.message,
      });
      return;
    }

    if (error.kind === "CONFLICT") {
      callback({
        code: grpc.status.ALREADY_EXISTS,
        details: error.message,
      });
      return;
    }

    console.error("Register failed:", error.message);

    callback({
      code: grpc.status.INTERNAL,
      details: "Cannot register account",
    });
  }
}

module.exports = { register };
