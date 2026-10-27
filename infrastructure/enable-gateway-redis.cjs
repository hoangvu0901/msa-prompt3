const fs = require("node:fs");

const serverFile = "api-gateway/src/server.js";
const composeFile = "compose.yaml";

let server = fs.readFileSync(serverFile, "utf8")
  .replace(/\r\n/g, "\n");
const compose = fs.readFileSync(composeFile, "utf8")
  .replace(/\r\n/g, "\n");

const marker = "// Redis rate limiting enabled";

if (!server.includes(marker)) {
  const bodyParser = 'app.use(express.json({ limit: "16kb" }));';

  const healthPattern =
    /app\.get\("\/api\/health",[\s\S]*?(?=\napp\.post\()/;

  if (!server.includes(bodyParser) || !healthPattern.test(server)) {
    console.error("STOP: Cau truc server.js khong dung nhu du kien.");
    process.exit(1);
  }

  server = [
    marker,
    'const { connectRedis, closeRedis } = require("./redis-client");',
    'const { rateLimit } = require("./middleware/rate-limit");',
    'const { healthHandler } = require("./health-handler");',
    "",
    server,
  ].join("\n");

  server = server.replace(
    bodyParser,
    [
      "connectRedis();",
      'app.use(rateLimit("global", 120, 60));',
      'app.use(rateLimit("auth", 20, 60));',
      bodyParser,
    ].join("\n")
  );

  server = server.replace(
    healthPattern,
    'app.get("/api/health", healthHandler);\n'
  );

  server = server.replaceAll(
    "client.close();",
    "client.close();\n    closeRedis();"
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

if (!block.some((line) => /^      REDIS_URL:/.test(line))) {
  const index = block.findIndex(
    (line) => /^      AUTH_GRPC_ADDRESS:/.test(line)
  );

  if (index === -1) {
    console.error("STOP: Khong tim thay AUTH_GRPC_ADDRESS.");
    process.exit(1);
  }

  block.splice(index + 1, 0, "      REDIS_URL: redis://redis:6379");
}

if (!block.some((line) => /^      redis:\s*$/.test(line))) {
  const index = block.findIndex(
    (line) => /^    depends_on:\s*$/.test(line)
  );

  if (index === -1) {
    console.error("STOP: Khong tim thay depends_on.");
    process.exit(1);
  }

  block.splice(
    index + 1,
    0,
    "      redis:",
    "        condition: service_healthy"
  );
}

lines.splice(start, end - start, ...block);

const suffix = ".backup-" + Date.now();
fs.copyFileSync(serverFile, serverFile + suffix);
fs.copyFileSync(composeFile, composeFile + suffix);

fs.writeFileSync(serverFile, server);
fs.writeFileSync(composeFile, lines.join("\n"));

console.log("Da them Redis, rate limiting va health check.");
