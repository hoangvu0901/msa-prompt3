const fs = require("node:fs");
const file = "api-gateway/src/shipment-routes.js";
let content = fs.readFileSync(file, "utf8");

if (content.includes('"/api/shipments/by-order/:oid"')) {
  console.log("Shipment lookup by order already exists.");
  process.exit(0);
}

const route = `

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
`;

fs.copyFileSync(file, file + ".backup-" + Date.now());
fs.appendFileSync(file, route);
console.log("Added shipment lookup by order.");
