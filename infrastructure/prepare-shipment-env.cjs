const fs = require("node:fs");
const { randomBytes } = require("node:crypto");

const file = ".env";
const content = fs.readFileSync(file, "utf8");

if (/^SHIPMENT_APP_PASSWORD=/m.test(content)) {
  console.log("SHIPMENT_APP_PASSWORD already exists; preserved.");
} else {
  const password = randomBytes(24).toString("hex");
  fs.appendFileSync(file, "\nSHIPMENT_APP_PASSWORD=" + password + "\n");
  console.log("Created SHIPMENT_APP_PASSWORD in .env.");
}
