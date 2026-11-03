import { pgAdapter } from "../../src/lib/pgAdapter";
import { config } from "dotenv";
import path from "node:path";
import { PrismaClient } from "../../src/generated/prisma/client";
import { hashPassword } from "../../src/lib/password";
import { runSeed } from "../../prisma/seed";
import { e2eDatabaseUrl } from "./e2eDb";
import { ensureDefaultCallOptions } from "../../src/modules/menu/server/callOptionDefaults";

// Run through tsx (see fixtures.ts): the generated Prisma client is ESM-only and cannot be loaded
// by Playwright's CommonJS test loader.
config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const TEST_PASSWORD = "Test!2026";

/** Tables that must survive the reset (Prisma's own bookkeeping). pg-boss lives in its own schema. */
const KEEP_TABLES = new Set(["_prisma_migrations"]);

/**
 * The Playwright suite resets and re-seeds a dedicated database (E2E_DATABASE_URL, else
 * DATABASE_URL_TEST), never the dev database. The guard (name ends _e2e/_test AND host is
 * localhost/127.0.0.1) lives in e2eDb.ts and runs before anything is truncated.
 */
function connectionString(): string {
  return e2eDatabaseUrl();
}

/** Fixed guest QR tokens of the guest menu spec (M1 usable, M2 inactive) and a small Havuz Bar menu. */
export const GUEST_E2E = { m1: "e2e-guest-m1", m2: "e2e-guest-m2" };

async function seedGuestMenu(db: PrismaClient, outletId: string): Promise<void> {
  await db.outletTable.update({ where: { outletId_label: { outletId, label: "M1" } }, data: { qrToken: GUEST_E2E.m1 } });
  await db.outletTable.update({
    where: { outletId_label: { outletId, label: "M2" } },
    data: { qrToken: GUEST_E2E.m2, isActive: false },
  });
  const node = (data: {
    kind: "KATEGORI" | "ALT_KATEGORI" | "GRUP" | "OGE";
    name: string;
    parentId?: string;
    price?: number;
    sortOrder?: number;
    allergens?: string[];
  }) => db.menuNode.create({ data: { outletId, ...data } });
  const cat = await node({ kind: "KATEGORI", name: "İçecekler" });
  const sub = await node({ kind: "ALT_KATEGORI", name: "Soğuk", parentId: cat.id });
  const group = await node({ kind: "GRUP", name: "Kokteyller", parentId: sub.id });
  const mojito = await node({ kind: "OGE", name: "Mojito", parentId: group.id, price: 12, sortOrder: 0, allergens: ["alkol", "sulfit"] });
  await node({ kind: "OGE", name: "Aperol Spritz", parentId: group.id, price: 10, sortOrder: 1 });
  await db.menuNodeTranslation.createMany({
    data: [
      { nodeId: cat.id, lang: "en", name: "Drinks" },
      { nodeId: cat.id, lang: "ar", name: "المشروبات" },
      { nodeId: mojito.id, lang: "ar", name: "موخيتو" },
    ],
  });
}

/**
 * Minibar acceptance world (SEED_MINIBAR=1): ROYAL has two floors with rooms 101-104 / 201-204 of one room type
 * (one cabinet) assigned the MINI and ATIŞTIRMA setups, six products with a pool of 100 each, and every room
 * carries a signed QR token. DIAMOND gets one room (for the "other hotel's QR" check). Occupancy comes from the
 * Excel files the depot clerk uploads in the spec, so no guest records are seeded.
 */
