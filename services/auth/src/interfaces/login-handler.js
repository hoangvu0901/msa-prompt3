const { grpc } = require("../infrastructure/grpc-contract");
const { loginUser } = require("../application/login-user");

async function login(call, callback) {
  try {
    const response = await loginUser(call.request);
    callback(null, response);
  } catch (error) {
    if (error.kind === "VALIDATION") {
      callback({
        code: grpc.status.INVALID_ARGUMENT,
        details: error.message,
      });
      return;
    }

    if (error.kind === "UNAUTHENTICATED") {
      callback({
        code: grpc.status.UNAUTHENTICATED,
        details: error.message,
      });
      return;
    }

    console.error("Login failed:", error.message);

    callback({
      code: grpc.status.INTERNAL,
      details: "Cannot login",
    });
  }
}

module.exports = { login };
