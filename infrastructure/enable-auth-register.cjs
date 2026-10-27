const fs = require("node:fs");

const file = "services/auth/src/server.js";
let source = fs.readFileSync(file, "utf8");

const importLine =
  'const { register } = require("./interfaces/register-handler");';

if (!source.includes(importLine)) {
  const target =
    /server\.addService\(auth\.AuthService\.service,\s*\{\s*healthCheck,\s*\}\);/;

  if (!target.test(source)) {
    console.error("STOP: Khong tim thay khoi addService nhu du kien.");
    process.exit(1);
  }

  fs.copyFileSync(file, file + ".backup-" + Date.now());

  source = importLine + "\n" + source.replace(
    target,
    "server.addService(auth.AuthService.service, {\n  healthCheck,\n  register,\n});"
  );

  fs.writeFileSync(file, source);
  console.log("Da them Register vao Auth Service.");
} else {
  console.log("Register da duoc them truoc do.");
}
