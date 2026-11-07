import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { verifyQrToken } from "@/lib/qr";
import { runSeed } from "../../prisma/seed";
import { DEMO_DB_ERROR, assertTrainingDatabase, databaseNameFromUrl, formatSummary, runDemoSeed } from "../../prisma/seed-demo";
import { businessDate, businessDay } from "../../src/lib/time";
import { testDb, truncate } from "../helpers/db";

const db = testDb;
const PASSWORD = "Egitim!Demo-2026";
const NOW = new Date();

async function counts() {
  return {
    users: await db.user.count(),
    rooms: await db.room.count(),
    floors: await db.floor.count(),
    tables: await db.outletTable.count(),
    outlets: await db.outlet.count(),
    menu: await db.menuNode.count(),
    translations: await db.menuNodeTranslation.count(),
    orders: await db.order.count(),
    orderItems: await db.orderItem.count(),
    orderEvents: await db.orderEvent.count(),
    mybar: await db.mybarRequest.count(),
    dnd: await db.roomDnd.count(),
    tasks: await db.dailyTask.count(),
    taskItems: await db.dailyTaskItem.count(),
    guestRecords: await db.guestRecord.count(),
    minibarTx: await db.minibarTransaction.count(),
    stocks: await db.hotelStock.count(),
    stockMoves: await db.hotelStockMovement.count(),
    members: await db.outletMember.count(),
    assignments: await db.tableAssignment.count(),
    printers: await db.printer.count(),
    printJobs: await db.printJob.count(),
    calls: await db.waiterCall.count(),
    products: await db.product.count(),
    setups: await db.setup.count(),
  };
}

