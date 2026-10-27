const express = require("express");
const { authenticate, authorize } = require("./middleware/auth");
const { callCustomer } = require("./customer-client");
const { grpc } = require("./auth-client");

const router = express.Router();

function validScore(score) {
  return Number.isInteger(score) &&
    score >= 0 &&
    score <= 2147483647;
}

function validBody(body, fields) {
  return body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).length === fields.length &&
    fields.every((field) => Object.hasOwn(body, field));
}

function sendError(res, error) {
  const codes = {
    [grpc.status.INVALID_ARGUMENT]: 400,
    [grpc.status.NOT_FOUND]: 404,
    [grpc.status.ALREADY_EXISTS]: 409,
  };

  const status = codes[error.code] || 503;

  res.status(status).json({
    message: status === 503
      ? "Customer service unavailable"
      : error.details,
  });
}

router.get(
  "/api/memberships",
  authenticate,
  authorize("CUSTOMER", "ADMIN"),
  async (req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await callCustomer("listMemberships", {}));
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.post(
  "/api/memberships",
  authenticate,
  authorize("ADMIN"),
  async (req, res) => {
    if (
      !validBody(req.body, ["mname", "score"]) ||
      typeof req.body.mname !== "string" ||
      !validScore(req.body.score)
    ) {
      return res.status(400).json({
        message: "Provide mname and a non-negative integer score",
      });
    }

    try {
      const result = await callCustomer("createMembership", req.body);
      res.status(201).json(result);
    } catch (error) {
      sendError(res, error);
    }
  }
);

router.patch(
  "/api/memberships/:mid",
  authenticate,
  authorize("ADMIN"),
  async (req, res) => {
    const mid = Number(req.params.mid);

    if (
      !/^[1-9][0-9]*$/.test(req.params.mid) ||
      !Number.isInteger(mid) ||
      mid > 2147483647 ||
      !validBody(req.body, ["score"]) ||
      !validScore(req.body.score)
    ) {
      return res.status(400).json({
        message: "Invalid membership ID or score",
      });
    }

    try {
      const result = await callCustomer("updateMembershipScore", {
        mid,
        score: req.body.score,
      });

      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  }
);

module.exports = router;
