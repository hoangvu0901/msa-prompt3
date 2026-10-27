const express = require("express");
const { authenticate, authorize } = require("./middleware/auth");
const { callCustomer } = require("./customer-client");
const { grpc } = require("./auth-client");

const router = express.Router();

function checkCustomerAccess(req, res, next) {
  const rawUid = req.params.uid;
  const uid = Number(rawUid);

  if (
    !/^[1-9][0-9]*$/.test(rawUid) ||
    !Number.isInteger(uid) ||
    uid > 2147483647
  ) {
    return res.status(400).json({
      message: "Invalid customer uid",
    });
  }

  if (
    req.auth.role !== "ADMIN" &&
    req.auth.uid !== String(uid)
  ) {
    return res.status(403).json({
      message: "Cannot access another customer",
    });
  }

  req.customerUid = uid;
  next();
}

function customerError(res, error) {
  if (error.code === grpc.status.NOT_FOUND) {
    return res.status(404).json({
      message: error.details || "Resource not found",
    });
  }

  if (error.code === grpc.status.INVALID_ARGUMENT) {
    return res.status(400).json({
      message: error.details || "Invalid customer data",
    });
  }

  return res.status(503).json({
    message: "Customer service unavailable",
  });
}

router.get(
  "/api/customers/:uid",
  authenticate,
  authorize("CUSTOMER", "ADMIN"),
  checkCustomerAccess,
  async (req, res) => {
    try {
      const customer = await callCustomer("getCustomer", {
        uid: req.customerUid,
      });

      res.setHeader("Cache-Control", "no-store");
      res.json(customer);
    } catch (error) {
      customerError(res, error);
    }
  }
);

router.put(
  "/api/customers/:uid",
  authenticate,
  authorize("CUSTOMER", "ADMIN"),
  checkCustomerAccess,
  async (req, res) => {
    const body = req.body;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({
        message: "JSON object required",
      });
    }

    const allowed = new Set(["fullname", "mid"]);
    const keys = Object.keys(body);

    if (!keys.length || keys.some((key) => !allowed.has(key))) {
      return res.status(400).json({
        message: "Only fullname and mid are accepted",
      });
    }

    const hasName = Object.hasOwn(body, "fullname");
    const hasMembership = Object.hasOwn(body, "mid");

    if (hasMembership && req.auth.role !== "ADMIN") {
      return res.status(403).json({
        message: "Only ADMIN can change membership",
      });
    }

    if (
      hasName &&
      (
        typeof body.fullname !== "string" ||
        !body.fullname.trim() ||
        [...body.fullname.trim()].length > 100
      )
    ) {
      return res.status(400).json({
        message: "Fullname must contain 1-100 characters",
      });
    }

    if (
      hasMembership &&
      (
        !Number.isInteger(body.mid) ||
        body.mid <= 0 ||
        body.mid > 2147483647
      )
    ) {
      return res.status(400).json({
        message: "Invalid membership ID",
      });
    }

    try {
      const result = await callCustomer("updateCustomer", {
        uid: req.customerUid,
        fullname: hasName ? body.fullname.trim() : "",
        mid: hasMembership ? body.mid : 0,
        updateFullname: hasName,
        updateMembership: hasMembership,
      });

      res.setHeader("Cache-Control", "no-store");

      res.json({
        message: "Customer updated successfully",
        uid: result.uid,
      });
    } catch (error) {
      customerError(res, error);
    }
  }
);

module.exports = router;