describe("seed-demo (gerçek test DB)", () => {
  let first: Awaited<ReturnType<typeof runDemoSeed>>;
  let before: Awaited<ReturnType<typeof counts>>;

  beforeAll(async () => {
    await truncate("hotels", "roles", "app_screens", "settings", "users", "product_groups", "setups", "menu_themes");
    process.env.SEED_ADMIN_PASSWORD ||= "Test!Admin-2026";
    await runSeed(db, { legacyDefinitions: false });
    process.env.DEMO_PASSWORD = PASSWORD;
    first = await runDemoSeed(db, { today: NOW });
    before = await counts();
  }, 180_000);

  afterAll(() => {
    delete process.env.DEMO_PASSWORD;
  });

  describe("koruma", () => {
    it("veritabanı adı eğitim/demo/test ile bitmiyorsa reddeder", () => {
      for (const name of ["merit", "merit_prod", "meritegitim", "merit_load", "", "testmerit"]) {
        expect(() => assertTrainingDatabase(name), name).toThrow(DEMO_DB_ERROR);
      }
      for (const name of ["merit_egitim", "merit_demo", "merit_test", "merit_test_p8t5", "x_egitim"]) {
        expect(() => assertTrainingDatabase(name), name).not.toThrow();
      }
    });

    it("bağlantı adresinden veritabanı adını okur (sorgu parametreleri yok sayılır)", () => {
      expect(databaseNameFromUrl("postgresql://u:p@localhost:5432/merit?schema=public")).toBe("merit");
      expect(databaseNameFromUrl("postgresql://u:p@localhost:5432/merit_egitim")).toBe("merit_egitim");
    });

    it("runDemoSeed, adı merit olan veritabanında hiçbir şey yazmadan hata verir", async () => {
      // Any write would call a missing method and fail with a TypeError, not with the guard message.
      const fake = { $queryRaw: async () => [{ name: "merit" }] } as unknown as PrismaClient;
      await expect(runDemoSeed(fake)).rejects.toThrow(DEMO_DB_ERROR);
    });

    it("DEMO_PASSWORD yoksa veya kısaysa hata verir", async () => {
      const saved = process.env.DEMO_PASSWORD;
      try {
        delete process.env.DEMO_PASSWORD;
        await expect(runDemoSeed(db)).rejects.toThrow(/DEMO_PASSWORD/);
        process.env.DEMO_PASSWORD = "kisa";
        await expect(runDemoSeed(db)).rejects.toThrow(/DEMO_PASSWORD/);
      } finally {
        process.env.DEMO_PASSWORD = saved;
      }
    });
  });

  describe("senaryo", () => {
    it("Merit Royal icin 30 oda ve imzali QR belirtecleri vardir", async () => {
      const hotel = await db.hotel.findUniqueOrThrow({ where: { code: "ROYAL" } });
      const rooms = await db.room.findMany({ where: { hotelId: hotel.id } });
      expect(rooms).toHaveLength(30);
      for (const room of rooms) {
        expect(room.qrToken).toHaveLength(30);
        expect(verifyQrToken(room.qrToken!, "ROOM", room.id)).toBe(true);
      }
      const types = await db.roomType.findMany({ where: { hotelId: hotel.id }, orderBy: { name: "asc" } });
      expect(types.map((t) => [t.name, t.cabinetCount])).toEqual([
        ["Standart", 2],
        ["Suit", 3],
      ]);
      expect(rooms.filter((r) => r.extension)).toHaveLength(3);
      const diamond = await db.hotel.findUniqueOrThrow({ where: { code: "DIAMOND" } });
      expect(await db.room.count({ where: { hotelId: diamond.id } })).toBe(5);
    });

    it("egitim.* kullanicilari vardir, parola bcrypt'tir ve e-postalar @example.invalid", async () => {
      const users = await db.user.findMany({ where: { username: { startsWith: "egitim." } }, include: { role: true } });
      expect(users.map((u) => u.username).sort()).toEqual(
        ["admin", "depo", "fbm", "garson1", "garson2", "garson3", "kasa", "kat1", "kat2", "kds", "mutfak", "oda", "sgf"].map((n) => `egitim.${n}`),
      );
      for (const user of users) {
        expect(user.passwordHash).not.toContain(PASSWORD);
        expect(user.passwordHash.startsWith("$2")).toBe(true);
        expect(await bcrypt.compare(PASSWORD, user.passwordHash)).toBe(true);
        expect(user.email).toMatch(/@example\.invalid$/);
        expect(user.emailOptIn).toBe(false);
      }
      const roleOf = Object.fromEntries(users.map((u) => [u.username, u.role.code]));
      expect(roleOf["egitim.admin"]).toBe("R-OTM");
      expect(roleOf["egitim.oda"]).toBe("R-ODS");
      expect(roleOf["egitim.kds"]).toBe("R-KDS");
      // The printed summary lists logins but never the password.
      expect(JSON.stringify(first) + formatSummary(first)).not.toContain(PASSWORD);
    }, 60_000);

    it("masa belirtecleri 30 karakter ve dogrulanabilir; her outlet'te 10 masa", async () => {
      const hotel = await db.hotel.findUniqueOrThrow({ where: { code: "ROYAL" } });
      for (const name of ["Havuz Bar", "Beach Bar", "Ana Restoran"]) {
        const outlet = await db.outlet.findFirstOrThrow({ where: { hotelId: hotel.id, name } });
        const tables = await db.outletTable.findMany({ where: { outletId: outlet.id } });
        expect(tables).toHaveLength(10);
        for (const table of tables) {
          expect(table.qrToken).toHaveLength(30);
          expect(verifyQrToken(table.qrToken!, "TABLE", table.id)).toBe(true);
        }
      }
    });

    it("Havuz Bar 4 kategori 6 oge 5 dil; Oda Servisi 8 oge", async () => {
      const hotel = await db.hotel.findUniqueOrThrow({ where: { code: "ROYAL" } });
      const pool = await db.outlet.findFirstOrThrow({ where: { hotelId: hotel.id, name: "Havuz Bar" } });
      expect(await db.menuNode.count({ where: { outletId: pool.id, kind: "KATEGORI" } })).toBe(4);
      const items = await db.menuNode.findMany({ where: { outletId: pool.id, kind: "OGE" }, include: { translations: true } });
      expect(items).toHaveLength(6);
      expect(items.filter((i) => !i.imageUrl).length).toBeGreaterThanOrEqual(2);
      expect(items.filter((i) => !i.isAvailable)).toHaveLength(1);
      expect(items.some((i) => i.allergens.length > 0)).toBe(true);
      for (const item of items) {
        expect(item.translations.map((t) => t.lang).sort()).toEqual(["ar", "de", "en", "ru"]);
      }
      const roomService = await db.outlet.findFirstOrThrow({ where: { hotelId: hotel.id, type: "ODA_SERVISI" } });
      expect(await db.menuNode.count({ where: { outletId: roomService.id, kind: "OGE" } })).toBe(8);
    });

    it("bugunun doluluğu, gorevler, MyBar, DND, cagri ve gecmis siparisler vardir", async () => {
      const hotel = await db.hotel.findUniqueOrThrow({ where: { code: "ROYAL" } });
      const today = businessDate(NOW);
      const dayValue = businessDay(today);
      expect(await db.guestRecord.count({ where: { hotelId: hotel.id, batchCode: `DEMO-${today}` } })).toBeGreaterThan(20);
      expect(await db.dailyTask.count({ where: { hotelId: hotel.id, date: dayValue } })).toBe(3);
      expect(await db.mybarRequest.count({ where: { hotelId: hotel.id, status: "BEKLEMEDE" } })).toBe(1);
      expect(await db.mybarRequest.count({ where: { hotelId: hotel.id, status: "TAMAMLANDI" } })).toBe(2);
      expect(await db.roomDnd.count({ where: { hotelId: hotel.id, date: dayValue, status: "AKTIF" } })).toBe(1);
      expect(await db.waiterCall.count({ where: { status: "ACIK" } })).toBe(1);
      const days = await db.order.groupBy({ by: ["businessDate"], where: { hotelId: hotel.id } });
      expect(days).toHaveLength(7);
      expect(await db.order.count({ where: { hotelId: hotel.id, kind: "ODA_SERVISI" } })).toBeGreaterThanOrEqual(7);
      expect(await db.minibarTransaction.count({ where: { hotelId: hotel.id } })).toBeGreaterThan(20);
      const stock = await db.hotelStock.findMany({ where: { hotelId: hotel.id } });
      expect(stock).toHaveLength(12);
      expect(stock.filter((s) => s.remainingQty <= s.criticalLevel)).toHaveLength(1);
    });

    it("garsonlar masalara atanmis; yazici pasif ve test fisi ornegi var", async () => {
      const g1 = await db.user.findUniqueOrThrow({ where: { username: "egitim.garson1" } });
      expect(await db.tableAssignment.count({ where: { userId: g1.id, isActive: true } })).toBe(4);
      const printer = await db.printer.findFirstOrThrow({ where: { ip: "192.0.2.50" } });
      expect(printer.isActive).toBe(false);
      expect(await db.printJob.count({ where: { printerId: printer.id, kind: "TEST" } })).toBe(1);
    });
  });

  describe("idempotans", () => {
    it("ikinci kosuda hicbir tablonun satir sayisi degismez", async () => {
      const second = await runDemoSeed(db, { today: NOW });
      expect(await counts()).toEqual(before);
      expect(second).toEqual(first);
    }, 180_000);

    it("DEMO_PASSWORD degisince parola guncellenir, sayilar ayni kalir", async () => {
      process.env.DEMO_PASSWORD = "Baska!Parola-2026";
      try {
        await runDemoSeed(db, { today: NOW });
      } finally {
        process.env.DEMO_PASSWORD = PASSWORD;
      }
      const user = await db.user.findUniqueOrThrow({ where: { username: "egitim.kasa" } });
      expect(await bcrypt.compare("Baska!Parola-2026", user.passwordHash)).toBe(true);
      expect(await counts()).toEqual(before);
      await runDemoSeed(db, { today: NOW });
    }, 180_000);

    it("ertesi gun: eski gun kayitlari silinmez, yeni gun batchCode eklenir", async () => {
      const tomorrow = new Date(NOW.getTime() + 86_400_000);
      const todayCode = `DEMO-${businessDate(NOW)}`;
      const tomorrowCode = `DEMO-${businessDate(tomorrow)}`;
      const oldRecords = await db.guestRecord.count({ where: { batchCode: todayCode } });
      expect(oldRecords).toBeGreaterThan(0);
      expect(await db.guestRecord.count({ where: { batchCode: tomorrowCode } })).toBe(0);
      await runDemoSeed(db, { today: tomorrow });
      expect(await db.guestRecord.count({ where: { batchCode: todayCode } })).toBe(oldRecords);
      expect(await db.guestRecord.count({ where: { batchCode: tomorrowCode } })).toBeGreaterThan(0);
      expect(await db.order.count({ where: { idempotencyKey: { startsWith: "demo-ord-" } } })).toBeGreaterThan(before.orders);
    }, 180_000);
  });
});
