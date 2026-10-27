FROM node:24-bookworm-slim

WORKDIR /app

COPY api-gateway/package.json api-gateway/package-lock.json ./

RUN npm ci --omit=dev

COPY api-gateway/src ./src
COPY proto/auth.proto ./proto/auth.proto
COPY proto/product.proto ./proto/product.proto
COPY proto/customer.proto ./proto/customer.proto

COPY proto/shipment.proto ./proto/shipment.proto

COPY proto/order.proto ./proto/order.proto

USER node

CMD ["node", "src/server.js"]
