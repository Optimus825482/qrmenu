# Multi-stage production Dockerfile (repository root; build context = repository root).
# No secret is baked into any layer: secrets are supplied at runtime only.

FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# .npmrc sets legacy-peer-deps=true. Still required: react-device-frameset@1.3.4 declares a React 18
# peer while the app runs React 19, and `npm ci` fails with ERESOLVE without it (verified).
COPY merit/package.json merit/package-lock.json merit/.npmrc ./
RUN npm ci

FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY merit/ .

# Next.js production build. SKIP_ENV_VALIDATION is set for this single command only (build-time module
# imports have no runtime secrets); it is not an ENV and does not reach the runner image.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN SKIP_ENV_VALIDATION=1 NODE_ENV=production npm run build

# Production dependencies plus the few tools the entrypoint needs at runtime:
# prisma (migrate deploy), tsx + dotenv (optional db:seed), typescript (loading next.config.ts).
FROM node:22-alpine AS prod-deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY merit/package.json merit/package-lock.json merit/.npmrc ./
RUN npm ci --omit=dev \
 && npm install --no-save \
      "prisma@$(node -p "require('./package.json').devDependencies.prisma")" \
      "tsx@$(node -p "require('./package.json').devDependencies.tsx")" \
      "dotenv@$(node -p "require('./package.json').devDependencies.dotenv")" \
      "typescript@$(node -p "require('./package.json').devDependencies.typescript")" \
 && npm cache clean --force

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/.npmrc ./.npmrc
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh
RUN mkdir -p /app/uploads

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
