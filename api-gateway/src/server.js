// Order integration enabled
const orderRoutes = require("./order-routes");
const { orderClient } = require("./order-client");
// Shipment integration enabled
const shipmentRoutes = require("./shipment-routes");
const { shipmentClient } = require("./shipment-client");
// Product integration enabled
const productRoutes = require("./product-routes");
const { productClient } = require("./product-client");
const membershipRoutes = require("./membership-routes");
// Customer integration enabled
const customerRoutes = require("./customer-routes");
const { customerClient } = require("./customer-client");
const { ensureCustomer, ensureCustomerFromLogin } = require("./provision-customer");
// Redis rate limiting enabled
const { connectRedis, closeRedis } = require("./redis-client");
const { rateLimit } = require("./middleware/rate-limit");
const { healthHandler } = require("./health-handler");

const securityRoutes = require("./security-routes");
const express = require("express");
const { randomUUID } = require("node:crypto");
const { client, callAuth, grpc } = require("./auth-client");

const app = express();
const port = Number(process.env.PORT || 3002);

app.disable("x-powered-by");

app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);

  const started = Date.now();

  res.on("finish", () => {
    console.log(JSON.stringify({
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - started,
    }));
  });

  next();
});

connectRedis();
app.use(rateLimit("global", 120, 60));
app.use(rateLimit("auth", 20, 60));
app.use(express.json({ limit: "16kb" }));

function validateBody(required, optional = []) {
  const allowed = new Set([...required, ...optional]);

  return (req, res, next) => {
    const body = req.body;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ message: "JSON object required" });
    }

    const unknown = Object.keys(body).some((key) => !allowed.has(key));
    const wrongType = Object.values(body).some(
      (value) => typeof value !== "string"
    );
    const missing = required.some(
      (key) => typeof body[key] !== "string" || !body[key].trim()
    );

    if (unknown || wrongType || missing) {
      return res.status(400).json({
        message: "Missing or invalid request fields",
      });
    }

    next();
  };
}

function authError(res, error) {
  const statusMap = {
    [grpc.status.INVALID_ARGUMENT]: 400,
    [grpc.status.UNAUTHENTICATED]: 401,
    [grpc.status.PERMISSION_DENIED]: 403,
    [grpc.status.NOT_FOUND]: 404,
    [grpc.status.ALREADY_EXISTS]: 409,
    [grpc.status.RESOURCE_EXHAUSTED]: 429,
    [grpc.status.UNAVAILABLE]: 503,
    [grpc.status.DEADLINE_EXCEEDED]: 504,
  };

  const status = statusMap[error.code] || 500;

  const message = status >= 500
    ? "Required service unavailable"
    : error.details || "Request rejected";

  return res.status(status).json({ message });
}

app.get("/api/health", healthHandler);

app.post(
  "/api/auth/register",
  validateBody(["username", "password", "email"], ["phone"]),
  async (req, res) => {
    try {
      const result = await callAuth("register", req.body, 10000);
      await ensureCustomer(result.uid);
      res.status(201).json(result);
    } catch (error) {
      authError(res, error);
    }
  }
);

app.post(
  "/api/auth/login",
  validateBody(["username", "password"]),
  async (req, res) => {
    try {
      const result = await callAuth("login", req.body, 10000);
      await ensureCustomerFromLogin(result.accessToken);
      res.setHeader("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      authError(res, error);
    }
  }
);

app.use(securityRoutes);
app.use(customerRoutes);
app.use(productRoutes);
app.use(shipmentRoutes);
app.use(orderRoutes);
app.use(membershipRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON" });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body too large" });
  }

  console.error("Gateway request failed:", req.requestId);
  res.status(500).json({ message: "Internal server error" });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`API Gateway listening on port ${port}`);
});

let stopping = false;

function shutdown() {
  if (stopping) return;
  stopping = true;

  const timer = setTimeout(() => {
    client.close();
    productClient.close();
    shipmentClient.close();
    orderClient.close();
    customerClient.close();
    closeRedis();
    process.exit(1);
  }, 8000);

  timer.unref();

  server.close(() => {
    client.close();
    productClient.close();
    shipmentClient.close();
    orderClient.close();
    customerClient.close();
    closeRedis();
    clearTimeout(timer);
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
