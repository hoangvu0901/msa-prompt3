const fs = require("node:fs");

const serverFile = "api-gateway/src/server.js";
const composeFile = "compose.yaml";

let server = fs.readFileSync(serverFile, "utf8");
let compose = fs.readFileSync(composeFile, "utf8")
  .replace(/\r\n/g, "\n");

const importLine =
  'const securityRoutes = require("./security-routes");';

if (!server.includes(importLine)) {
  const marker = "app.use((req, res) => {";

  if (!server.includes(marker)) {
    console.error("STOP: Khong tim thay vi tri truoc route 404.");
    process.exit(1);
  }

  server = importLine + "\n" + server.replace(
    marker,
    "app.use(securityRoutes);\n\n" + marker
  );
}

const lines = compose.split("\n");
const starts = lines
  .map((line, index) => /^  api-gateway:\s*$/.test(line) ? index : -1)
  .filter((index) => index >= 0);

if (starts.length !== 1) {
  console.error("STOP: Can dung mot khoi api-gateway.");
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
  const index = block.findIndex(
    (line) => /^      AUTH_GRPC_ADDRESS:/.test(line)
  );

  if (index === -1) {
    console.error("STOP: Khong tim thay AUTH_GRPC_ADDRESS.");
    process.exit(1);
  }

  block.splice(
    index + 1,
    0,
    "      JWT_SECRET: ${JWT_SECRET:?Missing JWT_SECRET}"
  );
}

lines.splice(start, end - start, ...block);

const suffix = ".backup-" + Date.now();
fs.copyFileSync(serverFile, serverFile + suffix);
fs.copyFileSync(composeFile, composeFile + suffix);

fs.writeFileSync(serverFile, server);
fs.writeFileSync(composeFile, lines.join("\n"));

console.log("Da them JWT middleware va phan quyen cho Gateway.");
