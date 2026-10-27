const fs = require("node:fs");
const crypto = require("node:crypto");

const file = ".env";
let content = fs.readFileSync(file, "utf8");

if (/^PRODUCT_APP_PASSWORD=/m.test(content)) {
  console.log("PRODUCT_APP_PASSWORD da ton tai, giu nguyen.");
  process.exit(0);
}

const password = crypto.randomBytes(24).toString("hex");

content = content.trimEnd() +
  "\nPRODUCT_APP_PASSWORD=" + password + "\n";

fs.writeFileSync(file, content);

console.log("Da them PRODUCT_APP_PASSWORD vao .env.");
