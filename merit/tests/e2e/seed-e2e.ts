import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import path from "node:path";
import { PrismaClient } from "../../src/generated/prisma/client";
import { hashPassword } from "../../src/lib/password";
import { runSeed } from "../../prisma/seed";

// Run through tsx (see fixtures.ts): the generated Prisma client is ESM-only and cannot be loaded
// by Playwright's CommonJS test loader.
config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const TEST_PASSWORD = "Test!2026";

/** Tables that must survive the reset (Prisma's own bookkeeping). pg-boss lives in its own schema. */
const KEEP_TABLES = new Set(["_prisma_migrations"]);

function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

/**
 * The Playwright tests drive the dev server, which uses DATABASE_URL, so they reset and re-seed
 * the DEV database. They must never run against the unit-test database.
 */
function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (merit/.env)");
  const testUrl = process.env.DATABASE_URL_TEST;
  if (url === testUrl || databaseName(url).endsWith("_test")) {
    throw new Error("e2e must run against the dev database (DATABASE_URL), never merit_test");
  }
  return url;
}

/** Empties every application table, re-runs the seed and creates the e2e staff users. */
async function resetAndSeed(): Promise<void> {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString() }) });
  try {
    const rows = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    const tables = rows.map((r) => r.tablename).filter((t) => !KEEP_TABLES.has(t));
    await db.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
    );
    await runSeed(db);

    const passwordHash = await hashPassword(TEST_PASSWORD);
    const hotel = async (code: string) => (await db.hotel.findUniqueOrThrow({ where: { code } })).id;
    const role = async (code: string) => (await db.role.findUniqueOrThrow({ where: { code } })).id;
    const makeUser = async (username: string, roleCode: string, hotelCode: string) =>
      db.user.create({
        data: {
          username,
          passwordHash,
          fullName: `Test ${username}`,
          roleId: await role(roleCode),
          hotelId: await hotel(hotelCode),
        },
      });

    const mr = await hotel("MR");
    const mrp = await hotel("MRP");

    await makeUser("kat.mr", "R-KAT", "MR");

    const depo = await makeUser("depo.cok", "R-DEP", "MR");
    for (const hotelId of [mr, mrp]) {
      await db.userHotel.create({ data: { userId: depo.id, hotelId } });
    }

    const garson = await makeUser("garson.havuz", "R-GAR", "MR");
    for (const name of ["Havuz Bar", "Beach Bar"]) {
      const outlet = await db.outlet.create({ data: { hotelId: mr, name, type: "BAR" } });
      await db.outletMember.create({ data: { userId: garson.id, outletId: outlet.id } });
    }

    await makeUser("bos.kullanici", "R-OUT", "MR");
  } finally {
    await db.$disconnect();
  }
}

resetAndSeed().catch((error) => {
  console.error(error);
  process.exit(1);
});
