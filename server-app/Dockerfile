# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

# ---- deps: install all dependencies (incl. dev) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN corepack prepare pnpm@10.17.0 --activate \
  && pnpm install --frozen-lockfile

# ---- dev: hot-reload target used by docker-compose ----
FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["pnpm", "start:dev"]

# ---- build: compile TypeScript ----
FROM deps AS build
COPY . .
RUN pnpm build

# ---- prod-deps: production-only dependencies, no devDependencies ----
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN corepack prepare pnpm@10.17.0 --activate \
  && pnpm install --frozen-lockfile --prod

# ---- runtime: final production image ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nestjs && adduser -S nestjs -G nestjs
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER nestjs
EXPOSE 3000
CMD ["node", "dist/main"]