async function seedMinibarWorld(db: PrismaClient, ids: { royal: string; diamond: string; depoUserId: string }): Promise<void> {
  const { generateQrToken } = await import("../../src/lib/qr");
  const floors = new Map<number, string>();
  for (const number of [1, 2]) {
    floors.set(number, (await db.floor.create({ data: { hotelId: ids.royal, number, name: `${number}. Kat` } })).id);
  }
  const roomType = await db.roomType.create({ data: { hotelId: ids.royal, name: "Standart", cabinetCount: 1 } });
  const drinks = await db.productGroup.create({ data: { name: "İçecek" } });
  const snacks = await db.productGroup.create({ data: { name: "Atıştırmalık" } });
  const product = async (groupId: string, name: string, salePrice: string) =>
    db.product.create({ data: { groupId, name, purchasePrice: "1.00", salePrice } });
  const water = await product(drinks.id, "Su", "1.00");
  const cola = await product(drinks.id, "Kola", "3.50");
  const juice = await product(drinks.id, "Meyve Suyu", "3.00");
  const chocolate = await product(snacks.id, "Çikolata", "4.00");
  const chips = await product(snacks.id, "Cips", "4.50");
  const nuts = await product(snacks.id, "Fıstık", "5.00");
  for (const p of [water, cola, juice, chocolate, chips, nuts]) {
    await db.hotelStock.create({
      data: { hotelId: ids.royal, productId: p.id, totalQty: 100, remainingQty: 100, criticalLevel: 10 },
    });
    await db.hotelStockMovement.create({
      data: { hotelId: ids.royal, productId: p.id, userId: ids.depoUserId, type: "GIRIS", qty: 100, note: "Açılış" },
    });
  }
  const mini = await db.setup.create({
    data: {
      name: "MINI",
      items: { create: [{ productId: water.id, qty: 4 }, { productId: cola.id, qty: 2 }, { productId: juice.id, qty: 2 }] },
    },
  });
  const atistirma = await db.setup.create({
    data: {
      name: "ATIŞTIRMA",
      items: { create: [{ productId: chocolate.id, qty: 2 }, { productId: chips.id, qty: 2 }, { productId: nuts.id, qty: 2 }] },
    },
  });
  for (const setup of [mini, atistirma]) {
    await db.roomTypeSetup.create({ data: { hotelId: ids.royal, roomTypeId: roomType.id, setupId: setup.id } });
  }
  for (const [floorNo, numbers] of [[1, [101, 102, 103, 104]], [2, [201, 202, 203, 204]]] as const) {
    for (const number of numbers) {
      const room = await db.room.create({
        data: { hotelId: ids.royal, floorId: floors.get(floorNo)!, roomTypeId: roomType.id, number: String(number) },
      });
      await db.room.update({
        where: { id: room.id },
        data: { qrToken: generateQrToken("ROOM", room.id), qrGeneratedAt: new Date() },
      });
    }
  }
  const dFloor = await db.floor.create({ data: { hotelId: ids.diamond, number: 3, name: "3. Kat" } });
  const dRoom = await db.room.create({ data: { hotelId: ids.diamond, floorId: dFloor.id, number: "301" } });
  await db.room.update({ where: { id: dRoom.id }, data: { qrToken: generateQrToken("ROOM", dRoom.id), qrGeneratedAt: new Date() } });
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
    await runSeed(db, { legacyDefinitions: false });

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

    const mr = await hotel("ROYAL");
    const mrp = await hotel("PREMIUM");

    await makeUser("kat.mr", "R-KAT", "ROYAL");
    // Second floor supervisor and the ROYAL depot clerk of the minibar acceptance spec.
    await makeUser("kat2.mr", "R-KAT", "ROYAL");
    const depoMr = await makeUser("depo.mr", "R-DEP", "ROYAL");
    if (process.env.SEED_MINIBAR === "1") {
      await seedMinibarWorld(db, { royal: mr, diamond: await hotel("DIAMOND"), depoUserId: depoMr.id });
    }

    const depo = await makeUser("depo.cok", "R-DEP", "ROYAL");
    for (const hotelId of [mr, mrp]) {
      await db.userHotel.create({ data: { userId: depo.id, hotelId } });
    }

    const garson = await makeUser("garson.havuz", "R-GAR", "ROYAL");
    const outlets: Record<string, string> = {};
    const areaIds: Record<string, string> = {};
    for (const name of ["Havuz Bar", "Beach Bar"]) {
      const outlet = await db.outlet.create({
        data: {
          hotelId: mr,
          name,
          type: "BAR",
          // P5: the pool bar takes table orders.
          ...(name === "Havuz Bar" ? { hasOrdering: true, orderingEnabled: true, kdsEnabled: true } : {}),
        },
      });
      outlets[name] = outlet.id;
      // Outlets made through the admin service get the default call options; mirror that here.
      await ensureDefaultCallOptions(db, outlet.id);
      const area = await db.outletAreaDefinition.create({ data: { outletId: outlet.id, type: "KAPALI" } });
      areaIds[name] = area.id;
      await db.outletMember.create({ data: { userId: garson.id, outletId: outlet.id } });
    }
    const pool = outlets["Havuz Bar"];
    for (const label of ["M1", "M2", "M3", "M4", "M5"]) {
      await db.outletTable.create({ data: { outletId: pool, areaId: areaIds["Havuz Bar"], label } });
    }
    if (process.env.SEED_GUEST_MENU === "1") await seedGuestMenu(db, pool);
    // P5 staff, all members of Havuz Bar: cashier, kitchen display operator, head waiter.
    for (const [username, roleCode] of [
      ["kasa.havuz", "R-KAS"],
      ["kds.havuz", "R-KDS"],
      ["sef.havuz", "R-SGF"],
    ] as const) {
      const staff = await makeUser(username, roleCode, "ROYAL");
      await db.outletMember.create({ data: { userId: staff.id, outletId: pool } });
    }
    // F&B manager of the MR hotel (QR menu / order management).
    await makeUser("fbm.mr", "R-FBM", "ROYAL");

    await makeUser("bos.kullanici", "R-OUT", "ROYAL");
    // Management role without the system screens (CR-SYS): sees Komuta Merkezi only.
    await makeUser("mudur.mr", "R-OTM", "ROYAL");
    // Management role that may edit the MR hotel settings (CR-SYS V,D for MR only): no system scope.
    await makeUser("ayar.mr", "R-FBM", "ROYAL");
    await db.roleScreenPermission.create({
      data: {
        roleId: await role("R-FBM"),
        screenId: (await db.appScreen.findUniqueOrThrow({ where: { code: "CR-SYS" } })).id,
        hotelId: mr,
        canView: true,
        canEdit: true,
      },
    });

    // One user per role (`rol.<kod>`, e.g. rol.r-dep) for the landing spec. Outlet and kitchen roles
    // belong to Havuz Bar, the room service role to the hotel's room service outlet.
    const roomService = await db.outlet.findFirstOrThrow({ where: { hotelId: mr, type: "ODA_SERVISI" } });
    for (const roleDef of await db.role.findMany({ orderBy: { code: "asc" } })) {
      const roleUser = await makeUser(`rol.${roleDef.code.toLowerCase()}`, roleDef.code, "ROYAL");
      if (roleDef.kind === "OUTLET" || roleDef.kind === "MUTFAK") {
        await db.outletMember.create({
          data: { userId: roleUser.id, outletId: roleDef.code === "R-ODS" ? roomService.id : pool },
        });
      }
    }
    // Existing specs log in as these users and expect their landing page: the mandatory first-login
    // access summary is pre-acknowledged ("*" matches every hash outside production). guide.spec clears it.
    await db.$executeRaw`
      UPDATE "users" SET "prefs" = COALESCE("prefs", '{}'::jsonb) || '{"guide":{"welcomeSeenHash":"*"}}'::jsonb`;
  } finally {
    await db.$disconnect();
  }
}

/** The shared Postgres can hit max_connections while several suites run in parallel: retry those. */
async function resetAndSeedWithRetry(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await resetAndSeed();
    } catch (error) {
      const busy = /too many clients|TooManyConnections/i.test(String(error) + JSON.stringify(error));
      if (!busy || attempt >= 10) throw error;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

resetAndSeedWithRetry().catch((error) => {
  console.error(error);
  process.exit(1);
});
