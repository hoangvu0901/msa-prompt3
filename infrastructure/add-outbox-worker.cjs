const fs = require("node:fs");

const candidates = [
  "compose.yaml",
  "compose.yml",
  "docker-compose.yaml",
  "docker-compose.yml",
].filter(file => fs.existsSync(file));

if (candidates.length !== 1) {
  throw new Error(
    "Expected exactly one root Compose file; found: " +
    candidates.join(", ")
  );
}

const file = candidates[0];
let content = fs.readFileSync(file, "utf8");

if (/^  outbox-worker:\s*$/m.test(content)) {
  console.log("Outbox worker already exists:", file);
  process.exit(0);
}

if (!/^services:\s*$/m.test(content)) {
  throw new Error("Cannot find services section");
}

const block = `
  outbox-worker:
    build:
      context: .
      dockerfile: services/order/Dockerfile
    image: msa-prompt3-order:1.0
    command: ["node", "src/outbox-worker.js"]
    restart: unless-stopped
    stop_grace_period: 25s
    environment:
      NODE_ENV: production
      PGHOST: order-db
      PGPORT: 5432
      PGDATABASE: order_db
      PGUSER: order_user
      PGPASSWORD: \${ORDER_DB_PASSWORD:?Missing ORDER_DB_PASSWORD}
      KAFKA_BROKERS: kafka:9092
      ORDER_CREATED_TOPIC: order-created
    depends_on:
      order-db:
        condition: service_healthy
      kafka:
        condition: service_healthy
`;

fs.copyFileSync(file, file + ".backup-" + Date.now());
content = content.replace(/^services:\s*$/m, "services:\n" + block);
fs.writeFileSync(file, content);

console.log("UPDATED:", file);
