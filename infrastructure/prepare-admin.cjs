const fs = require("node:fs");
const crypto = require("node:crypto");

const file = ".env.admin.local";

if (fs.existsSync(file)) {
  console.log("Da co .env.admin.local, giu nguyen thong tin.");
  process.exit(0);
}

const password = crypto.randomBytes(24).toString("hex");

fs.writeFileSync(
  file,
  [
    "BOOTSTRAP_ADMIN_USERNAME=admin_practice",
    "BOOTSTRAP_ADMIN_EMAIL=admin_practice@example.com",
    "BOOTSTRAP_ADMIN_PASSWORD=" + password,
    "",
  ].join("\n"),
  { mode: 0o600 }
);

console.log("Da tao thong tin Admin trong .env.admin.local.");
