# Production Dockerfile for Chat Microservice in Monorepo
FROM node:20-alpine

WORKDIR /app

# Copy monorepo manifests and shared workspace package
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY apps/chat-service ./apps/chat-service

# Install workspace dependencies
RUN npm install --workspace=chat-service --workspace=@app/shared --include-workspace-root --omit=dev

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Direct node startup (Fastest container boot, zero NPM overhead)
CMD ["node", "apps/chat-service/src/index.js"]
