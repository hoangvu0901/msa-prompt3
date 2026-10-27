const fs = require("node:fs");
const { randomBytes } = require("node:crypto");

const file = ".env.shipment-staff.local";

if (fs.existsSync(file)) {
  console.log("Existing staff credentials preserved.");
  process.exit(0);
}

const content = [
  "BOOTSTRAP_STAFF_USERNAME=shipment_staff_practice",
  "BOOTSTRAP_STAFF_EMAIL=shipment_staff_practice@example.com",
  "BOOTSTRAP_STAFF_PASSWORD=" + randomBytes(24).toString("hex"),
  "",
].join("\n");

fs.writeFileSync(file, content, { flag: "wx" });
console.log("Created staff credentials in .env.shipment-staff.local.");
