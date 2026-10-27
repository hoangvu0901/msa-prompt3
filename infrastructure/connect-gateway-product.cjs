const fs = require("node:fs");

const serverFile = "api-gateway/src/server.js";
const dockerFile = "api-gateway/Dockerfile";
const composeFile = "compose.yaml";

let server = fs.readFileSync(serverFile, "utf8");
let docker = fs.readFileSync(dockerFile, "utf8");
const lines = fs.readFileSync(composeFile, "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n");

const marker = "// Product integration enabled";

if (!server.includes(marker)) {
  const anchor = "app.use(customerRoutes);";

  if (!server.includes(anchor)) {
    console.error("STOP: Khong tim thay customerRoutes.");
    process.exit(1);
  }

  server = [
    marker,
    'const productRoutes = require("./product-routes");',
    'const { productClient } = require("./product-client");',
    server,
  ].join("\n");

  server = server.replace(
    anchor,
    anchor + "\napp.use(productRoutes);"
  );

  server = server.replaceAll(
    "client.close();",
    "client.close();\n    productClient.close();"
  );
}

if (!docker.includes("COPY proto/product.proto")) {
  const anchor = "COPY proto/auth.proto ./proto/auth.proto";

  if (!docker.includes(anchor)) {
    console.error("STOP: Khong tim thay COPY auth.proto.");
    process.exit(1);
  }

  docker = docker.replace(
    anchor,
    anchor + "\nCOPY proto/product.proto ./proto/product.proto"
  );
}

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

if (!block.some((line) => /^      PRODUCT_GRPC_ADDRESS:/.test(line))) {
  const index = block.findIndex(
    (line) => /^      AUTH_GRPC_ADDRESS:/.test(line)
  );

  if (index < 0) {
    console.error("STOP: Thieu AUTH_GRPC_ADDRESS.");
    process.exit(1);
  }

  block.splice(
    index + 1,
    0,
    "      PRODUCT_GRPC_ADDRESS: product-service:50053"
  );
}

if (!block.some((line) => /^      product-service:\s*$/.test(line))) {
  const index = block.findIndex(
    (line) => /^    depends_on:\s*$/.test(line)
  );

  if (index < 0) {
    console.error("STOP: Thieu depends_on.");
    process.exit(1);
  }

  block.splice(
    index + 1,
    0,
    "      product-service:",
    "        condition: service_healthy"
  );
}

lines.splice(start, end - start, ...block);

const suffix = ".backup-" + Date.now();
for (const file of [serverFile, dockerFile, composeFile]) {
  fs.copyFileSync(file, file + suffix);
}

fs.writeFileSync(serverFile, server);
fs.writeFileSync(dockerFile, docker);
fs.writeFileSync(composeFile, lines.join("\n"));

console.log("Da noi Product Service voi Gateway.");
