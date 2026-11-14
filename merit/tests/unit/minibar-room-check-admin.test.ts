import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { type MinibarWorld, minibarWorld, resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const rc = await import("@/modules/minibar/server/roomCheckService");
const admin = await import("@/modules/minibar/server/roomCheckAdminService");
const listRoute = await import("@/app/api/minibar/room-checks/route");
const itemRoute = await import("@/app/api/minibar/room-checks/[txId]/route");

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

// 2026-07-10 10:00 Nicosia (UTC+3) = 07:00Z
const T0 = new Date("2026-07-10T07:00:00.000Z");
const DAY = "2026-07-10";
const YESTERDAY = new Date(T0.getTime() - 24 * 3_600_000);
const YESTERDAY_DAY = "2026-07-09";

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};

const rep = (ctx: Ctx, w: MinibarWorld, qty: number, now: Date, productId = w.cola.id) =>
  rc.addReplacement(
    ctx,
    { roomId: w.room.id, items: [{ productId, setupId: w.setup.id, qty }], clientRequestId: randomUUID() },
    now,
  );

/** Two hotels, each with a floor attendant who checked a room; the R-OSS manager's session is DIAMOND, ROYAL is in scope. */
async function world() {
  const royal = await minibarWorld({ hotelCode: "ROYAL" });
  const diamond = await minibarWorld({ hotelCode: "DIAMOND" });
  const katR = await staff("R-KAT", "ROYAL");
  const katD = await staff("R-KAT", "DIAMOND");
  const oss = await staff("R-OSS", "DIAMOND", ["ROYAL"]);
  return { royal, diamond, katR, katD, oss };
}

const get = (ctx: Ctx, query = "") => {
  requireUser.mockResolvedValue(ctx);
  return listRoute.GET(new Request(`http://localhost/api/minibar/room-checks${query}`));
};

