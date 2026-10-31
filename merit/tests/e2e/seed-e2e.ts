import { pgAdapter } from "../../src/lib/pgAdapter";
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
  const db = new PrismaClient({ adapter: pgAdapter(connectionString()) });
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
    const outlets: Record<string, string> = {};
    for (const name of ["Havuz Bar", "Beach Bar"]) {
      const outlet = await db.outlet.create({
        data: {
          hotelId: mr,
          name,
          type: "BAR",
          // P5: the pool bar takes table orders.
          ...(name === "Havuz Bar" ? { hasOrdering: true, orderingEnabled: true } : {}),
        },
      });
      outlets[name] = outlet.id;
      await db.outletMember.create({ data: { userId: garson.id, outletId: outlet.id } });
    }
    const pool = outlets["Havuz Bar"];
    for (const label of ["M1", "M2", "M3", "M4", "M5"]) {
      await db.outletTable.create({ data: { outletId: pool, label } });
    }
    // P5 staff, all members of Havuz Bar: cashier, kitchen display operator, head waiter.
    for (const [username, roleCode] of [
      ["kasa.havuz", "R-KAS"],
      ["kds.havuz", "R-KDS"],
      ["sef.havuz", "R-SGF"],
    ] as const) {
      const staff = await makeUser(username, roleCode, "MR");
      await db.outletMember.create({ data: { userId: staff.id, outletId: pool } });
    }
    // F&B manager of the MR hotel (QR menu / order management).
    await makeUser("fbm.mr", "R-FBM", "MR");

    await makeUser("bos.kullanici", "R-OUT", "MR");
    // Management role without the system screens (CR-SYS): sees Komuta Merkezi only.
    await makeUser("mudur.mr", "R-OTM", "MR");
    // Management role that may edit the MR hotel settings (CR-SYS V,D for MR only): no system scope.
    await makeUser("ayar.mr", "R-FBM", "MR");
    await db.roleScreenPermission.create({
      data: {
        roleId: await role("R-FBM"),
        screenId: (await db.appScreen.findUniqueOrThrow({ where: { code: "CR-SYS" } })).id,
        hotelId: mr,
        canView: true,
        canEdit: true,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

resetAndSeed().catch((error) => {
  console.error(error);
  process.exit(1);
});
