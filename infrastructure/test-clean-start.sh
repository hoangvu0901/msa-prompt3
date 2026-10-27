#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

export MSYS_NO_PATHCONV=1

dc() {
  docker compose \
    -p msa-prompt3-clean \
    -f compose.yaml \
    -f compose.clean.yaml \
    "$@"
}

trap 'echo "FAIL: Dung tai dong $LINENO. Giu nguyen du lieu de kiem tra."' ERR

echo "===== 1. CHECK CONFIG ====="
dc config --quiet

required_files=(
  infrastructure/auth-init.sql
  infrastructure/customer-init.sql
  infrastructure/order-init.sql
  infrastructure/order-request-migration.sql
  infrastructure/order-processing-migration.sql
  infrastructure/order-stock-commit-migration.sql
  infrastructure/order-worker-migration.sql
  infrastructure/product-init.js
  infrastructure/shipment-init.js
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "FAIL: Missing $file"
    exit 1
  fi
done

existing_volumes="$(
  docker volume ls -q \
    --filter label=com.docker.compose.project=msa-prompt3-clean
)"

if [[ -n "$existing_volumes" ]]; then
  echo "FAIL: Project msa-prompt3-clean da co volume."
  echo "Dung de tranh nham du lieu cu la database moi."
  exit 1
fi

echo "===== 2. START INFRASTRUCTURE ====="
dc up -d --wait --wait-timeout 240 \
  auth-db customer-db order-db \
  product-db shipment-db redis kafka

echo "===== 3. INIT AUTH DATABASE ====="
dc exec -T auth-db \
  psql -v ON_ERROR_STOP=1 -U auth_user -d auth_db \
  < infrastructure/auth-init.sql

echo "===== 4. INIT CUSTOMER DATABASE ====="
dc exec -T customer-db \
  psql -v ON_ERROR_STOP=1 -U customer_user -d customer_db \
  < infrastructure/customer-init.sql

echo "===== 5. INIT ORDER DATABASE ====="
for file in \
  infrastructure/order-init.sql \
  infrastructure/order-request-migration.sql \
  infrastructure/order-processing-migration.sql \
  infrastructure/order-stock-commit-migration.sql \
  infrastructure/order-worker-migration.sql
do
  echo "Applying: $file"
  dc exec -T order-db \
    psql -v ON_ERROR_STOP=1 -U order_user -d order_db \
    < "$file"
done

echo "===== 6. INIT PRODUCT DATABASE ====="
dc cp infrastructure/product-init.js \
  product-db:/tmp/product-init.js

dc exec -T product-db sh -c '
  exec mongosh --quiet \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    product_db \
    --file /tmp/product-init.js
'

echo "===== 7. INIT SHIPMENT DATABASE ====="
dc cp infrastructure/shipment-init.js \
  shipment-db:/tmp/shipment-init.js

dc exec -T shipment-db sh -c '
  exec mongosh --quiet \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    shipment_db \
    --file /tmp/shipment-init.js
'

echo "===== 8. CREATE KAFKA TOPIC ====="
dc exec -T kafka \
  /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka:9092 \
  --create --if-not-exists \
  --topic order-created \
  --partitions 1 \
  --replication-factor 1

echo "===== 9. START APPLICATION ====="
dc up -d --build --wait --wait-timeout 240

echo "===== 10. CHECK GATEWAY ====="
curl --fail --silent --show-error --max-time 20 \
  http://127.0.0.1:3003/api/health
echo

echo "===== 11. CHECK CONTAINERS ====="
dc ps -a

echo "PASS: Clean initialization and Gateway health checks."
echo "NEXT: Seed ADMIN/STAFF and run E2E on the clean environment."
