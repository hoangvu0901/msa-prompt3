const fs = require("node:fs");

const file = "compose.yaml";
const original = fs.readFileSync(file, "utf8");
const content = original.replace(/\r\n/g, "\n");

if (/^  api-gateway:/m.test(content)) {
  console.log("api-gateway da ton tai. Khong them trung.");
  process.exit(0);
}

if (!/^services:\s*$/m.test(content)) {
  console.error("STOP: Khong tim thay services trong compose.yaml.");
  process.exit(1);
}

const gateway = `services:
  api-gateway:
    build:
      context: .
      dockerfile: api-gateway/Dockerfile
    image: msa-prompt3-gateway:1.0
    environment:
      NODE_ENV: production
      PORT: "3002"
      AUTH_GRPC_ADDRESS: auth-service:50051
    ports:
      - "127.0.0.1:3002:3002"
    depends_on:
      auth-service:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "src/healthcheck.js"]
      interval: 10s
      timeout: 7s
      retries: 5
      start_period: 15s

`;

fs.copyFileSync(file, file + ".backup-" + Date.now());
fs.writeFileSync(
  file,
  content.replace(/^services:\s*$/m, () => gateway)
);

console.log("Da them api-gateway vao Compose.");
