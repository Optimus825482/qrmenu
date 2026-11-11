# syntax=docker/dockerfile:1.7
# Production Dockerfile for Merit QR Menu & Hotel Management (BuildKit required; Coolify uses it).
# Build with the root docker-compose.yaml (context ".", dockerfile "Dockerfile"); merit/Dockerfile is the same file for builds with context merit/.
# No secret is baked into any layer: secrets are supplied at runtime only.
#
# Design (fast redeploys):
#  * Single `npm ci` (builder). The runtime node_modules is that same tree pruned with
#    `npm prune --omit=dev` + the four tools the entrypoint needs, so there is no second full install.
#  * Layer order: package files -> npm ci -> prisma schema -> prisma generate (once) -> sources -> build.
#    When only source files change, install and generate layers come from cache.
#  * npm download cache and .next/cache are BuildKit cache mounts (survive between builds).
#  * `output: "standalone"` is intentionally NOT used: the entrypoint runs `prisma migrate deploy`
#    (prisma CLI + prisma.config.ts) and optionally `tsx prisma/seed.ts` (imports src/lib/*), and route
#    handlers read uploads via process.cwd(); all of these need the full tree, so standalone would save
#    little and risk breaking them.

FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# .npmrc sets legacy-peer-deps=true. Still required: react-device-frameset@1.3.4 declares a React 18
# peer while the app runs React 19, and `npm ci` fails with ERESOLVE without it (verified).
COPY merit/package.json merit/package-lock.json merit/.npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Prisma client is generated once, from the schema only (output: src/generated/prisma).
# SKIP_ENV_VALIDATION lets prisma.config.ts use a placeholder URL; no connection is made.
COPY merit/prisma.config.ts ./
COPY merit/prisma/schema.prisma ./prisma/schema.prisma
RUN SKIP_ENV_VALIDATION=1 npx prisma generate

COPY merit/ .

# Next.js build only (prisma generate already ran above; `npm run build` would run it a second time).
# Typecheck stays enabled. SKIP_ENV_VALIDATION applies to this command only, not to the runner image.
# Heap ceiling for the build step (typecheck + bundling); it is a limit, not a reservation.
RUN --mount=type=cache,target=/app/.next/cache \
    SKIP_ENV_VALIDATION=1 NODE_ENV=production NODE_OPTIONS="--max-old-space-size=3072" npx next build

# Turn the build tree into the runtime tree: production deps only, plus the tools the entrypoint needs
# at runtime: prisma (migrate deploy), tsx + dotenv (optional db:seed), typescript (loading next.config.ts).
RUN --mount=type=cache,target=/root/.npm \
    npm prune --omit=dev \
 && npm install --no-save --no-audit --no-fund \
      "prisma@$(node -p "require('./package.json').devDependencies.prisma")" \
      "tsx@$(node -p "require('./package.json').devDependencies.tsx")" \
      "dotenv@$(node -p "require('./package.json').devDependencies.dotenv")" \
      "typescript@$(node -p "require('./package.json').devDependencies.typescript")"

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/.npmrc ./.npmrc
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder /app/public ./public
# Runtime-read files: PDF fonts and the room QR print artwork (read via process.cwd()/assets).
COPY --from=builder /app/assets ./assets
# Printed room QR check (COOLIFY_DEPLOYMENT.md): compares the database with the printed cards.
COPY --from=builder /app/scripts/oda-qr-dogrula.ts ./scripts/oda-qr-dogrula.ts
COPY --from=builder /app/scripts/migrate-from-minibarlatest ./scripts/migrate-from-minibarlatest
COPY --from=builder /app/scripts/ornek-kullanici-temizle.ts ./scripts/ornek-kullanici-temizle.ts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/.next ./.next

RUN chmod +x ./docker-entrypoint.sh \
 && mkdir -p /app/uploads

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
