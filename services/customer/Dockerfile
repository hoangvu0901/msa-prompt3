FROM node:24-bookworm-slim

WORKDIR /app

COPY services/customer/package.json services/customer/package-lock.json ./

RUN npm ci --omit=dev

COPY services/customer/src ./src
COPY proto/customer.proto ./proto/customer.proto
COPY proto/auth.proto ./proto/auth.proto

USER node

CMD ["node", "src/server.js"]
