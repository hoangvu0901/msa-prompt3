const fs = require("node:fs");

const files = [
  "compose.yaml", "compose.yml",
  "docker-compose.yaml", "docker-compose.yml",
].filter(file => fs.existsSync(file));

if (files.length !== 1) {
  throw new Error("Expected exactly one root Compose file");
}

const file = files[0];
let content = fs.readFileSync(file, "utf8");

if (/^  shipment-consumer:\s*$/m.test(content)) {
  console.log("Shipment consumer already exists.");
  process.exit(0);
}

if (!/^services:\s*$/m.test(content)) {
  throw new Error("Cannot find services section");
}

const block = `
  shipment-consumer:
    build:
      context: .
      dockerfile: services/shipment/Dockerfile
    image: msa-prompt3-shipment:1.0
    command: ["node", "src/shipment-consumer.js"]
    restart: unless-stopped
    stop_grace_period: 25s
    environment:
      NODE_ENV: production
      MONGO_ADDRESS: mongodb://shipment-db:27017
      MONGO_DATABASE: shipment_db
      MONGO_USER: shipment_user
      MONGO_PASSWORD: \${SHIPMENT_APP_PASSWORD:?Missing SHIPMENT_APP_PASSWORD}
      KAFKA_BROKERS: kafka:9092
      KAFKA_GROUP_ID: shipment-order-created-v1
      ORDER_CREATED_TOPIC: order-created
    depends_on:
      shipment-db:
        condition: service_healthy
      kafka:
        condition: service_healthy
`;

fs.copyFileSync(file, file + ".backup-" + Date.now());
content = content.replace(/^services:\s*$/m, "services:\n" + block);
fs.writeFileSync(file, content);

console.log("UPDATED:", file);
