import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { makeDepo, makeKat, minibarWorld, resetMinibarData, type MinibarWorld } from "../helpers/minibarFixtures";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const svc = await import("@/modules/minibar/server/stockRequests");
const { publish } = await import("@/lib/realtime");
const listRoute = await import("@/app/api/minibar/stock-requests/route");
const suggestRoute = await import("@/app/api/minibar/stock-requests/suggest/route");
const approveRoute = await import("@/app/api/minibar/stock-requests/[id]/approve/route");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  await testDb.stockRequest.deleteMany();
  requireUser.mockReset();
  vi.mocked(publish).mockClear();
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
const msgOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as Error).message;
  }
};
const ymd = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Nicosia" }).format(new Date()).replaceAll("-", "");

async function setStock(w: MinibarWorld, productId: string, remaining: number, critical = 50) {
  await testDb.hotelStock.upsert({
    where: { hotelId_productId: { hotelId: w.hotelId, productId } },
    create: { hotelId: w.hotelId, productId, totalQty: remaining, remainingQty: remaining, criticalLevel: critical },
    update: { totalQty: remaining, usedQty: 0, remainingQty: remaining, criticalLevel: critical },
  });
}

/** A pending request of `kat` for cola x`cola` and water x`water`; returns the id and item ids. */
async function pending(kat: { ctx: Ctx }, w: MinibarWorld, cola = 50, water = 20) {
  const { id } = await svc.createStockRequest(kat.ctx, {
    items: [
      { productId: w.cola.id, requestedQty: cola, urgency: "ACIL" },
      { productId: w.water.id, requestedQty: water, urgency: "NORMAL" },
    ],
  });
  const items = await testDb.stockRequestItem.findMany({ where: { requestId: id } });
  const itemOf = (productId: string) => items.find((i) => i.productId === productId)!.id;
  return { id, colaItem: itemOf(w.cola.id), waterItem: itemOf(w.water.id) };
}

async function approved(kat: { ctx: Ctx }, depo: { ctx: Ctx }, w: MinibarWorld) {
  const r = await pending(kat, w);
  await svc.approveRequest(depo.ctx, r.id, [
    { itemId: r.colaItem, approvedQty: 40 },
    { itemId: r.waterItem, approvedQty: 10 },
  ]);
  return r;
}

describe("suggestRequest", () => {
  it("Su 10/50 -> 65 ACIL, NORMAL ürün listede yok, çarpan ayardan gelir", async () => {
    const w = await minibarWorld();
    await setStock(w, w.water.id, 10);
    await setStock(w, w.cola.id, 500);
    const kat = await makeKat();
    const r = await svc.suggestRequest(kat.ctx);
    expect(r.lines).toEqual([
      expect.objectContaining({ productId: w.water.id, remaining: 10, critical: 50, suggestedQty: 65, urgency: "ACIL" }),
    ]);
    await testDb.setting.create({
      data: { key: "stock.requestSafetyFactor", hotelId: w.hotelId, value: 2.0 },
    });
    const r2 = await svc.suggestRequest(kat.ctx);
    expect(r2.lines[0]!.suggestedQty).toBe(90);
    expect(JSON.stringify(r2)).not.toMatch(/price/i);
  });
});

