import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { pgAdapter } from "@/lib/pgAdapter";

declare global {
  var __prisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  return new PrismaClient({
    adapter: pgAdapter(env.DATABASE_URL),
    log: ["warn", "error"],
  });
}

export const prisma: PrismaClient = globalThis.__prisma ?? createClient();

// Next's production route/instrumentation bundles may evaluate this module independently.
// Keep the process-wide client in production too: DB_POOL_MAX must cap one pool per process,
// rather than a new pool for each bundle that imports Prisma.
globalThis.__prisma = prisma;
