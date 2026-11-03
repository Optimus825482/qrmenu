import { tmpdir } from "node:os";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runSeed } from "../../prisma/seed";
import { loadLegacyDefinitions } from "../../prisma/seed/legacyDefinitions";
import { testDb, truncate } from "../helpers/db";

const db = testDb;
const TABLES = ["hotels", "roles", "app_screens", "settings", "users", "product_groups", "setups"] as const;

/** Re-seed rules of the legacy reference definitions (see prisma/seed/legacyDefinitions.ts). */
describe("seedLegacyDefinitions yeniden çalıştırma kuralı (gerçek test DB)", () => {
  beforeEach(async () => {
    await truncate(...TABLES);
  });

  afterAll(async () => {
    await truncate(...TABLES);
    await db.$disconnect();
  });

  it("yönetici silinen setup kalemi ve oda tipi atamasını ikinci seed geri getirmez", async () => {
    await runSeed(db);
    const first = { setupItems: await db.setupItem.count(), roomTypeSetups: await db.roomTypeSetup.count() };
    const item = await db.setupItem.findFirstOrThrow();
    const assignment = await db.roomTypeSetup.findFirstOrThrow();
    await db.setupItem.delete({ where: { id: item.id } });
    await db.roomTypeSetup.delete({
      where: {
        hotelId_roomTypeId_setupId: {
          hotelId: assignment.hotelId,
          roomTypeId: assignment.roomTypeId,
          setupId: assignment.setupId,
        },
      },
    });
    await runSeed(db);
    const second = { setupItems: await db.setupItem.count(), roomTypeSetups: await db.roomTypeSetup.count() };
    expect(second.setupItems).toBe(first.setupItems - 1);
    expect(second.roomTypeSetups).toBe(first.roomTypeSetups - 1);
  });

  it("silinen setup bir sonraki seed'de yeniden oluşur; kalemleri ve atamaları da gelir", async () => {
    await runSeed(db);
    const setupRow = await db.setup.findFirstOrThrow({
      where: { roomTypeSetups: { some: {} }, items: { some: {} } },
      include: { items: true, roomTypeSetups: true },
    });
    const items = setupRow.items.length;
    const assignments = setupRow.roomTypeSetups.length;
    await db.roomTypeSetup.deleteMany({ where: { setupId: setupRow.id } });
    await db.setup.delete({ where: { id: setupRow.id } });
    await runSeed(db);
    const again = await db.setup.findUniqueOrThrow({
      where: { name: setupRow.name },
      include: { items: true, roomTypeSetups: true },
    });
    expect(again.items).toHaveLength(items);
    expect(again.roomTypeSetups).toHaveLength(assignments);
  });

  it("loadLegacyDefinitions çalışma dizininden bağımsızdır", () => {
    const cwd = process.cwd();
    try {
      process.chdir(tmpdir());
      expect(loadLegacyDefinitions().hotels.length).toBeGreaterThan(0);
    } finally {
      process.chdir(cwd);
    }
  });
});