describe("createStockRequest", () => {
  it("kod KST-yyyyMMdd-0001, durum BEKLEMEDE, audit, R-DEP'e tek bildirim ve olay", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    const depo = await makeDepo();
    const { id, code } = await svc.createStockRequest(kat.ctx, {
      note: "acil",
      items: [{ productId: w.cola.id, requestedQty: 30, urgency: "ACIL" }],
    });
    expect(code).toBe(`KST-${ymd()}-0001`);
    const row = await testDb.stockRequest.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(row).toMatchObject({ status: "BEKLEMEDE", hotelId: w.hotelId, requestedById: kat.userId, note: "acil" });
    expect(row.items).toHaveLength(1);
    expect(await testDb.auditLog.count({ where: { action: "STOCK_REQUEST_CREATE", entityId: id } })).toBe(1);
    const notes = await testDb.notification.findMany({ where: { type: "stockrequest.created" } });
    expect(notes).toHaveLength(1);
    expect(notes[0]!.userId).toBe(depo.userId);
    const types = vi.mocked(publish).mock.calls.map((c) => c[0].type);
    expect(types).toContain("stockrequest.created");
  });

  it("10 eşzamanlı talep 10 benzersiz kod üretir (0001..0010)", async () => {
    const w = await minibarWorld();
    const kats = await Promise.all(Array.from({ length: 10 }, () => makeKat()));
    const res = await Promise.all(
      kats.map((k) =>
        svc.createStockRequest(k.ctx, { items: [{ productId: w.cola.id, requestedQty: 5, urgency: "NORMAL" }] }),
      ),
    );
    const codes = res.map((r) => r.code).sort();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toBe(`KST-${ymd()}-0001`);
    expect(codes[9]).toBe(`KST-${ymd()}-0010`);
  });

  it("boş liste, yinelenen ürün, geçersiz adet VALIDATION; aynı clientRequestId ikinci talep açmaz", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    expect(await msgOf(svc.createStockRequest(kat.ctx, { items: [] }))).toBe("Talep listesi boş olamaz");
    expect(
      await msgOf(
        svc.createStockRequest(kat.ctx, {
          items: [
            { productId: w.cola.id, requestedQty: 1, urgency: "NORMAL" },
            { productId: w.cola.id, requestedQty: 2, urgency: "NORMAL" },
          ],
        }),
      ),
    ).toBe("Aynı ürün birden fazla kez eklenmiş");
    expect(
      await codeOf(
        svc.createStockRequest(kat.ctx, { items: [{ productId: w.cola.id, requestedQty: 0, urgency: "NORMAL" }] }),
      ),
    ).toBe("VALIDATION");
    expect(
      await codeOf(
        svc.createStockRequest(kat.ctx, { items: [{ productId: "yok", requestedQty: 1, urgency: "NORMAL" }] }),
      ),
    ).toBe("VALIDATION");
    const clientRequestId = randomUUID();
    const input = { clientRequestId, items: [{ productId: w.cola.id, requestedQty: 3, urgency: "NORMAL" as const }] };
    const a = await svc.createStockRequest(kat.ctx, input);
    const b = await svc.createStockRequest(kat.ctx, input);
    expect(b).toEqual(a);
    expect(await testDb.stockRequest.count()).toBe(1);
  });
});

describe("approveRequest", () => {
  it("kısmi onay (40/10) kalemleri ve durumu yazar, sahibine bildirim gider", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    const depo = await makeDepo();
    const r = await approved(kat, depo, w);
    const row = await testDb.stockRequest.findUniqueOrThrow({ where: { id: r.id }, include: { items: true } });
    expect(row.status).toBe("ONAYLANDI");
    expect(row.handledById).toBe(depo.userId);
    expect(row.approvedAt).not.toBeNull();
    expect(Object.fromEntries(row.items.map((i) => [i.id, i.approvedQty]))).toEqual({
      [r.colaItem]: 40,
      [r.waterItem]: 10,
    });
    expect(await testDb.auditLog.count({ where: { action: "STOCK_REQUEST_APPROVE", entityId: r.id } })).toBe(1);
    const notes = await testDb.notification.findMany({ where: { type: "stockrequest.approved" } });
    expect(notes.map((n) => n.userId)).toEqual([kat.userId]);
    expect(vi.mocked(publish).mock.calls.map((c) => c[0].type)).toContain("stockrequest.updated");
  });

  it("tümü 0 VALIDATION, fazla adet VALIDATION, onaylı talebe tekrar approve CONFLICT", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    const depo = await makeDepo();
    const r = await pending(kat, w);
    expect(
      await codeOf(
        svc.approveRequest(depo.ctx, r.id, [
          { itemId: r.colaItem, approvedQty: 0 },
          { itemId: r.waterItem, approvedQty: 0 },
        ]),
      ),
    ).toBe("VALIDATION");
    expect(await codeOf(svc.approveRequest(depo.ctx, r.id, [{ itemId: r.colaItem, approvedQty: 51 }]))).toBe(
      "VALIDATION",
    );
    await svc.approveRequest(depo.ctx, r.id, [{ itemId: r.colaItem, approvedQty: 5 }]);
    const again = svc.approveRequest(depo.ctx, r.id, [{ itemId: r.colaItem, approvedQty: 5 }]);
    expect(await msgOf(again)).toBe("Sadece bekleyen talepler onaylanabilir. Mevcut durum: ONAYLANDI");
    expect(await codeOf(svc.approveRequest(depo.ctx, r.id, [{ itemId: r.colaItem, approvedQty: 5 }]))).toBe("CONFLICT");
  });

  it("kat sorumlusu onaylayamaz (FORBIDDEN)", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    const r = await pending(kat, w);
    expect(await codeOf(svc.approveRequest(kat.ctx, r.id, [{ itemId: r.colaItem, approvedQty: 5 }]))).toBe("FORBIDDEN");
  });
});

