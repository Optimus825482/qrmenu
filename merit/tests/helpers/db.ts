import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL_TEST;
if (!connectionString) {
  throw new Error("DATABASE_URL_TEST is not set (merit/.env)");
}

if (connectionString === process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL_TEST must differ from DATABASE_URL: tests TRUNCATE tables and must never touch the dev database",
  );
}

export const testDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/** Empties the given tables (and everything that references them) in the test database. */
export async function truncate(...tables: string[]): Promise<void> {
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t}"`).join(", ");
  await testDb.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
