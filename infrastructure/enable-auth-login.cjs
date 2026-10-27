const fs = require("node:fs");
const crypto = require("node:crypto");

const serverFile = "services/auth/src/server.js";
const composeFile = "compose.yaml";
const envFile = ".env";

let server = fs.readFileSync(serverFile, "utf8");
let compose = fs.readFileSync(composeFile, "utf8").replace(/\r\n/g, "\n");
let env = fs.readFileSync(envFile, "utf8");

const importLine =
  'const { login } = require("./interfaces/login-handler");';

if (!server.includes(importLine)) {
  const target =
    /server\.addService\(auth\.AuthService\.service,\s*\{\s*healthCheck,\s*register,\s*\}\);/;

  if (!target.test(server)) {
    console.error("STOP: Khong tim thay khoi addService nhu du kien.");
    process.exit(1);
  }

  server = importLine + "\n" + server.replace(
    target,
    "server.addService(auth.AuthService.service, {\n  healthCheck,\n  register,\n  login,\n});"
  );
}

const lines = compose.split("\n");
const starts = lines
  .map((line, index) => /^  auth-service:\s*$/.test(line) ? index : -1)
  .filter((index) => index >= 0);

if (starts.length !== 1) {
  console.error("STOP: Can dung mot khoi auth-service.");
  process.exit(1);
}

const start = starts[0];
let end = start + 1;

while (end < lines.length) {
  if (/^(?:  )?[A-Za-z0-9_-]+:/.test(lines[end])) break;
  end++;
}

const block = lines.slice(start, end);

if (!block.some((line) => /^\s+JWT_SECRET:/.test(line))) {
  const passwordIndex = block.findIndex(
    (line) => /^      PGPASSWORD:/.test(line)
  );

  if (passwordIndex === -1) {
    console.error("STOP: Khong tim thay PGPASSWORD cua auth-service.");
    process.exit(1);
  }

  block.splice(
    passwordIndex + 1,
    0,
    "      JWT_SECRET: ${JWT_SECRET:?Missing JWT_SECRET}"
  );
}

lines.splice(start, end - start, ...block);
compose = lines.join("\n");

if (!/^JWT_SECRET=/m.test(env)) {
  const secret = crypto.randomBytes(48).toString("hex");
  env = env.trimEnd() + "\nJWT_SECRET=" + secret + "\n";
}

const suffix = ".backup-" + Date.now();
fs.copyFileSync(serverFile, serverFile + suffix);
fs.copyFileSync(composeFile, composeFile + suffix);

fs.writeFileSync(serverFile, server);
fs.writeFileSync(composeFile, compose);
fs.writeFileSync(envFile, env);

console.log("Da cap nhat Login, Compose va cau hinh JWT.");
