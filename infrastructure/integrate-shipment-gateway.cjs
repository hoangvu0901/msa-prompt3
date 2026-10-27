const fs = require("node:fs");

function replaceOnce(text, before, after) {
  const index = text.indexOf(before);
  if (index < 0 || text.indexOf(before, index + before.length) >= 0) {
    throw new Error("Cannot uniquely locate:\n" + before);
  }
  return text.replace(before, after);
}

const composeFiles = [
  "compose.yaml", "compose.yml",
  "docker-compose.yaml", "docker-compose.yml",
].filter(file => fs.existsSync(file));

if (composeFiles.length !== 1) {
  throw new Error("Expected exactly one root Compose file");
}

const serverFile = "api-gateway/src/server.js";
const dockerFile = "api-gateway/Dockerfile";
const composeFile = composeFiles[0];

let server = fs.readFileSync(serverFile, "utf8").replace(/\r\n/g, "\n");
let docker = fs.readFileSync(dockerFile, "utf8").replace(/\r\n/g, "\n");
let compose = fs.readFileSync(composeFile, "utf8").replace(/\r\n/g, "\n");

if (!server.includes("// Shipment integration enabled")) {
  server = `// Shipment integration enabled
const shipmentRoutes = require("./shipment-routes");
const { shipmentClient } = require("./shipment-client");
` + server;

  server = replaceOnce(
    server,
    "app.use(productRoutes);",
    "app.use(productRoutes);\napp.use(shipmentRoutes);"
  );

  const closes = server.match(/productClient\.close\(\);/g) || [];
  if (closes.length !== 2) {
    throw new Error("Expected two Product client shutdown calls");
  }

  server = server.replaceAll(
    "productClient.close();",
    "productClient.close();\n    shipmentClient.close();"
  );
}

if (!docker.includes("COPY proto/shipment.proto")) {
  docker = replaceOnce(
    docker,
    "USER node",
    "COPY proto/shipment.proto ./proto/shipment.proto\n\nUSER node"
  );
}

const pattern =
  /^  api-gateway:\n[\s\S]*?(?=^  [A-Za-z0-9_-]+:\s*$|^[A-Za-z0-9_-]+:\s*$|(?![\s\S]))/m;

const match = compose.match(pattern);
if (!match) throw new Error("Cannot find api-gateway service");

let block = match[0];

if (!block.includes("SHIPMENT_GRPC_ADDRESS:")) {
  block = replaceOnce(
    block,
    "    environment:",
    "    environment:\n      SHIPMENT_GRPC_ADDRESS: shipment-service:50055"
  );
}

if (!/^      shipment-service:\s*$/m.test(block)) {
  block = replaceOnce(
    block,
    "    depends_on:",
    `    depends_on:
      shipment-service:
        condition: service_healthy`
  );
}

compose = compose.replace(pattern, () => block);

for (const [file, content] of [
  [serverFile, server],
  [dockerFile, docker],
  [composeFile, compose],
]) {
  if (fs.readFileSync(file, "utf8") === content) {
    console.log("UNCHANGED:", file);
    continue;
  }

  fs.copyFileSync(file, file + ".backup-" + Date.now());
  fs.writeFileSync(file, content);
  console.log("UPDATED:", file);
}
