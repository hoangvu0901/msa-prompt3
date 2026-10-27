FROM node:24-bookworm-slim

WORKDIR /app

COPY services/order/package.json services/order/package-lock.json ./
RUN npm ci --omit=dev

COPY services/order/src ./src
COPY proto/customer.proto ./proto/customer.proto
COPY proto/product.proto ./proto/product.proto
COPY proto/order.proto ./proto/order.proto

USER node

CMD ["node", "src/server.js"]