describe("rejectRequest", () => {
  it("kısa sebep VALIDATION; red durumu, sebebi ve sahibine bildirimi yazar", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    const depo = await makeDepo();
    const r = await pending(kat, w);
    expect(await msgOf(svc.rejectRequest(depo.ctx, r.id, "ab"))).toBe("Red sebebi en az 3 karakter olmalı");
    await svc.rejectRequest(depo.ctx, r.id, "stok yok");
    const row = await testDb.stockRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ status: "REDDEDILDI", rejectReason: "stok yok", handledById: depo.userId });
    expect(await testDb.auditLog.count({ where: { action: "STOCK_REQUEST_REJECT", entityId: r.id } })).toBe(1);
    const notes = await testDb.notification.findMany({ where: { type: "stockrequest.rejected" } });
    expect(notes.map((n) => n.userId)).toEqual([kat.userId]);
    expect(await codeOf(svc.rejectRequest(depo.ctx, r.id, "tekrar"))).toBe("CONFLICT");
    expect(await codeOf(svc.rejectRequest(kat.ctx, r.id, "deneme"))).toBe("FORBIDDEN");
  });
});

describe("deliverRequest", () => {
  it("kısmi teslim (30/40 + 10/10) havuza GIRIS yazar, kalan açık kalır (ONAYLANDI); ikinci teslim tamamlar", async () => {
    const w = await minibarWorld();
    await setStock(w, w.cola.id, 15);
    const kat = await makeKat();
    const depo = await makeDepo();
    const r = await approved(kat, depo, w);
    expect(
      await svc.deliverRequest(depo.ctx, r.id, [
        { itemId: r.colaItem, deliveredQty: 30 },
        { itemId: r.waterItem, deliveredQty: 10 },
      ]),
    ).toEqual({ id: r.id, status: "ONAYLANDI" });
    const cola = await testDb.hotelStock.findUniqueOrThrow({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.cola.id } },
    });
    expect(cola).toMatchObject({ remainingQty: 45, totalQty: 45 });
    const moves = await testDb.hotelStockMovement.findMany({ where: { refType: "StockRequest", refId: r.id } });
    expect(moves).toHaveLength(2);
    expect(moves.find((m) => m.productId === w.cola.id)).toMatchObject({ type: "GIRIS", qty: 30, userId: depo.userId });
    let row = await testDb.stockRequest.findUniqueOrThrow({ where: { id: r.id }, include: { items: true } });
    expect(row.status).toBe("ONAYLANDI");
    expect(row.deliveredAt).toBeNull();
    expect(row.items.find((i) => i.id === r.colaItem)!.deliveredQty).toBe(30);
    const notes = await testDb.notification.findMany({ where: { type: "stockrequest.delivered" } });
    expect(notes.map((n) => n.userId)).toEqual([kat.userId]);
    expect(vi.mocked(publish).mock.calls.map((c) => c[0].type)).toContain("stock.changed");

    // The rest: more than the open 10 is rejected, exactly 10 completes the request.
    expect(await msgOf(svc.deliverRequest(depo.ctx, r.id, [{ itemId: r.colaItem, deliveredQty: 11 }]))).toBe(
      "Teslim edilen miktar kalan onaylı miktarı aşamaz",
    );
    expect(await svc.deliverRequest(depo.ctx, r.id, [{ itemId: r.colaItem, deliveredQty: 10 }])).toEqual({
      id: r.id,
      status: "TESLIM_EDILDI",
    });
    row = await testDb.stockRequest.findUniqueOrThrow({ where: { id: r.id }, include: { items: true } });
    expect(row.status).toBe("TESLIM_EDILDI");
    expect(row.deliveredAt).not.toBeNull();
    expect(row.items.find((i) => i.id === r.colaItem)!.deliveredQty).toBe(40);
    expect(row.items.find((i) => i.id === r.waterItem)!.deliveredQty).toBe(10);
    expect((await testDb.hotelStock.findUniqueOrThrow({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.cola.id } },
    })).remainingQty).toBe(55);
    expect(await testDb.auditLog.count({ where: { action: "STOCK_REQUEST_DELIVER", entityId: r.id } })).toBe(2);
  });

  it("havuz satırı olmayan ürün için satır açılır", async () => {
    const w = await minibarWorld();
    await testDb.hotelStock.deleteMany({ where: { hotelId: w.hotelId } });
    const kat = await makeKat();
    const depo = await makeDepo();
    const r = await approved(kat, depo, w);
    await svc.deliverRequest(depo.ctx, r.id, [{ itemId: r.colaItem, deliveredQty: 7 }]);
    const row = await testDb.hotelStock.findUniqueOrThrow({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.cola.id } },
    });
    expect(row).toMatchObject({ remainingQty: 7, totalQty: 7, usedQty: 0 });
  });

  it("eşzamanlı çift teslim: biri CONFLICT, havuz bir kez artar, tek GIRIS", async () => {
    const w = await minibarWorld();
    await setStock(w, w.cola.id, 10);
    const kat = await makeKat();
    const depo = await makeDepo();
    const r = await approved(kat, depo, w);
    const call = () =>
      svc.deliverRequest(depo.ctx, r.id, [
        { itemId: r.colaItem, deliveredQty: 40 },
        { itemId: r.waterItem, deliveredQty: 10 },
      ]);
    const res = await Promise.all([codeOf(call()), codeOf(call())]);
    expect(res.sort()).toEqual(["CONFLICT", "OK"]);
    const cola = await testDb.hotelStock.findUniqueOrThrow({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.cola.id } },
    });
    expect(cola.remainingQty).toBe(50);
    expect(await testDb.hotelStockMovement.count({ where: { refId: r.id, productId: w.cola.id } })).toBe(1);
  });

  it("bekleyen, teslim edilmiş talep ve fazla adet reddedilir; R-KAT teslim edemez", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    const depo = await makeDepo();
    const r = await pending(kat, w);
    expect(await msgOf(svc.deliverRequest(depo.ctx, r.id, [{ itemId: r.colaItem, deliveredQty: 1 }]))).toBe(
      "Onaylı olmayan talep teslim edilemez",
    );
    await svc.approveRequest(depo.ctx, r.id, [{ itemId: r.colaItem, approvedQty: 40 }]);
    expect(await codeOf(svc.deliverRequest(kat.ctx, r.id, [{ itemId: r.colaItem, deliveredQty: 1 }]))).toBe("FORBIDDEN");
    expect(await codeOf(svc.deliverRequest(depo.ctx, r.id, [{ itemId: r.colaItem, deliveredQty: 41 }]))).toBe(
      "VALIDATION",
    );
    await svc.deliverRequest(depo.ctx, r.id, [{ itemId: r.colaItem, deliveredQty: 40 }]);
    expect(await msgOf(svc.deliverRequest(depo.ctx, r.id, [{ itemId: r.colaItem, deliveredQty: 1 }]))).toBe(
      "Talep zaten teslim edildi",
    );
  });
});

