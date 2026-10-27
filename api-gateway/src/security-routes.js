const express = require("express");
const { authenticate, authorize } = require("./middleware/auth");

const router = express.Router();

router.get("/api/auth/me", authenticate, (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  res.json({
    uid: req.auth.uid,
    role: req.auth.role,
  });
});

router.get(
  "/api/admin/health",
  authenticate,
  authorize("ADMIN"),
  (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    res.json({
      status: "UP",
      message: "Admin access granted",
    });
  }
);

module.exports = router;
