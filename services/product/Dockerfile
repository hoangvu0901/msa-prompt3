FROM node:24-bookworm-slim

WORKDIR /app

COPY services/product/package.json services/product/package-lock.json ./

RUN npm ci --omit=dev

COPY services/product/src ./src
COPY proto/product.proto ./proto/product.proto

USER node

CMD ["node", "src/server.js"]
