FROM node:24-bookworm-slim

WORKDIR /app

COPY services/auth/package.json services/auth/package-lock.json ./

RUN npm ci --omit=dev

COPY services/auth/src ./src
COPY proto/auth.proto ./proto/auth.proto

USER node

CMD ["node", "src/server.js"]