describe("cancelRequest", () => {
  it("sahibi bekleyen talebini iptal eder; başkasının talebi NOT_FOUND; teslim edilmiş iptal edilemez", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    const other = await makeKat();
    const depo = await makeDepo();
    const r = await pending(kat, w);
    expect(await codeOf(svc.cancelRequest(other.ctx, r.id))).toBe("NOT_FOUND");
    await svc.cancelRequest(kat.ctx, r.id);
    expect((await testDb.stockRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("IPTAL");
    expect(await testDb.auditLog.count({ where: { action: "STOCK_REQUEST_CANCEL", entityId: r.id } })).toBe(1);
    expect(await codeOf(svc.cancelRequest(kat.ctx, r.id))).toBe("CONFLICT");

    const d = await approved(kat, depo, w);
    expect(await codeOf(svc.cancelRequest(kat.ctx, d.id))).toBe("CONFLICT"); // sahibi yalnız bekleyeni iptal eder
    await svc.deliverRequest(depo.ctx, d.id, [
      { itemId: d.colaItem, deliveredQty: 40 },
      { itemId: d.waterItem, deliveredQty: 10 },
    ]);
    expect(await codeOf(svc.cancelRequest(depo.ctx, d.id, "yanlış"))).toBe("CONFLICT");
  });

  it("kısmen teslim edilmiş talebi depo iptal ederse kalan kapanır: durum TESLIM_EDILDI, teslim edilen havuzda kalır", async () => {
    const w = await minibarWorld();
    await setStock(w, w.cola.id, 0);
    const kat = await makeKat();
    const depo = await makeDepo();
    const r = await approved(kat, depo, w);
    await svc.deliverRequest(depo.ctx, r.id, [{ itemId: r.colaItem, deliveredQty: 5 }]);
    expect(await svc.cancelRequest(depo.ctx, r.id, "tedarik bitti")).toEqual({ id: r.id, status: "TESLIM_EDILDI" });
    const row = await testDb.stockRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ status: "TESLIM_EDILDI", rejectReason: "tedarik bitti" });
    expect((await testDb.hotelStock.findUniqueOrThrow({
      where: { hotelId_productId: { hotelId: w.hotelId, productId: w.cola.id } },
    })).remainingQty).toBe(5);
  });

  it("depo onaylı talebi sebeple iptal eder, sahibine bildirim gider; sebep zorunlu", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    const depo = await makeDepo();
    const r = await approved(kat, depo, w);
    expect(await codeOf(svc.cancelRequest(depo.ctx, r.id))).toBe("VALIDATION");
    await svc.cancelRequest(depo.ctx, r.id, "tedarik yok");
    expect((await testDb.stockRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("IPTAL");
    const notes = await testDb.notification.findMany({ where: { type: "stockrequest.cancelled" } });
    expect(notes.map((n) => n.userId)).toEqual([kat.userId]);
  });
});

