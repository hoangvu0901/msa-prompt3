const fs = require("node:fs");

const requiredFiles = [
  "proto/auth.proto",
  "services/auth/src/infrastructure/database.js",
  "services/auth/src/infrastructure/grpc-contract.js",
  "services/auth/src/server.js",
  "services/auth/src/healthcheck.js",
  "services/auth/Dockerfile",
  ".dockerignore",
];

const missing = requiredFiles.filter((file) => !fs.existsSync(file));

if (missing.length) {
  console.error("STOP: Thieu file:", missing.join(", "));
  process.exit(1);
}

const file = "compose.yaml";
const original = fs.readFileSync(file, "utf8");
const lines = original.replace(/\r\n/g, "\n").split("\n");

const starts = lines
  .map((line, index) => /^  auth-service:\s*$/.test(line) ? index : -1)
  .filter((index) => index >= 0);

if (starts.length !== 1) {
  console.error("STOP: Can dung mot khoi auth-service trong compose.yaml.");
  process.exit(1);
}

const start = starts[0];
let end = start + 1;

while (end < lines.length) {
  if (/^(?:  )?[A-Za-z0-9_-]+:/.test(lines[end])) break;
  end++;
}

const replacement = [
  "  auth-service:",
  "    build:",
  "      context: .",
  "      dockerfile: services/auth/Dockerfile",
  "    image: msa-prompt3-auth:1.0",
  "    environment:",
  "      NODE_ENV: production",
  '      GRPC_PORT: "50051"',
  "      PGHOST: auth-db",
  '      PGPORT: "5432"',
  "      PGDATABASE: auth_db",
  "      PGUSER: auth_user",
  "      PGPASSWORD: ${AUTH_DB_PASSWORD:?Missing AUTH_DB_PASSWORD}",
  "    depends_on:",
  "      auth-db:",
  "        condition: service_healthy",
  "    healthcheck:",
  '      test: ["CMD", "node", "src/healthcheck.js"]',
  "      interval: 10s",
  "      timeout: 7s",
  "      retries: 5",
  "      start_period: 15s",
  "",
];

const backup = "compose.yaml.backup-" + Date.now();
fs.writeFileSync(backup, original);

lines.splice(start, end - start, ...replacement);
fs.writeFileSync(file, lines.join("\n"));

console.log("Da sao luu: " + backup);
console.log("Da cap nhat auth-service.");