describe("Oda Kontrol İşlemleri: liste", () => {
  it("otel seçilmeden tüm otellerin kayıtlarını (otel adıyla) ve personel seçimini verir; otel seçilince tek otel", async () => {
    const { royal, diamond, katR, katD, oss } = await world();
    const a = await rep(katR.ctx, royal, 2, T0);
    const b = await rep(katD.ctx, diamond, 1, new Date(T0.getTime() + 60_000));

    const all = await admin.listRoomChecks(oss.ctx, {}, T0);
    expect(all.from).toBe(DAY);
    expect(all.to).toBe(DAY);
    expect(all.rows.map((r) => r.id)).toEqual([b.transactionId, a.transactionId]);
    expect(all.hotels.map((h) => h.id).sort()).toEqual([royal.hotelId, diamond.hotelId].sort());
    expect(all.staff.map((u) => u.id).sort()).toEqual([katR.userId, katD.userId].sort());
    const row = all.rows.find((r) => r.id === a.transactionId)!;
    expect(row).toMatchObject({
      hotelId: royal.hotelId,
      roomNumber: royal.room.number,
      floorNumber: royal.floor.number,
      userId: katR.userId,
      type: "SETUP_KONTROL",
      typeLabel: "Ürün İkamesi",
      totalItemsCount: 2,
      canEdit: true,
      canDelete: true,
    });
    expect(row.hotelName.length).toBeGreaterThan(0);
    expect(row.items).toEqual([{ productId: royal.cola.id, productName: royal.cola.name, added: 2 }]);

    const one = await admin.listRoomChecks(oss.ctx, { hotelId: royal.hotelId }, T0);
    expect(one.rows.map((r) => r.id)).toEqual([a.transactionId]);
    expect(one.hotels.map((h) => h.id)).toEqual([royal.hotelId]);
  });

  it("gün, aralık ve personel süzgeçleri; personel listesi süzgeçten etkilenmez", async () => {
    const { royal, katR, oss } = await world();
    const katR2 = await staff("R-KAT", "ROYAL");
    const today = await rep(katR.ctx, royal, 1, T0);
    const old = await rep(katR.ctx, royal, 1, YESTERDAY);
    const other = await rep(katR2.ctx, royal, 1, new Date(T0.getTime() + 60_000), royal.water.id);

    // default = the current business day
    expect((await admin.listRoomChecks(oss.ctx, {}, T0)).rows.map((r) => r.id).sort()).toEqual([today.transactionId, other.transactionId].sort());
    // another single day
    expect((await admin.listRoomChecks(oss.ctx, { day: YESTERDAY_DAY }, T0)).rows.map((r) => r.id)).toEqual([old.transactionId]);
    // from-to
    const range = await admin.listRoomChecks(oss.ctx, { from: YESTERDAY_DAY, to: DAY }, T0);
    expect(range.rows).toHaveLength(3);
    // one staff member
    const mine = await admin.listRoomChecks(oss.ctx, { from: YESTERDAY_DAY, to: DAY, userId: katR.userId }, T0);
    expect(mine.rows.map((r) => r.userId)).toEqual([katR.userId, katR.userId]);
    expect(mine.staff.map((u) => u.id).sort()).toEqual([katR.userId, katR2.userId].sort());
    // validation
    expect(await codeOf(admin.listRoomChecks(oss.ctx, { from: DAY, to: YESTERDAY_DAY }, T0))).toBe("VALIDATION");
    expect(await codeOf(admin.listRoomChecks(oss.ctx, { day: "10.07.2026" }, T0))).toBe("VALIDATION");
    expect(await codeOf(admin.listRoomChecks(oss.ctx, { from: "2026-01-01", to: DAY }, T0))).toBe("VALIDATION");
  });

  it("MyBar karşılama kaydı listelenir ama salt okunurdur", async () => {
    const { royal, katR, oss } = await world();
    const tx = await testDb.minibarTransaction.create({
      data: { hotelId: royal.hotelId, roomId: royal.room.id, userId: katR.userId, type: "MYBAR_KARSILAMA", occurredAt: T0 },
    });
    const list = await admin.listRoomChecks(oss.ctx, {}, T0);
    expect(list.rows[0]).toMatchObject({ id: tx.id, typeLabel: "MyBar Karşılama", canEdit: false, canDelete: false });
    expect(await codeOf(admin.deleteRoomCheck(oss.ctx, { transactionId: tx.id, reason: "deneme" }, T0))).toBe("VALIDATION");
    expect(await codeOf(admin.updateRoomCheck(oss.ctx, { transactionId: tx.id, updatedItems: [] }, T0))).toBe("VALIDATION");
    expect(await testDb.minibarTransaction.count({ where: { id: tx.id } })).toBe(1);
  });
});

