# Multi-stage: build client then run server
FROM node:20-alpine AS base

WORKDIR /app
COPY . .

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.7.0 --activate

# Install deps and build client
RUN pnpm -w install
RUN pnpm -w --filter client build




# Production image
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
# Copy only what's needed
COPY --from=base /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=base /app/server ./server
COPY --from=base /app/client/dist ./server/public
COPY --from=base /app/node_modules ./node_modules

EXPOSE 8080
CMD ["node", "server/dist/server.cjs"]

