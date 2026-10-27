const express = require("express");
const { authenticate } = require("./middleware/auth");
const { callShipment } = require("./shipment-client");
const { grpc } = require("./auth-client");

const router = express.Router();

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.auth?.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
}

function validateShipid(req, res, next) {
  const raw = req.params.shipid;
  const shipid = Number(raw);

  if (
    !/^[1-9][0-9]*$/.test(raw) ||
    !Number.isInteger(shipid) ||
    shipid > 2147483647
  ) {
    return res.status(400).json({ message: "Invalid shipment ID" });
  }

  req.shipmentId = shipid;
  next();
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
      ? "Shipment service unavailable"
      : error.details || "Request rejected",
  });
}

function validateStatus(req, res, next) {
  const body = req.body;

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !Object.hasOwn(body, "status") ||
    !["PENDING", "SHIPPING", "DELIVERED"].includes(body.status)
  ) {
    return res.status(400).json({
      message: "Provide only status: PENDING, SHIPPING or DELIVERED",
    });
  }

  next();
}

router.get(
  "/api/shipments/:shipid",
  authenticate,
  allowRoles("CUSTOMER", "ADMIN", "SHIPMENT_STAFF"),
  validateShipid,
  async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    try {
      const shipment = await callShipment("getShipment", {
        shipid: req.shipmentId,
      });

      if (
        req.auth.role === "CUSTOMER" &&
        Number(req.auth.uid) !== shipment.uid
      ) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(shipment);
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.patch(
  "/api/shipments/:shipid/status",
  authenticate,
  allowRoles("ADMIN", "SHIPMENT_STAFF"),
  validateShipid,
  validateStatus,
  async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    try {
      const shipment = await callShipment("updateShipmentStatus", {
        shipid: req.shipmentId,
        status: req.body.status,
      });

      res.json(shipment);
    } catch (error) {
      sendError(res, error);
    }
  }
);

module.exports = router;


// Shipment lookup by order enabled
router.get(
  "/api/shipments/by-order/:oid",
  authenticate,
  allowRoles("CUSTOMER", "ADMIN", "SHIPMENT_STAFF"),
  async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    const raw = req.params.oid;
    const oid = Number(raw);

    if (
      !/^[1-9][0-9]*$/.test(raw) ||
      !Number.isInteger(oid) ||
      oid > 2147483647
    ) {
      return res.status(400).json({ message: "Invalid order ID" });
    }

    try {
      const shipment = await callShipment("getShipmentByOrder", { oid });

      if (
        req.auth.role === "CUSTOMER" &&
        Number(req.auth.uid) !== shipment.uid
      ) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(shipment);
    } catch (error) {
      sendError(res, error);
    }
  }
);
