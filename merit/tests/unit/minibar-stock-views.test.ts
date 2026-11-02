import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { makeDepo, makeKat, minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const views = await import("@/modules/minibar/server/stockViews");
const stockRoute = await import("@/app/api/minibar/stock/route");
const exportRoute = await import("@/app/api/minibar/stock/export/route");
const historyRoute = await import("@/app/api/minibar/stock/product/[productId]/history/route");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  requireUser.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
const as = (ctx: Ctx) => requireUser.mockResolvedValue(ctx);

async function setStock(hotelId: string, productId: string, remaining: number, critical = 50) {
  await testDb.hotelStock.upsert({
    where: { hotelId_productId: { hotelId, productId } },
    create: { hotelId, productId, totalQty: remaining, remainingQty: remaining, criticalLevel: critical },
    update: { totalQty: remaining, usedQty: 0, remainingQty: remaining, criticalLevel: critical },
  });
}

async function extraProduct(groupId: string, name: string) {
  return testDb.product.create({
    data: { groupId, name: `${name}-${randomUUID().slice(0, 6)}`, purchasePrice: "1.00", salePrice: "2.00" },
  });
}

describe("myStock", () => {
  it("STOKOUT önce gelir, sayaçlar doğru, fiyat alanı yok, başka otel görünmez", async () => {
    const w = await minibarWorld();
    const chips = await extraProduct(w.group.id, "Cips");
    await setStock(w.hotelId, w.cola.id, 0);
    await setStock(w.hotelId, w.water.id, 40);
    await setStock(w.hotelId, chips.id, 200);
    const diamond = await minibarWorld({ hotelCode: "DIAMOND" });
    await setStock(diamond.hotelId, diamond.cola.id, 7);
    const kat = await makeKat();

    const res = await views.myStock(kat.ctx);
    expect(res.rows.map((r) => r.status)).toEqual(["STOKOUT", "KRITIK", "NORMAL"]);
    expect(res.rows[0]!.productId).toBe(w.cola.id);
    expect(res.counts).toEqual({ STOKOUT: 1, KRITIK: 1, DIKKAT: 0, NORMAL: 1 });
    expect(res.rows.map((r) => r.productId)).not.toContain(diamond.cola.id);
    expect(JSON.stringify(res)).not.toMatch(/price/i);
  });

  it("ekran yetkisi olmayan rol FORBIDDEN alır", async () => {
    await minibarWorld();
    const gar = await staff("R-GAR");
    expect(await codeOf(views.myStock(gar.ctx))).toBe("FORBIDDEN");
  });
});

describe("criticalStocks", () => {
  it("gruplar ve eksik azalan sırada", async () => {
    const w = await minibarWorld();
    const a = await extraProduct(w.group.id, "A");
    const b = await extraProduct(w.group.id, "B");
    const c = await extraProduct(w.group.id, "C");
    await setStock(w.hotelId, w.cola.id, 0); // stokout, missing 50
    await setStock(w.hotelId, w.water.id, 45); // kritik, missing 5
    await setStock(w.hotelId, a.id, 20); // kritik, missing 30
    await setStock(w.hotelId, b.id, 60); // dikkat, missing 0
    await setStock(w.hotelId, c.id, 500); // normal
    const kat = await makeKat();
    const r = await views.criticalStocks(kat.ctx);
    expect(r.counts).toEqual({ total: 4, stokout: 1, kritik: 2, dikkat: 1 });
    expect(r.groups.kritik.map((x) => x.missing)).toEqual([30, 5]);
    expect(r.groups.stokout[0]).toMatchObject({ productId: w.cola.id, remaining: 0, critical: 50, missing: 50 });
    expect(r.groups.dikkat[0]!.missing).toBe(0);
    expect(JSON.stringify(r)).not.toMatch(/price/i);
  });
});

describe("setCriticalLevel", () => {
  it("kat sorumlusu seviyeyi günceller ve audit yazar; geçersiz değerler VALIDATION", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    await views.setCriticalLevel(kat.ctx, { productId: w.cola.id, level: 30 });
    const row = await testDb.hotelStock.findUniqueOrThrow({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.cola.id } },
    });
    expect(row.criticalLevel).toBe(30);
    expect(await testDb.auditLog.count({ where: { action: "STOCK_CRITICAL_LEVEL", userId: kat.userId } })).toBe(1);
    expect(await codeOf(views.setCriticalLevel(kat.ctx, { productId: w.cola.id, level: -1 }))).toBe("VALIDATION");
    expect(await codeOf(views.setCriticalLevel(kat.ctx, { productId: w.cola.id, level: 1.5 }))).toBe("VALIDATION");
  });

  it("yetkisiz rol FORBIDDEN alır", async () => {
    const w = await minibarWorld();
    const gar = await staff("R-GAR");
    expect(await codeOf(views.setCriticalLevel(gar.ctx, { productId: w.cola.id, level: 5 }))).toBe("FORBIDDEN");
  });
});

