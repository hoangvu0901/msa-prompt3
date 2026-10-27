const fs = require("node:fs");

const file = "compose.yaml";
const original = fs.readFileSync(file, "utf8");
const content = original.replace(/\r\n/g, "\n");

if (/^  customer-service:/m.test(content)) {
  console.log("customer-service da ton tai. Khong them trung.");
  process.exit(0);
}

if (!/^services:\s*$/m.test(content)) {
  console.error("STOP: Khong tim thay services.");
  process.exit(1);
}

const service = `services:
  customer-service:
    build:
      context: .
      dockerfile: services/customer/Dockerfile
    image: msa-prompt3-customer:1.0
    environment:
      NODE_ENV: production
      PGHOST: customer-db
      PGPORT: "5432"
      PGDATABASE: customer_db
      PGUSER: customer_user
      PGPASSWORD: \${CUSTOMER_DB_PASSWORD:?Missing CUSTOMER_DB_PASSWORD}
    depends_on:
      customer-db:
        condition: service_healthy

`;

fs.copyFileSync(file, file + ".backup-" + Date.now());

fs.writeFileSync(
  file,
  content.replace(/^services:\s*$/m, () => service)
);

console.log("Da them customer-service vao Compose.");
