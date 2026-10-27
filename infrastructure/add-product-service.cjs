const fs = require("node:fs");

const file = "compose.yaml";
const original = fs.readFileSync(file, "utf8");
const content = original.replace(/\r\n/g, "\n");

if (/^  product-service:/m.test(content)) {
  console.log("product-service da ton tai. Khong them trung.");
  process.exit(0);
}

if (!/^services:\s*$/m.test(content)) {
  console.error("STOP: Khong tim thay services.");
  process.exit(1);
}

const service = `services:
  product-service:
    build:
      context: .
      dockerfile: services/product/Dockerfile
    image: msa-prompt3-product:1.0
    environment:
      NODE_ENV: production
      MONGO_ADDRESS: mongodb://product-db:27017
      MONGO_DATABASE: product_db
      MONGO_USER: product_user
      MONGO_PASSWORD: \${PRODUCT_APP_PASSWORD:?Missing PRODUCT_APP_PASSWORD}
    depends_on:
      product-db:
        condition: service_healthy

`;

fs.copyFileSync(file, file + ".backup-" + Date.now());

fs.writeFileSync(
  file,
  content.replace(/^services:\s*$/m, () => service)
);

console.log("Da them product-service vao Compose.");