describe("Oda Kontrol İşlemleri: yetki", () => {
  it("MB-OKI yetkisi olmayan kullanıcı (R-KAT, R-DEP, R-MTY) liste, düzenleme ve silmede FORBIDDEN alır", async () => {
    const { royal, katR } = await world();
    const tx = await rep(katR.ctx, royal, 1, T0);
    for (const code of ["R-KAT", "R-DEP", "R-MTY", "R-OTM"]) {
      const user = await staff(code, "ROYAL");
      expect(await codeOf(admin.listRoomChecks(user.ctx, {}, T0)), code).toBe("FORBIDDEN");
      expect(await codeOf(admin.listRoomChecks(user.ctx, { hotelId: royal.hotelId }, T0)), code).toBe("FORBIDDEN");
      expect(await codeOf(admin.updateRoomCheck(user.ctx, { transactionId: tx.transactionId, updatedItems: [] }, T0)), code).toBe("FORBIDDEN");
      expect(await codeOf(admin.deleteRoomCheck(user.ctx, { transactionId: tx.transactionId, reason: "deneme" }, T0)), code).toBe("FORBIDDEN");
    }
    expect(await testDb.minibarTransaction.count({ where: { id: tx.transactionId } })).toBe(1);
    // the API answers 403 as well
    expect((await get((await staff("R-KAT", "ROYAL")).ctx)).status).toBe(403);
  });

  it("yalnız görme (V) yetkisi olan kullanıcı listeler, düzenleyip silemez; kapsam dışı otel NOT_FOUND/FORBIDDEN", async () => {
    const { royal, diamond, katR } = await world();
    const tx = await rep(katR.ctx, royal, 1, T0);
    const viewer = await staff("R-DEP", "ROYAL");
    const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "MB-OKI" } });
    await testDb.userScreenPermission.create({ data: { userId: viewer.userId, screenId: screen.id, canView: true } });

    const list = await admin.listRoomChecks(viewer.ctx, {}, T0);
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({ canEdit: false, canDelete: false });
    expect(await codeOf(admin.deleteRoomCheck(viewer.ctx, { transactionId: tx.transactionId, reason: "deneme" }, T0))).toBe("FORBIDDEN");
    expect(await codeOf(admin.listRoomChecks(viewer.ctx, { hotelId: diamond.hotelId }, T0))).toBe("FORBIDDEN");

    const ossRoyalOnly = await staff("R-OSS", "DIAMOND");
    const other = await rep(katR.ctx, royal, 1, new Date(T0.getTime() + 1000), royal.water.id);
    expect(await codeOf(admin.deleteRoomCheck(ossRoyalOnly.ctx, { transactionId: other.transactionId, reason: "deneme" }, T0))).toBe("NOT_FOUND");
  });
});

