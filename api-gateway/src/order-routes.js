const express = require("express");
const { authenticate } = require("./middleware/auth");
const { callOrder } = require("./order-client");
const { grpc } = require("./auth-client");

const router = express.Router();

function allow(...roles) {
  return (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");

    if (!roles.includes(req.auth?.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
}

function actor(req) {
  return {
    uid: Number(req.auth.uid),
    role: req.auth.role,
  };
}

function positive(value) {
  return Number.isInteger(value) && value > 0 && value <= 2147483647;
}

function sendError(res, error) {
  const statuses = {
    [grpc.status.INVALID_ARGUMENT]: 400,
    [grpc.status.UNAUTHENTICATED]: 401,
    [grpc.status.PERMISSION_DENIED]: 403,
    [grpc.status.NOT_FOUND]: 404,
    [grpc.status.ALREADY_EXISTS]: 409,
    [grpc.status.FAILED_PRECONDITION]: 409,
    [grpc.status.DEADLINE_EXCEEDED]: 504,
  };

  const status = statuses[error.code] || 503;
  return res.status(status).json({
    message: status >= 500
      ? "Order service unavailable"
      : error.details || "Request rejected",
  });
}

function validateCreate(req, res, next) {
  const body = req.body;

  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length !== 2 ||
    !Object.hasOwn(body, "requestId") ||
    !Object.hasOwn(body, "items") ||
    typeof body.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(body.requestId) ||
    !Array.isArray(body.items) ||
    body.items.length === 0 || body.items.length > 50
  ) {
    return res.status(400).json({ message: "Invalid order request" });
  }

  const seen = new Set();

  for (const item of body.items) {
    if (
      !item || typeof item !== "object" || Array.isArray(item) ||
      Object.keys(item).length !== 2 ||
      !Object.hasOwn(item, "pid") ||
      !Object.hasOwn(item, "qty") ||
      !positive(item.pid) || !positive(item.qty) ||
      seen.has(item.pid)
    ) {
      return res.status(400).json({
        message: "Each item requires a unique pid and positive integer qty",
      });
    }
    seen.add(item.pid);
  }

  next();
}

router.post(
  "/api/orders",
  authenticate,
  allow("CUSTOMER"),
  validateCreate,
  async (req, res) => {
    try {
      const result = await callOrder("createOrder", {
        actor: actor(req),
        requestId: req.body.requestId,
        items: req.body.items,
      });

      const order = result.order;
      res.setHeader("Location", "/api/orders/" + order.oid);

      if (["PENDING", "COMPENSATING"].includes(order.status)) {
        return res.status(202).json(result);
      }

      if (order.status === "FAILED") {
        return res.status(409).json(result);
      }

      return res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.get(
  "/api/orders",
  authenticate,
  allow("CUSTOMER", "ADMIN"),
  async (req, res) => {
    const rawPage = req.query.page ?? "1";
    const rawSize = req.query.pageSize ?? "20";

    if (
      Object.keys(req.query).some(key => !["page", "pageSize"].includes(key)) ||
      typeof rawPage !== "string" || typeof rawSize !== "string" ||
      !/^[1-9][0-9]*$/.test(rawPage) ||
      !/^[1-9][0-9]*$/.test(rawSize) ||
      !positive(Number(rawPage)) ||
      !positive(Number(rawSize)) ||
      Number(rawSize) > 100
    ) {
      return res.status(400).json({ message: "Invalid pagination" });
    }

    try {
      res.json(await callOrder("listOrders", {
        actor: actor(req),
        page: Number(rawPage),
        pageSize: Number(rawSize),
      }));
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.get(
  "/api/orders/:oid",
  authenticate,
  allow("CUSTOMER", "ADMIN"),
  async (req, res) => {
    const raw = req.params.oid;
    const oid = Number(raw);

    if (!/^[1-9][0-9]*$/.test(raw) || !positive(oid)) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    try {
      res.json(await callOrder("getOrder", {
        actor: actor(req),
        oid,
      }));
    } catch (error) {
      sendError(res, error);
    }
  }
);

module.exports = router;
