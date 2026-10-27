const fs = require("node:fs");

const files = [
  "compose.yaml", "compose.yml",
  "docker-compose.yaml", "docker-compose.yml",
].filter(file => fs.existsSync(file));

if (files.length !== 1) {
  throw new Error("Expected exactly one root Compose file");
}

const file = files[0];
const content = fs.readFileSync(file, "utf8");

const pattern =
  /^  shipment-service:\r?\n[\s\S]*?(?=^  [A-Za-z0-9_-]+:\s*$|^[A-Za-z0-9_-]+:\s*$|(?![\s\S]))/m;

const match = content.match(pattern);
if (!match) throw new Error("Cannot find shipment-service block");

if (/^    healthcheck:/m.test(match[0])) {
  console.log("Shipment healthcheck already exists.");
  process.exit(0);
}

const replacement = match[0].trimEnd() + `
    healthcheck:
      test: ["CMD", "node", "src/healthcheck.js"]
      interval: 10s
      timeout: 7s
      retries: 5
      start_period: 15s

`;

fs.copyFileSync(file, file + ".backup-" + Date.now());
fs.writeFileSync(file, content.replace(pattern, () => replacement));
console.log("UPDATED:", file);
