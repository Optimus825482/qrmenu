import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

const sql = readFileSync(
  path.resolve(__dirname, "../../prisma/migrations/20261103093000_minibar_tamamlama_temel/migration.sql"),
  "utf8",
);
const dataBlock = sql.slice(sql.indexOf("-- @data:begin"), sql.indexOf("-- @data:end"));

async function applyData() {
  expect(dataBlock.length).toBeGreaterThan(0);
  const statements = dataBlock
    .split(/;\s*\n/)
    .map((x) => x.replace(/^\s*--.*$/gm, "").trim())
    .filter((x) => x.length > 0);
  for (const statement of statements) await testDb.$executeRawUnsafe(statement);
}

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("migration veri bloğu (@data)", () => {
  it("eski işaretsiz hareket satırları işaretli hale gelir ve tekrar çalıştırmak değiştirmez", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    const mk = (type: "KULLANIM" | "MYBAR" | "IADE" | "GIRIS", qty: number, refType?: string) =>
      testDb.hotelStockMovement.create({
        data: { hotelId: w.hotelId, productId: w.cola.id, userId: kat.userId, type, qty, refType: refType ?? null },
      });
    const rows = [
      await mk("KULLANIM", 5),
      await mk("MYBAR", 2),
      await mk("IADE", 3, "MinibarTransaction"),
      await mk("GIRIS", -1),
      await mk("IADE", 4),
    ];
    const ids = rows.map((r) => r.id);
    const read = async () => {
      const after = await testDb.hotelStockMovement.findMany({ where: { id: { in: ids } } });
      const byId = new Map(after.map((r) => [r.id, r.qty]));
      return ids.map((id) => byId.get(id));
    };
    await applyData();
    expect(await read()).toEqual([-5, -2, 3, 1, -4]);
    await applyData();
    expect(await read()).toEqual([-5, -2, 3, 1, -4]);
  });

  it("DUZELTME satırına dokunmaz", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    const row = await testDb.hotelStockMovement.create({
      data: { hotelId: w.hotelId, productId: w.cola.id, userId: kat.userId, type: "DUZELTME", qty: -7 },
    });
    await applyData();
    expect((await testDb.hotelStockMovement.findUniqueOrThrow({ where: { id: row.id } })).qty).toBe(-7);
  });

  it("doluluk ve yükleme görevi türleri normalleşir", async () => {
    const w = await minibarWorld();
    const kat = await staff("R-KAT");
    const kinds = ["ARRIVALS", "DEPARTURES", "GENERAL", "BILINMEYEN", "IN_HOUSE"];
    for (const [i, kind] of kinds.entries()) {
      await testDb.occupancyUpload.create({
        data: { hotelId: w.hotelId, code: `U${i}`, fileName: "x.xlsx", kind, userId: kat.userId },
      });
      await testDb.uploadTask.create({
        data: { hotelId: w.hotelId, date: new Date(Date.UTC(2026, 10, 1 + i)), kind },
      });
    }
    await applyData();
    const expected = ["ARRIVAL", "DEPARTURE", "IN_HOUSE", "IN_HOUSE", "IN_HOUSE"];
    expect((await testDb.occupancyUpload.findMany({ orderBy: { code: "asc" } })).map((u) => u.kind)).toEqual(expected);
    expect((await testDb.uploadTask.findMany({ orderBy: { date: "asc" } })).map((u) => u.kind)).toEqual(expected);
  });

  it("tekrar eden görev kalemlerinde en küçük id kalır", async () => {
    const w = await minibarWorld();
    const task = await testDb.dailyTask.create({
      data: { hotelId: w.hotelId, date: new Date(Date.UTC(2026, 10, 3)), type: "INHOUSE_KONTROL" },
    });
    await testDb.$executeRawUnsafe(`DROP INDEX "daily_task_items_task_id_room_id_key"`);
    try {
      for (const id of ["z-dup", "a-dup", "m-dup"]) {
        await testDb.$executeRawUnsafe(
          `INSERT INTO "daily_task_items" ("id","task_id","room_id","updated_at") VALUES ($1,$2,$3,now())`,
          id,
          task.id,
          w.room.id,
        );
      }
      await applyData();
      const left = await testDb.dailyTaskItem.findMany({ where: { taskId: task.id } });
      expect(left.map((i) => i.id)).toEqual(["a-dup"]);
    } finally {
      await testDb.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "daily_task_items_task_id_room_id_key" ON "daily_task_items"("task_id","room_id")`,
      );
    }
  });

  it("bakiye onarımı: used >= 0 ve total = used + remaining", async () => {
    const w = await minibarWorld({ stock: 10 });
    await testDb.$executeRawUnsafe(`ALTER TABLE "hotel_stocks" DROP CONSTRAINT "hotel_stocks_used_qty_check"`);
    await testDb.$executeRawUnsafe(`ALTER TABLE "hotel_stocks" DROP CONSTRAINT "hotel_stocks_balance_check"`);
    try {
      await testDb.$executeRawUnsafe(
        `UPDATE "hotel_stocks" SET "used_qty" = -3, "total_qty" = 99 WHERE "hotel_id" = $1 AND "product_id" = $2`,
        w.hotelId,
        w.cola.id,
      );
      await applyData();
      const s = await testDb.hotelStock.findUniqueOrThrow({
        where: { hotelId_productId: { hotelId: w.hotelId, productId: w.cola.id } },
      });
      expect(s).toMatchObject({ usedQty: 0, remainingQty: 10, totalQty: 10 });
    } finally {
      await testDb.$executeRawUnsafe(
        `ALTER TABLE "hotel_stocks" ADD CONSTRAINT "hotel_stocks_used_qty_check" CHECK ("used_qty" >= 0)`,
      );
      await testDb.$executeRawUnsafe(
        `ALTER TABLE "hotel_stocks" ADD CONSTRAINT "hotel_stocks_balance_check" CHECK ("total_qty" - "used_qty" = "remaining_qty")`,
      );
    }
  });
});
