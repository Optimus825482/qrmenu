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

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