describe("Oda Kontrol İşlemleri: düzenleme ve silme", () => {
  it("R-OSS başka kullanıcının GEÇMİŞ tarihli kaydını gerekçeyle siler; ürünler otel deposuna döner, gerekçe denetim kaydındadır", async () => {
    const { royal, katR, oss } = await world();
    const old = await rep(katR.ctx, royal, 3, YESTERDAY);
    expect((await stockOf(royal.hotelId, royal.cola.id)).remainingQty).toBe(97);

    expect(await codeOf(admin.deleteRoomCheck(oss.ctx, { transactionId: old.transactionId }, T0))).toBe("VALIDATION");
    expect(await codeOf(admin.deleteRoomCheck(oss.ctx, { transactionId: old.transactionId, reason: "" }, T0))).toBe("VALIDATION");
    expect(await testDb.minibarTransaction.count()).toBe(1);

    const out = await admin.deleteRoomCheck(oss.ctx, { transactionId: old.transactionId, reason: "Yanlış oda seçildi" }, T0);
    expect(out.restored).toEqual([{ productId: royal.cola.id, qty: 3 }]);
    expect(await testDb.minibarTransaction.count()).toBe(0);
    const stock = await stockOf(royal.hotelId, royal.cola.id);
    expect(stock.remainingQty).toBe(100);
    expect(stock.totalQty - stock.usedQty).toBe(stock.remainingQty);

    const logs = await testDb.auditLog.findMany({ where: { entityId: old.transactionId, action: "MINIBAR_ROOM_CHECK_ADMIN" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: oss.userId, hotelId: royal.hotelId });
    expect(logs[0]!.after).toMatchObject({ op: "SIL", reason: "Yanlış oda seçildi" });
    expect(await testDb.auditLog.count({ where: { entityId: old.transactionId, action: "MINIBAR_ROOM_CHECK_DELETE" } })).toBe(1);
  });

  it("R-OSS geçmiş kaydın adedini ve notunu düzeltir; stok farkı depoya işlenir; azaltma iade, artırma kullanım", async () => {
    const { royal, katR, oss } = await world();
    const old = await rep(katR.ctx, royal, 2, YESTERDAY);
    expect((await stockOf(royal.hotelId, royal.cola.id)).remainingQty).toBe(98);

    const up = await admin.updateRoomCheck(
      oss.ctx,
      { transactionId: old.transactionId, updatedItems: [{ productId: royal.cola.id, qty: 3 }], note: "Sayım sonrası düzeltildi", reason: "Adet hatalı" },
      T0,
    );
    expect(up.message).toMatch(/güncellendi/);
    expect((await stockOf(royal.hotelId, royal.cola.id)).remainingQty).toBe(97);
    let row = (await admin.listRoomChecks(oss.ctx, { day: YESTERDAY_DAY }, T0)).rows[0]!;
    expect(row.items).toEqual([{ productId: royal.cola.id, productName: royal.cola.name, added: 3 }]);
    expect(row.note).toBe("Sayım sonrası düzeltildi");

    await admin.updateRoomCheck(oss.ctx, { transactionId: old.transactionId, updatedItems: [{ productId: royal.cola.id, qty: 1 }] }, T0);
    expect((await stockOf(royal.hotelId, royal.cola.id)).remainingQty).toBe(99);

    // all quantities zero on a past record turns it into "Sarfiyat Yok" (manager bypass), stock fully back
    await admin.updateRoomCheck(oss.ctx, { transactionId: old.transactionId, updatedItems: [{ productId: royal.cola.id, qty: 0 }] }, T0);
    row = (await admin.listRoomChecks(oss.ctx, { day: YESTERDAY_DAY }, T0)).rows[0]!;
    expect(row).toMatchObject({ type: "SARFIYAT_YOK", totalItemsCount: 0 });
    expect((await stockOf(royal.hotelId, royal.cola.id)).remainingQty).toBe(100);
    expect(await testDb.auditLog.count({ where: { entityId: old.transactionId, action: "MINIBAR_ROOM_CHECK_ADMIN" } })).toBe(3);

    // over the setup quantity is refused
    const again = await rep(katR.ctx, royal, 1, T0);
    expect(await codeOf(admin.updateRoomCheck(oss.ctx, { transactionId: again.transactionId, updatedItems: [{ productId: royal.cola.id, qty: 99 }] }, T0))).toBe("DAILY_LIMIT");
    expect(await codeOf(admin.updateRoomCheck(oss.ctx, { transactionId: again.transactionId, updatedItems: [{ productId: royal.cola.id, qty: 1 }, { productId: royal.cola.id, qty: 2 }] }, T0))).toBe("VALIDATION");
  });

  it("API: GET listeler, PATCH düzenler, DELETE gerekçe ister ve siler", async () => {
    const { royal, katR, oss } = await world();
    const old = await rep(katR.ctx, royal, 2, YESTERDAY);
    requireUser.mockResolvedValue(oss.ctx);

    const res = await get(oss.ctx, `?day=${YESTERDAY_DAY}&userId=${katR.userId}&hotelId=${royal.hotelId}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rows: { id: string }[] };
    expect(json.rows.map((r) => r.id)).toEqual([old.transactionId]);
    expect((await get(oss.ctx, "?day=bozuk")).status).toBe(400);

    const params = { params: Promise.resolve({ txId: old.transactionId }) };
    const patch = await itemRoute.PATCH(
      new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ updatedItems: [{ productId: royal.cola.id, qty: 1 }] }) }),
      params,
    );
    expect(patch.status).toBe(200);
    expect((await stockOf(royal.hotelId, royal.cola.id)).remainingQty).toBe(99);

    const noReason = await itemRoute.DELETE(new Request("http://localhost/x", { method: "DELETE", body: JSON.stringify({ reason: "" }) }), params);
    expect(noReason.status).toBe(400);
    const del = await itemRoute.DELETE(new Request("http://localhost/x", { method: "DELETE", body: JSON.stringify({ reason: "Mükerrer kayıt" }) }), params);
    expect(del.status).toBe(200);
    expect((await stockOf(royal.hotelId, royal.cola.id)).remainingQty).toBe(100);

    const kat = (await staff("R-KAT", "ROYAL")).ctx;
    requireUser.mockResolvedValue(kat);
    const denied = await itemRoute.DELETE(new Request("http://localhost/x", { method: "DELETE", body: JSON.stringify({ reason: "deneme" }) }), params);
    expect(denied.status).toBe(404);
  });
});
