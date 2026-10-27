const fs = require("node:fs");

function replaceOnce(text, before, after) {
  const index = text.indexOf(before);
  if (index < 0 || text.indexOf(before, index + before.length) >= 0) {
    throw new Error("Cannot uniquely locate:\n" + before);
  }
  return text.replace(before, after);
}

const files = [
  "compose.yaml", "compose.yml",
  "docker-compose.yaml", "docker-compose.yml",
].filter(file => fs.existsSync(file));

if (files.length !== 1) throw new Error("Expected one root Compose file");

const serverFile = "api-gateway/src/server.js";
const dockerFile = "api-gateway/Dockerfile";
const healthFile = "api-gateway/src/health-handler.js";
const composeFile = files[0];

const read = file => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

let server = read(serverFile);
let docker = read(dockerFile);
let health = read(healthFile);
let compose = read(composeFile);

if (!server.includes("// Order integration enabled")) {
  server = `// Order integration enabled
const orderRoutes = require("./order-routes");
const { orderClient } = require("./order-client");
` + server;

  server = replaceOnce(
    server,
    "app.use(shipmentRoutes);",
    "app.use(shipmentRoutes);\napp.use(orderRoutes);"
  );

  if ((server.match(/shipmentClient\.close\(\);/g) || []).length !== 2) {
    throw new Error("Expected two Shipment client shutdown calls");
  }

  server = server.replaceAll(
    "shipmentClient.close();",
    "shipmentClient.close();\n    orderClient.close();"
  );
}

if (!docker.includes("COPY proto/order.proto")) {
  docker = replaceOnce(
    docker,
    "USER node",
    "COPY proto/order.proto ./proto/order.proto\n\nUSER node"
  );
}

if (!health.includes('require("./order-client")')) {
  health = 'const { callOrder } = require("./order-client");\n' + health;

  health = replaceOnce(
    health,
    "[auth, customer, product, shipment, redisResult]",
    "[auth, customer, product, shipment, order, redisResult]"
  );

  health = replaceOnce(
    health,
    'callShipment("healthCheck", {}, 3000),',
    'callShipment("healthCheck", {}, 3000),\n      callOrder("healthCheck", {}, 3000),'
  );

  health = replaceOnce(
    health,
    'shipment: serviceUp(shipment) ? "UP" : "DOWN",',
    'shipment: serviceUp(shipment) ? "UP" : "DOWN",\n    order: serviceUp(order) ? "UP" : "DOWN",'
  );
}

const pattern =
  /^  api-gateway:\n[\s\S]*?(?=^  [A-Za-z0-9_-]+:\s*$|^[A-Za-z0-9_-]+:\s*$|(?![\s\S]))/m;

const match = compose.match(pattern);
if (!match) throw new Error("Cannot find api-gateway service");

let block = match[0];

if (!block.includes("ORDER_GRPC_ADDRESS:")) {
  block = replaceOnce(
    block,
    "    environment:",
    "    environment:\n      ORDER_GRPC_ADDRESS: order-service:50054"
  );
}

if (!/^      order-service:\s*$/m.test(block)) {
  block = replaceOnce(
    block,
    "    depends_on:",
    `    depends_on:
      order-service:
        condition: service_healthy`
  );
}

compose = compose.replace(pattern, () => block);

for (const [file, content] of [
  [serverFile, server],
  [dockerFile, docker],
  [healthFile, health],
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
