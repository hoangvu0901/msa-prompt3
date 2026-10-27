FROM node:24-bookworm-slim

WORKDIR /app

COPY services/shipment/package.json services/shipment/package-lock.json ./
RUN npm ci --omit=dev

COPY services/shipment/src ./src
COPY proto/shipment.proto ./proto/shipment.proto

USER node

CMD ["node", "src/server.js"]
