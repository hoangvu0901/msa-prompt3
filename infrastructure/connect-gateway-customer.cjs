const fs = require("node:fs");

const serverFile = "api-gateway/src/server.js";
const composeFile = "compose.yaml";
const dockerFile = "api-gateway/Dockerfile";

let server = fs.readFileSync(serverFile, "utf8");
const compose = fs.readFileSync(composeFile, "utf8")
  .replace(/\r\n/g, "\n");
let docker = fs.readFileSync(dockerFile, "utf8");

const marker = "// Customer integration enabled";

if (!server.includes(marker)) {
  const registerLine =
    'const result = await callAuth("register", req.body, 10000);';
  const loginLine =
    'const result = await callAuth("login", req.body, 10000);';
  const routeLine = "app.use(securityRoutes);";

  if (
    !server.includes(registerLine) ||
    !server.includes(loginLine) ||
    !server.includes(routeLine)
  ) {
    console.error("STOP: Cau truc Gateway khong dung nhu du kien.");
    process.exit(1);
  }

  server = [
    marker,
    'const customerRoutes = require("./customer-routes");',
    'const { customerClient } = require("./customer-client");',
    'const { ensureCustomer, ensureCustomerFromLogin } = require("./provision-customer");',
    server,
  ].join("\n");

  server = server.replace(
    registerLine,
    registerLine + "\n      await ensureCustomer(result.uid);"
  );

  server = server.replace(
    loginLine,
    loginLine + "\n      await ensureCustomerFromLogin(result.accessToken);"
  );

  server = server.replace(
    routeLine,
    routeLine + "\napp.use(customerRoutes);"
  );

  server = server.replaceAll(
    "client.close();",
    "client.close();\n    customerClient.close();"
  );

  server = server.replaceAll(
    '"Authentication service unavailable"',
    '"Required service unavailable"'
  );
}

if (!docker.includes("COPY proto/customer.proto")) {
  const anchor = "COPY proto/auth.proto ./proto/auth.proto";

  if (!docker.includes(anchor)) {
    console.error("STOP: Khong tim thay dong COPY auth.proto.");
    process.exit(1);
  }

  docker = docker.replace(
    anchor,
    anchor + "\nCOPY proto/customer.proto ./proto/customer.proto"
  );
}

const lines = compose.split("\n");
const start = lines.findIndex(
  (line) => /^  api-gateway:\s*$/.test(line)
);

if (start < 0) {
  console.error("STOP: Khong tim thay api-gateway.");
  process.exit(1);
}

let end = start + 1;
while (end < lines.length) {
  if (/^(?:  )?[A-Za-z0-9_-]+:/.test(lines[end])) break;
  end++;
}

const block = lines.slice(start, end);

if (!block.some((line) => /^      CUSTOMER_GRPC_ADDRESS:/.test(line))) {
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
    "      CUSTOMER_GRPC_ADDRESS: customer-service:50052"
  );
}

if (!block.some((line) => /^      customer-service:\s*$/.test(line))) {
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
    "      customer-service:",
    "        condition: service_healthy"
  );
}

lines.splice(start, end - start, ...block);

const suffix = ".backup-" + Date.now();
for (const file of [serverFile, composeFile, dockerFile]) {
  fs.copyFileSync(file, file + suffix);
}

fs.writeFileSync(serverFile, server);
fs.writeFileSync(composeFile, lines.join("\n"));
fs.writeFileSync(dockerFile, docker);

console.log("Da noi Gateway voi Customer Service.");
