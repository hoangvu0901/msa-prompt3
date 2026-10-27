const { login } = require("./interfaces/login-handler");
const { register } = require("./interfaces/register-handler");
const pool = require("./infrastructure/database");
const { grpc, auth } = require("./infrastructure/grpc-contract");

const server = new grpc.Server();
const port = process.env.GRPC_PORT || "50051";

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
  } catch (error) {
    console.error("Health check failed:", error.message);

    callback({
      code: grpc.status.UNAVAILABLE,
      details: "Auth database unavailable",
    });
  }
}

server.addService(auth.AuthService.service, {
  healthCheck,
  register,
  login,
});

server.bindAsync(
  `0.0.0.0:${port}`,
  grpc.ServerCredentials.createInsecure(),
  (error) => {
    if (error) {
      console.error("Cannot start Auth Service:", error.message);
      pool.end().finally(() => process.exit(1));
      return;
    }

    console.log(`Auth gRPC server listening on port ${port}`);
  }
);

let stopping = false;

function shutdown() {
  if (stopping) return;
  stopping = true;

  console.log("Stopping Auth Service...");

  const timer = setTimeout(() => {
    server.forceShutdown();
    process.exit(1);
  }, 8000);

  timer.unref();

  server.tryShutdown(async () => {
    try {
      await pool.end();
      clearTimeout(timer);
      process.exit(0);
    } catch (error) {
      console.error("Shutdown error:", error.message);
      process.exit(1);
    }
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