describe("productHistory", () => {
  it("kat sorumlusuna yalnız kendi ikameleri, depoya havuz hareketleri gelir", async () => {
    const w = await minibarWorld();
    const katA = await makeKat();
    const katB = await makeKat();
    const depo = await makeDepo();
    for (const [who, qty] of [
      [katA.userId, 2],
      [katB.userId, 3],
    ] as const) {
      await testDb.minibarTransaction.create({
        data: {
          hotelId: w.hotelId,
          roomId: w.room!.id,
          userId: who,
          type: "SETUP_KONTROL",
          items: { create: [{ productId: w.cola.id, consumed: qty, added: qty }] },
        },
      });
    }
    await testDb.hotelStockMovement.createMany({
      data: [
        { hotelId: w.hotelId, productId: w.cola.id, userId: depo.userId, type: "GIRIS", qty: 10 },
        { hotelId: w.hotelId, productId: w.cola.id, userId: depo.userId, type: "KULLANIM", qty: 5 },
      ],
    });

    const mine = await views.productHistory(katA.ctx, w.cola.id);
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0]).toMatchObject({ type: "IKAME", qty: 2, roomNumber: w.room!.number });
    expect(mine.totals.used).toBe(2);
    expect(mine.totals.movements).toBe(1);

    const pool = await views.productHistory(depo.ctx, w.cola.id);
    expect(pool.rows.map((r) => r.type).sort()).toEqual(["GIRIS", "KULLANIM"]);
    expect(JSON.stringify([mine, pool])).not.toMatch(/price/i);
  });
});

describe("exportStockXlsx", () => {
  it("dosya adı biçimi doğru, ExcelJS ile okununca başlık ve satırlar tutar, fiyat sütunu yok", async () => {
    const w = await minibarWorld();
    await setStock(w.hotelId, w.cola.id, 0);
    const kat = await makeKat();
    const file = await views.exportStockXlsx(kat.ctx);
    expect(file.fileName).toMatch(/^zimmet_stoklari_\d{8}_\d{6}\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file.data as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    const header = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    expect(header).toEqual(["Ürün", "Grup", "Toplam", "Kullanılan", "Kalan", "Kritik Seviye", "Durum"]);
    expect(ws.rowCount).toBe(1 + 2);
    expect(header.join(" ")).not.toMatch(/fiyat/i);
    expect(String(ws.getRow(2).getCell(7).value)).toBe("Stok yok");
  });
});

describe("stok rotaları", () => {
  it("oturumsuz 401, yetkisiz 403, yetkili 200", async () => {
    const w = await minibarWorld();
    const { DomainError } = await import("@/lib/result");
    requireUser.mockRejectedValue(new DomainError("UNAUTHORIZED", "Oturum bulunamadı"));
    expect((await stockRoute.GET(new Request("http://localhost/api/minibar/stock"))).status).toBe(401);
    const gar = await staff("R-GAR");
    as(gar.ctx);
    expect((await stockRoute.GET(new Request("http://localhost/api/minibar/stock"))).status).toBe(403);
    expect((await exportRoute.GET()).status).toBe(403);
    const kat = await makeKat();
    as(kat.ctx);
    const ok = await stockRoute.GET(new Request("http://localhost/api/minibar/stock"));
    expect(ok.status).toBe(200);
    expect((await ok.json()).rows).toHaveLength(2);
    const xl = await exportRoute.GET();
    expect(xl.headers.get("content-disposition")).toMatch(/zimmet_stoklari_\d{8}_\d{6}\.xlsx/);
    const patch = await stockRoute.PATCH(
      new Request("http://localhost/api/minibar/stock", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId: w.cola.id, level: 12 }),
      }),
    );
    expect(patch.status).toBe(200);
    const hist = await historyRoute.GET(
      new Request(`http://localhost/api/minibar/stock/product/${w.cola.id}/history`),
      { params: Promise.resolve({ productId: w.cola.id }) },
    );
    expect(hist.status).toBe(200);
  });
});