describe("listRequests", () => {
  it("kat yalnız kendi taleplerini, depo oturum otelinin hepsini görür; kpis ve poolRemaining", async () => {
    const w = await minibarWorld();
    await setStock(w, w.cola.id, 12);
    const kat = await makeKat();
    const other = await makeKat();
    const depo = await makeDepo();
    const a = await pending(kat, w);
    await pending(other, w);
    await svc.approveRequest(depo.ctx, a.id, [{ itemId: a.colaItem, approvedQty: 5 }]);
    await svc.deliverRequest(depo.ctx, a.id, [{ itemId: a.colaItem, deliveredQty: 5 }]);

    const mine = await svc.listRequests(kat.ctx, { page: 1, pageSize: 20 });
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]!.id).toBe(a.id);
    expect(mine.items[0]!.items.find((i) => i.productId === w.cola.id)!.poolRemaining).toBe(17);

    const all = await svc.listRequests(depo.ctx, { page: 1, pageSize: 20 });
    expect(all.total).toBe(2);
    expect(all.kpis).toEqual({ pending: 1, approved: 0, deliveredToday: 1 });

    const pend = await svc.listRequests(depo.ctx, { status: ["BEKLEMEDE"], page: 1, pageSize: 20 });
    expect(pend.items).toHaveLength(1);
    expect(JSON.stringify(all)).not.toMatch(/price/i);
  });

  it("depo başka otelin talebini görmez", async () => {
    const w = await minibarWorld();
    const diamond = await minibarWorld({ hotelCode: "DIAMOND" });
    const katD = await makeKat("DIAMOND");
    await svc.createStockRequest(katD.ctx, {
      items: [{ productId: diamond.cola.id, requestedQty: 3, urgency: "NORMAL" }],
    });
    const depo = await makeDepo("ROYAL");
    const res = await svc.listRequests(depo.ctx, { page: 1, pageSize: 20 });
    expect(res.total).toBe(0);
    expect(w.hotelId).not.toBe(diamond.hotelId);
  });
});

describe("ek talep rotaları", () => {
  const body = (b: unknown) =>
    new Request("http://localhost/api/minibar/stock-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
    });

  it("oturumsuz 401, yetkisiz 403, yetkili akış 200", async () => {
    const w = await minibarWorld();
    const { DomainError } = await import("@/lib/result");
    requireUser.mockRejectedValue(new DomainError("UNAUTHORIZED", "Oturum bulunamadı"));
    expect((await listRoute.GET(new Request("http://localhost/api/minibar/stock-requests"))).status).toBe(401);
    const { staff } = await import("../helpers/minibarFixtures");
    const gar = await staff("R-GAR");
    requireUser.mockResolvedValue(gar.ctx);
    expect((await suggestRoute.GET()).status).toBe(403);

    const kat = await makeKat();
    const depo = await makeDepo();
    requireUser.mockResolvedValue(kat.ctx);
    const created = await listRoute.POST(
      body({ items: [{ productId: w.cola.id, requestedQty: 4, urgency: "NORMAL" }] }),
    );
    expect(created.status).toBe(200);
    const { id } = await created.json();
    const list = await (await listRoute.GET(new Request("http://localhost/api/minibar/stock-requests"))).json();
    expect(list.items).toHaveLength(1);
    const item = await testDb.stockRequestItem.findFirstOrThrow({ where: { requestId: id } });
    const approve = (ctx: Ctx) => {
      requireUser.mockResolvedValue(ctx);
      return approveRoute.POST(
        new Request("http://localhost/x", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items: [{ itemId: item.id, approvedQty: 2 }] }),
        }),
        { params: Promise.resolve({ id }) },
      );
    };
    expect((await approve(kat.ctx)).status).toBe(403);
    expect((await approve(depo.ctx)).status).toBe(200);
    expect((await approve(depo.ctx)).status).toBe(409);
  });
});
