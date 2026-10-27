const fs = require("node:fs");

const candidates = [
  "compose.yaml",
  "compose.yml",
  "docker-compose.yaml",
  "docker-compose.yml",
].filter(file => fs.existsSync(file));

if (candidates.length !== 1) {
  throw new Error(
    "Expected exactly one root Compose file; found: " + candidates.join(", ")
  );
}

const file = candidates[0];
let content = fs.readFileSync(file, "utf8");

if (/^  order-worker:\s*$/m.test(content)) {
  console.log("Order worker already exists:", file);
  process.exit(0);
}

if (!/^services:\s*$/m.test(content)) {
  throw new Error("Cannot find services section");
}

const block = `
  order-worker:
    build:
      context: .
      dockerfile: services/order/Dockerfile
    image: msa-prompt3-order:1.0
    command: ["node", "src/order-worker.js"]
    restart: unless-stopped
    stop_grace_period: 25s
    environment:
      NODE_ENV: production
      PGHOST: order-db
      PGPORT: 5432
      PGDATABASE: order_db
      PGUSER: order_user
      PGPASSWORD: \${ORDER_DB_PASSWORD:?Missing ORDER_DB_PASSWORD}
      CUSTOMER_GRPC_ADDRESS: customer-service:50052
      PRODUCT_GRPC_ADDRESS: product-service:50053
    depends_on:
      order-db:
        condition: service_healthy
      customer-service:
        condition: service_healthy
      product-service:
        condition: service_healthy
`;

fs.copyFileSync(file, file + ".backup-" + Date.now());
content = content.replace(/^services:\s*$/m, "services:\n" + block);
fs.writeFileSync(file, content);

console.log("UPDATED:", file);
