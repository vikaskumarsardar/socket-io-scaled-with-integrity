# Production Dockerfile for Socket Gateway Microservice in Monorepo
FROM node:20-alpine

WORKDIR /app

# Copy monorepo manifests and shared workspace package
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY apps/socket-gateway ./apps/socket-gateway

# Install workspace dependencies
RUN npm install --workspace=socket-gateway --workspace=@app/shared --include-workspace-root --omit=dev

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Direct node startup (Fastest container boot, zero NPM overhead)
CMD ["node", "apps/socket-gateway/src/index.js"]
