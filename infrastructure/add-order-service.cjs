const fs = require("node:fs");

const file = "compose.yaml";
const original = fs.readFileSync(file, "utf8");
const content = original.replace(/\r\n/g, "\n");

if (/^  order-service:/m.test(content)) {
  console.log("order-service da ton tai. Khong them trung.");
  process.exit(0);
}

if (!/^services:\s*$/m.test(content)) {
  console.error("STOP: Khong tim thay services.");
  process.exit(1);
}

const service = `services:
  order-service:
    build:
      context: .
      dockerfile: services/order/Dockerfile
    image: msa-prompt3-order:1.0
    environment:
      NODE_ENV: production
      PGHOST: order-db
      PGPORT: "5432"
      PGDATABASE: order_db
      PGUSER: order_user
      PGPASSWORD: \${ORDER_DB_PASSWORD:?Missing ORDER_DB_PASSWORD}
    depends_on:
      order-db:
        condition: service_healthy

`;

fs.copyFileSync(file, file + ".backup-" + Date.now());

fs.writeFileSync(
  file,
  content.replace(/^services:\s*$/m, () => service)
);

console.log("Da them order-service vao Compose.");
