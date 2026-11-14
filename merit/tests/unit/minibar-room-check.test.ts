import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { businessDay } from "@/lib/time";
import { RADAR_WIRE } from "@/modules/radar/events";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff, stockOf } from "../helpers/minibarFixtures";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { publish } = await import("@/lib/realtime");
const rc = await import("@/modules/minibar/server/roomCheckService");
const checklistSvc = await import("@/modules/minibar/server/roomChecklist");
const dnd = await import("@/modules/minibar/server/dnd");
const mmd = await import("@/modules/minibar/server/mmd");
const roomRoute = await import("@/app/api/minibar/room/[roomId]/route");
const checkRoute = await import("@/app/api/minibar/room/[roomId]/check/route");
const noUseRoute = await import("@/app/api/minibar/room/[roomId]/no-consumption/route");
const myCheckRoute = await import("@/app/api/minibar/my-checks/[txId]/route");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  vi.mocked(publish).mockClear();
  requireUser.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

// 2026-07-10 10:00 Nicosia (UTC+3) = 07:00Z
const T0 = new Date("2026-07-10T07:00:00.000Z");
const DAY = "2026-07-10";
const date = businessDay(DAY);
const minutes = (base: Date, m: number) => new Date(base.getTime() + m * 60_000);
const YESTERDAY = new Date(T0.getTime() - 24 * 3_600_000);

type World = Awaited<ReturnType<typeof minibarWorld>>;

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
const messageOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as Error).message;
  }
};
const events = (type: string) => vi.mocked(publish).mock.calls.map(([e]) => e).filter((e) => e.type === type);
const notes = (userId: string, type: string) => testDb.notification.count({ where: { userId, type } });
const itemStatus = async (id: string) => (await testDb.dailyTaskItem.findUniqueOrThrow({ where: { id } })).status;

/** total - used = remaining, never negative and the signed movements add up to the balance. */
async function expectConsistent(hotelId: string, productId: string, opening: number) {
  const row = await stockOf(hotelId, productId);
  expect(row.totalQty - row.usedQty).toBe(row.remainingQty);
  expect(row.remainingQty).toBeGreaterThanOrEqual(0);
  const moves = await testDb.hotelStockMovement.findMany({ where: { hotelId, productId } });
  expect(opening + moves.reduce((a, m) => a + m.qty, 0)).toBe(row.remainingQty);
}

type RepOpts = {
  productId?: string;
  roomId?: string;
  rid?: string;
  now?: Date;
  setupId?: string;
  note?: string;
  overSetup?: boolean;
};
const rep = (ctx: Ctx, w: World, qty: number, o: RepOpts = {}) =>
  rc.addReplacement(
    ctx,
    {
      roomId: o.roomId ?? w.room.id,
      items: [
        {
          productId: o.productId ?? w.cola.id,
          setupId: o.setupId ?? w.setup.id,
          qty,
          ...(o.overSetup ? { overSetup: true } : {}),
        },
      ],
      clientRequestId: o.rid ?? randomUUID(),
      ...(o.note ? { note: o.note } : {}),
    },
    o.now ?? T0,
  );

const noUse = (ctx: Ctx, roomId: string, now = T0, rid = randomUUID()) =>
  rc.recordNoConsumption(ctx, { roomId, clientRequestId: rid }, now);

async function setCabinets(w: World, n: number) {
  await testDb.roomType.update({ where: { id: w.roomType.id }, data: { cabinetCount: n } });
}

/** A world with a room in two daily tasks (one item each), a floor attendant, a second one, depot and manager. */
async function world(opts: { cabinets?: number; stock?: number; setupQty?: number; rooms?: number } = {}) {
  const w = await minibarWorld({ stock: opts.stock, setupQty: opts.setupQty, rooms: opts.rooms });
  if (opts.cabinets) await setCabinets(w, opts.cabinets);
  const mk = async (type: "INHOUSE_KONTROL" | "ARRIVAL_KONTROL") => {
    const task = await testDb.dailyTask.create({ data: { hotelId: w.hotelId, date, type } });
    const item = await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: w.room.id } });
    return { task, item };
  };
  const inh = await mk("INHOUSE_KONTROL");
  const arr = await mk("ARRIVAL_KONTROL");
  const kat = await staff("R-KAT", w.hotelCode);
  const kat2 = await staff("R-KAT", w.hotelCode);
  const depo = await staff("R-DEP", w.hotelCode);
  const mudur = await staff("R-OTM", w.hotelCode);
  const sys = await staff("R-SYS", w.hotelCode);
  return { w, inh, arr, kat, kat2, depo, mudur, sys };
}

describe("addReplacement", () => {
  it("+N ikame: havuz düşer, kalem anlık görüntüsü, hareket, görev kalemleri, olay ve denetim kaydı", async () => {
    const { w, inh, arr, kat } = await world();
    const rid = randomUUID();
    const r = await rep(kat.ctx, w, 2, { productId: w.water.id, rid });
    expect(r).toMatchObject({
      added: 2,
      poolRemaining: { [w.water.id]: 98 },
      taskCompleted: true,
      dndCompleted: false,
      replayed: false,
    });

    expect((await stockOf(w.hotelId, w.water.id)).remainingQty).toBe(98);
    const tx = await testDb.minibarTransaction.findUniqueOrThrow({
      where: { id: r.transactionId },
      include: { items: true },
    });
    expect(tx).toMatchObject({ type: "SETUP_KONTROL", userId: kat.userId, roomId: w.room.id, clientRequestId: rid });
    expect(tx.items).toHaveLength(1);
    expect(tx.items[0]).toMatchObject({
      productId: w.water.id,
      setupId: w.setup.id,
      setupQty: 4,
      startStock: 2,
      endStock: 4,
      consumed: 2,
      added: 2,
    });
    expect(Number(tx.items[0]!.salePrice)).toBe(1);
    const move = await testDb.hotelStockMovement.findFirstOrThrow({ where: { productId: w.water.id } });
    expect(move).toMatchObject({ type: "KULLANIM", qty: -2, refType: "MinibarTransaction", refId: tx.id });
    await expectConsistent(w.hotelId, w.water.id, 100);

    expect(await itemStatus(inh.item.id)).toBe("TAMAMLANDI");
    expect(await itemStatus(arr.item.id)).toBe("TAMAMLANDI");
    expect(await testDb.taskStatusLog.count({ where: { taskItemId: { in: [inh.item.id, arr.item.id] }, to: "TAMAMLANDI" } })).toBe(2);
    expect(await testDb.roomCheck.findMany({ where: { roomId: w.room.id } })).toMatchObject([
      { type: "URUN_EKLENDI", transactionId: tx.id, userId: kat.userId },
    ]);

    const [done] = events("roomcheck.done");
    expect(done).toMatchObject({ hotelId: w.hotelId, roomId: w.room.id });
    expect(RADAR_WIRE["roomcheck.done"].safeParse(done!.payload).success).toBe(true);
    expect(done!.payload).toMatchObject({ checkType: "URUN_EKLENDI", addedQty: 2, taskStatus: "TAMAMLANDI", byUserId: kat.userId });
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { action: "MINIBAR_REPLACE", entityId: tx.id } });
    expect(audit.userId).toBe(kat.userId);
  });

  it("kapasite = setup x dolap kopyası (2 dolap, setup 4 -> 8); aşım DAILY_LIMIT, işlem yazılmaz", async () => {
    const { w, kat } = await world({ cabinets: 2 });
    await rep(kat.ctx, w, 4);
    await rep(kat.ctx, w, 4);
    expect(await messageOf(rep(kat.ctx, w, 1))).toBe("Setup miktarı aşılamaz: setup 8, bugün eklenen 8, kalan 0");
    expect(await codeOf(rep(kat.ctx, w, 1))).toBe("DAILY_LIMIT");
    expect(await testDb.minibarTransaction.count({ where: { roomId: w.room.id } })).toBe(2);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(92);
    // the other product is independent
    expect((await rep(kat.ctx, w, 3, { productId: w.water.id })).added).toBe(3);
  });

  it("overSetup: setup sınırını aşar (havuzdan düşer), bayraksız aynı ekleme DAILY_LIMIT; havuz yetersizse yine STOCK_INSUFFICIENT", async () => {
    const { w, kat } = await world({ stock: 10 });
    await rep(kat.ctx, w, 4); // setup 4 -> full
    expect(await codeOf(rep(kat.ctx, w, 1))).toBe("DAILY_LIMIT");
    const r = await rep(kat.ctx, w, 5, { overSetup: true });
    expect(r.added).toBe(5);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(1);
    // still over the setup afterwards: the plain path stays closed
    expect(await codeOf(rep(kat.ctx, w, 1))).toBe("DAILY_LIMIT");
    // the pool is still enforced for over-setup lines
    expect(await codeOf(rep(kat.ctx, w, 2, { overSetup: true }))).toBe("STOCK_INSUFFICIENT");
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(1);
    await expectConsistent(w.hotelId, w.cola.id, 10);
  });

  it("overSetup: sunucuda günlük tavan setup + 20; aşan ekleme DAILY_LIMIT, setup üstü audit'te işaretli", async () => {
    const { w, kat } = await world({ stock: 100 });
    await rep(kat.ctx, w, 4); // setup 4 -> full
    expect((await rep(kat.ctx, w, 20, { overSetup: true })).added).toBe(20);
    expect(await codeOf(rep(kat.ctx, w, 1, { overSetup: true }))).toBe("DAILY_LIMIT");
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(76);
    const logs = await testDb.auditLog.findMany({ where: { action: "MINIBAR_REPLACE", hotelId: w.hotelId } });
    expect(logs.some((l) => JSON.stringify(l.after).includes('"overSetup":true'))).toBe(true);
  });

  it("iki personel eşzamanlı 5+5: kapasiteyi aşamaz (biri DAILY_LIMIT)", async () => {
    const { w, kat, kat2 } = await world({ cabinets: 2 });
    const results = await Promise.all([rep(kat.ctx, w, 5), rep(kat2.ctx, w, 5)].map(codeOf));
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r === "DAILY_LIMIT")).toHaveLength(1);
    const total = await testDb.minibarTransactionItem.aggregate({ _sum: { added: true }, where: { productId: w.cola.id } });
    expect(total._sum.added).toBe(5);
    expect(total._sum.added!).toBeLessThanOrEqual(8);
    await expectConsistent(w.hotelId, w.cola.id, 100);
  });

  it("aynı clientRequestId: tek işlem, havuz bir kez düşer, replayed true (ardışık ve 8 eşzamanlı)", async () => {
    const { w, kat } = await world({ stock: 50, setupQty: 4, cabinets: 2 });
    const rid = randomUUID();
    const first = await rep(kat.ctx, w, 2, { rid });
    const second = await rep(kat.ctx, w, 2, { rid });
    expect(second).toMatchObject({ transactionId: first.transactionId, added: 2, replayed: true, poolRemaining: { [w.cola.id]: 48 } });

    const rid2 = randomUUID();
    const burst = await Promise.all(Array.from({ length: 8 }, () => rep(kat.ctx, w, 2, { rid: rid2 })));
    expect(new Set(burst.map((b) => b.transactionId)).size).toBe(1);
    expect(burst.filter((b) => b.replayed)).toHaveLength(7);
    expect(await testDb.minibarTransaction.count({ where: { roomId: w.room.id } })).toBe(2);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(46);
    expect(await testDb.hotelStockMovement.count({ where: { type: "KULLANIM", productId: w.cola.id } })).toBe(2);
    expect(await testDb.auditLog.count({ where: { action: "MINIBAR_REPLACE" } })).toBe(2);
  });

  it("başka kullanıcının istek kimliği CONFLICT verir, işlem değişmez", async () => {
    const { w, kat, kat2 } = await world();
    const rid = randomUUID();
    await rep(kat.ctx, w, 1, { rid });
    expect(await codeOf(rep(kat2.ctx, w, 1, { rid }))).toBe("CONFLICT");
    expect(await testDb.minibarTransaction.count()).toBe(1);
  });

  it("doğrulama: başka setup'taki / pasif / setup dışı ürün, fazla alan, 0 adet, yinelenen ürün", async () => {
    const { w, kat } = await world();
    // a second setup holding another product, assigned to the same room type
    const extra = await testDb.product.create({ data: { groupId: w.group.id, name: `Ekstra-${randomUUID()}` } });
    const setup2 = await testDb.setup.create({
      data: { name: `Setup2-${randomUUID()}`, items: { create: [{ productId: extra.id, qty: 2 }] } },
    });
    await testDb.roomTypeSetup.create({ data: { hotelId: w.hotelId, roomTypeId: w.roomType.id, setupId: setup2.id } });
    await testDb.hotelStock.create({ data: { hotelId: w.hotelId, productId: extra.id, totalQty: 10, remainingQty: 10 } });
    expect(await messageOf(rep(kat.ctx, w, 1, { setupId: setup2.id }))).toBe("Ürün bu setup'ta bulunamadı");
    expect(await codeOf(rep(kat.ctx, w, 1, { setupId: setup2.id }))).toBe("VALIDATION");
    expect((await rep(kat.ctx, w, 1, { productId: extra.id, setupId: setup2.id })).added).toBe(1);

    const stranger = await testDb.product.create({ data: { groupId: w.group.id, name: `Yabanci-${randomUUID()}` } });
    expect(await codeOf(rep(kat.ctx, w, 1, { productId: stranger.id }))).toBe("VALIDATION");

    await testDb.product.update({ where: { id: w.water.id }, data: { isActive: false } });
    expect(await codeOf(rep(kat.ctx, w, 1, { productId: w.water.id }))).toBe("VALIDATION");

    const base = { roomId: w.room.id, clientRequestId: randomUUID() };
    const line = { productId: w.cola.id, setupId: w.setup.id, qty: 1 };
    expect(await codeOf(rc.addReplacement(kat.ctx, { ...base, items: [{ ...line, extra: true }] }, T0))).toBe("VALIDATION");
    expect(await codeOf(rc.addReplacement(kat.ctx, { ...base, items: [{ ...line, qty: 0 }] }, T0))).toBe("VALIDATION");
    expect(await codeOf(rc.addReplacement(kat.ctx, { ...base, items: [{ ...line, qty: 1.5 }] }, T0))).toBe("VALIDATION");
    expect(await codeOf(rc.addReplacement(kat.ctx, { ...base, items: [] }, T0))).toBe("VALIDATION");
    expect(await codeOf(rc.addReplacement(kat.ctx, { ...base, items: [line, line] }, T0))).toBe("VALIDATION");
    expect(await codeOf(rc.addReplacement(kat.ctx, { ...base, clientRequestId: "x", items: [line] }, T0))).toBe("VALIDATION");
    expect(await codeOf(rc.addReplacement(kat.ctx, { ...base, items: [line], bogus: 1 }, T0))).toBe("VALIDATION");
    expect(await testDb.minibarTransaction.count()).toBe(1);
  });

  it("havuz yetersiz: STOCK_INSUFFICIENT, işlem/hareket/kalem yazılmaz; iki üründen biri yetersizse hiçbiri düşmez", async () => {
    const { w, kat } = await world({ stock: 5 });
    await testDb.hotelStock.updateMany({
      where: { hotelId: w.hotelId, productId: w.water.id },
      data: { totalQty: 1, remainingQty: 1 },
    });
    expect(await codeOf(rep(kat.ctx, w, 4, { productId: w.water.id }))).toBe("STOCK_INSUFFICIENT");
    const both = rc.addReplacement(
      kat.ctx,
      {
        roomId: w.room.id,
        items: [
          { productId: w.cola.id, setupId: w.setup.id, qty: 2 },
          { productId: w.water.id, setupId: w.setup.id, qty: 2 },
        ],
        clientRequestId: randomUUID(),
      },
      T0,
    );
    expect(await codeOf(both)).toBe("STOCK_INSUFFICIENT");
    expect(await testDb.minibarTransaction.count()).toBe(0);
    expect(await testDb.minibarTransactionItem.count()).toBe(0);
    expect(await testDb.hotelStockMovement.count()).toBe(0);
    expect(await testDb.roomCheck.count()).toBe(0);
    expect(events("roomcheck.done")).toHaveLength(0);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(5);
  });

  it("birden çok ürün tek çağrıda; AKTIF DND ikame ile TAMAMLANDI olur (no = sayı + 1)", async () => {
    const { w, kat, kat2, inh } = await world();
    await dnd.markDnd(kat2.ctx, { roomId: w.room.id }, T0);
    expect(await itemStatus(inh.item.id)).toBe("DND_BEKLIYOR");

    const r = await rc.addReplacement(
      kat.ctx,
      {
        roomId: w.room.id,
        items: [
          { productId: w.cola.id, setupId: w.setup.id, qty: 1 },
          { productId: w.water.id, setupId: w.setup.id, qty: 3 },
        ],
        clientRequestId: randomUUID(),
      },
      minutes(T0, 60),
    );
    expect(r).toMatchObject({ added: 4, dndCompleted: true, taskCompleted: true });
    const row = await testDb.roomDnd.findUniqueOrThrow({ where: { roomId_date: { roomId: w.room.id, date } } });
    expect(row.status).toBe("TAMAMLANDI");
    const checks = await testDb.roomDndCheck.findMany({ where: { dndId: row.id }, orderBy: { no: "asc" } });
    expect(checks.map((c) => c.no)).toEqual([1, 2]);
    expect(await itemStatus(inh.item.id)).toBe("TAMAMLANDI");
    expect(await testDb.minibarTransactionItem.count({ where: { transactionId: r.transactionId } })).toBe(2);
  });

  it("başka otelin odası NOT_FOUND, R-HKS FORBIDDEN; hiçbir şey yazılmaz", async () => {
    const { w, kat } = await world();
    const other = await minibarWorld({ hotelCode: "DIAMOND" });
    const katOther = await staff("R-KAT", "DIAMOND");
    expect(await codeOf(rc.addReplacement(katOther.ctx, { roomId: w.room.id, items: [{ productId: w.cola.id, setupId: w.setup.id, qty: 1 }], clientRequestId: randomUUID() }, T0))).toBe("NOT_FOUND");
    expect(await codeOf(rep(kat.ctx, other, 1, { roomId: other.room.id }))).toBe("NOT_FOUND");
    const hks = await staff("R-HKS", w.hotelCode);
    expect(await codeOf(rep(hks.ctx, w, 1))).toBe("FORBIDDEN");
    expect(await codeOf(noUse(hks.ctx, w.room.id))).toBe("FORBIDDEN");
    expect(await testDb.minibarTransaction.count()).toBe(0);
  });
});

describe("recordNoConsumption", () => {
  it("kalemsiz işlem, görev kalemleri, depo ve müdüre tek bildirim, denetim ve olay", async () => {
    const { w, inh, arr, kat, depo, mudur, kat2 } = await world();
    const r = await noUse(kat.ctx, w.room.id);
    expect(r).toMatchObject({ taskCompleted: true, replayed: false });
    const tx = await testDb.minibarTransaction.findUniqueOrThrow({ where: { id: r.transactionId }, include: { items: true } });
    expect(tx).toMatchObject({ type: "SARFIYAT_YOK", userId: kat.userId });
    expect(tx.items).toHaveLength(0);
    expect(await testDb.roomCheck.findMany({ where: { roomId: w.room.id } })).toMatchObject([
      { type: "SARFIYAT_YOK", transactionId: tx.id },
    ]);
    expect(await itemStatus(inh.item.id)).toBe("TAMAMLANDI");
    expect(await itemStatus(arr.item.id)).toBe("TAMAMLANDI");
    expect(await notes(depo.userId, "minibar.noUse")).toBe(1);
    expect(await notes(mudur.userId, "minibar.noUse")).toBe(1);
    expect(await notes(kat.userId, "minibar.noUse")).toBe(0);
    expect(await notes(kat2.userId, "minibar.noUse")).toBe(0);
    const n = await testDb.notification.findFirstOrThrow({ where: { userId: depo.userId, type: "minibar.noUse" } });
    expect(n.title).toBe(`Sarfiyat yok — Oda ${w.room.number}`);
    expect(await testDb.auditLog.count({ where: { action: "MINIBAR_NO_USE", entityId: tx.id } })).toBe(1);
    const [done] = events("roomcheck.done");
    expect(RADAR_WIRE["roomcheck.done"].safeParse(done!.payload).success).toBe(true);
    expect(done!.payload).toMatchObject({ checkType: "SARFIYAT_YOK", addedQty: 0 });
  });

  it("aynı gün ikinci çağrı CONFLICT; aynı istek kimliği yeniden oynatılır; ikameden sonra CONFLICT, geri alınca serbest", async () => {
    const { w, kat, kat2, depo } = await world();
    const rid = randomUUID();
    const first = await noUse(kat.ctx, w.room.id, T0, rid);
    expect(await noUse(kat.ctx, w.room.id, T0, rid)).toMatchObject({ transactionId: first.transactionId, replayed: true });
    expect(await messageOf(noUse(kat2.ctx, w.room.id, minutes(T0, 5)))).toBe('Bu oda bugün zaten "Sarfiyat Yok" olarak kaydedildi');
    expect(await codeOf(noUse(kat2.ctx, w.room.id, minutes(T0, 5)))).toBe("CONFLICT");
    expect(await notes(depo.userId, "minibar.noUse")).toBe(1);

    // Consumption found later the same day: +N stays possible, "Sarfiyat Yok" no longer.
    const added = await rep(kat2.ctx, w, 1, { now: minutes(T0, 10) });
    expect(await messageOf(noUse(kat.ctx, w.room.id, minutes(T0, 20)))).toBe('Bu odaya bugün ürün eklendi; "Sarfiyat Yok" kaydedilemez');
    expect(await testDb.minibarTransaction.count({ where: { type: "SARFIYAT_YOK" } })).toBe(1);

    // A fresh room: +N then undo frees "Sarfiyat Yok" again.
    const w2 = await minibarWorld({ hotelCode: w.hotelCode });
    const r2 = await rep(kat.ctx, w2, 1, { roomId: w2.room.id, setupId: w2.setup.id, now: minutes(T0, 30) });
    expect(await codeOf(noUse(kat.ctx, w2.room.id, minutes(T0, 31)))).toBe("CONFLICT");
    await rc.deleteMyTransaction(kat.ctx, r2.transactionId, minutes(T0, 32));
    expect(await codeOf(noUse(kat.ctx, w2.room.id, minutes(T0, 33)))).toBe("OK");
    expect(added.transactionId).toBeTruthy();
  });

  it("iki eşzamanlı Sarfiyat Yok: biri kaydolur, biri CONFLICT; AKTIF DND TAMAMLANDI olur", async () => {
    const { w, kat, kat2 } = await world();
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    const results = await Promise.all([noUse(kat.ctx, w.room.id, minutes(T0, 30)), noUse(kat2.ctx, w.room.id, minutes(T0, 30))].map(codeOf));
    expect(results.sort()).toEqual(["CONFLICT", "OK"]);
    expect(await testDb.minibarTransaction.count({ where: { type: "SARFIYAT_YOK" } })).toBe(1);
    const row = await testDb.roomDnd.findUniqueOrThrow({ where: { roomId_date: { roomId: w.room.id, date } } });
    expect(row.status).toBe("TAMAMLANDI");
  });
});

describe("DND otomatik tamamlanmasının geri alınması", () => {
  it("DND'yi kapatan ikame silinince DND yeniden AKTIF olur, otomatik kontrol satırı gider, görev DND_BEKLIYOR'a döner", async () => {
    const { w, kat, kat2, inh } = await world();
    await dnd.markDnd(kat2.ctx, { roomId: w.room.id }, T0);
    const r = await rep(kat.ctx, w, 1, { now: minutes(T0, 60) });
    const before = await testDb.roomDnd.findUniqueOrThrow({ where: { roomId_date: { roomId: w.room.id, date } } });
    expect(before.status).toBe("TAMAMLANDI");

    await rc.deleteMyTransaction(kat.ctx, r.transactionId, minutes(T0, 61));
    const after = await testDb.roomDnd.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.status).toBe("AKTIF");
    expect(await testDb.roomDndCheck.count({ where: { dndId: before.id } })).toBe(1);
    expect(await itemStatus(inh.item.id)).toBe("DND_BEKLIYOR");
    expect(await testDb.auditLog.count({ where: { action: "DND_AUTO_REOPEN", entityId: before.id } })).toBe(1);
  });

  it("aynı gün başka bir ikame duruyorsa DND tamamlanmış kalır", async () => {
    const { w, kat, kat2 } = await world();
    await dnd.markDnd(kat2.ctx, { roomId: w.room.id }, T0);
    const first = await rep(kat.ctx, w, 1, { now: minutes(T0, 60) });
    await rep(kat.ctx, w, 1, { now: minutes(T0, 62) });
    await rc.deleteMyTransaction(kat.ctx, first.transactionId, minutes(T0, 63));
    expect((await testDb.roomDnd.findUniqueOrThrow({ where: { roomId_date: { roomId: w.room.id, date } } })).status).toBe("TAMAMLANDI");
  });
});

describe("loadRoomChecklist / getRoomCheckView / startRoomCheck", () => {
  it("oda tipi veya setup ataması yoksa VALIDATION", async () => {
    const w = await minibarWorld();
    await testDb.roomTypeSetup.deleteMany({ where: { roomTypeId: w.roomType.id } });
    expect(await messageOf(checklistSvc.loadRoomChecklist(testDb, w.room.id))).toBe(
      "Bu odanın tipi veya setup ataması yok; Kurulum Rehberi'nden tamamlayın",
    );
    const kat = await staff("R-KAT");
    const view = await rc.getRoomCheckView(kat.ctx, w.room.id, T0);
    expect(view.checklist).toEqual([]);
    expect(view.checklistError).toMatch(/Kurulum Rehberi/);
  });

  it("dolap kopyaları: etiketler, aynı ürün aynı allowedLeft/kapasite, düğmeler havuz ve kalan hakka bağlı, fiyat yok", async () => {
    const { w, kat } = await world({ cabinets: 2 });
    await testDb.hotelStock.updateMany({ where: { hotelId: w.hotelId, productId: w.water.id }, data: { totalQty: 0, remainingQty: 0 } });
    await rep(kat.ctx, w, 3);
    const view = await rc.getRoomCheckView(kat.ctx, w.room.id, T0);

    expect(view.checklist).toHaveLength(2);
    expect(view.checklist.map((c) => c.copy)).toEqual([1, 2]);
    expect(view.checklist[0]!.label).toMatch(/ – Dolap 1\/2$/);
    expect(view.checklist[1]!.label).toMatch(/ – Dolap 2\/2$/);
    const cola = view.checklist.map((c) => c.items.find((i) => i.productId === w.cola.id)!);
    expect(cola[0]).toMatchObject({ setupQty: 4, capacity: 8, addedToday: 3, allowedLeft: 5, poolRemaining: 97 });
    expect(cola[1]).toEqual(cola[0]);
    expect(cola[0]!.buttons).toEqual([1, 2, 3, 4].map((n) => ({ n, enabled: true })));
    const water = view.checklist[0]!.items.find((i) => i.productId === w.water.id)!;
    expect(water.buttons).toEqual([1, 2, 3, 4].map((n) => ({ n, enabled: false })));

    // few rights left: buttons beyond the allowance are disabled
    await rep(kat.ctx, w, 3, { now: minutes(T0, 1) });
    const after = await rc.getRoomCheckView(kat.ctx, w.room.id, T0);
    const c2 = after.checklist[0]!.items.find((i) => i.productId === w.cola.id)!;
    expect(c2.allowedLeft).toBe(2);
    expect(c2.buttons.map((b) => b.enabled)).toEqual([true, true, false, false]);

    // legacy shape is a superset (one entry per setup)
    expect(after.setups).toHaveLength(1);
    expect(after.setups[0]!.items.find((i) => i.productId === w.cola.id)).toMatchObject({
      targetQty: 8,
      hotelStockQty: 94,
      replenishedToday: 6,
    });
    expect(JSON.stringify(after)).not.toMatch(/price/i);
  });

  it("rozet geçişleri: Bekliyor -> DND 1/2 -> Kontrol Edildi; Sarfiyat Yok ve ikame rozetleri", async () => {
    const { w, kat, kat2 } = await world();
    expect((await rc.getRoomCheckView(kat.ctx, w.room.id, T0)).badge).toEqual({ kind: "BEKLIYOR" });
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    expect((await rc.getRoomCheckView(kat.ctx, w.room.id, T0)).badge).toMatchObject({ kind: "DND", dndCount: 1, required: 2 });
    await dnd.markDnd(kat2.ctx, { roomId: w.room.id }, minutes(T0, 130));
    expect((await rc.getRoomCheckView(kat.ctx, w.room.id, minutes(T0, 130))).badge).toMatchObject({ kind: "KONTROL_EDILDI", dndCount: 2 });

    const w2 = await minibarWorld({ hotelCode: w.hotelCode });
    await noUse(kat.ctx, w2.room.id);
    expect((await rc.getRoomCheckView(kat.ctx, w2.room.id, T0)).badge.kind).toBe("SARFIYAT_YOK");
    await rep(kat.ctx, w2, 1, { roomId: w2.room.id, setupId: w2.setup.id, now: minutes(T0, 5) });
    const b = (await rc.getRoomCheckView(kat.ctx, w2.room.id, T0)).badge;
    expect(b.kind).toBe("KONTROL_EDILDI");
    expect(b.at).toBe(minutes(T0, 5).toISOString());
  });

  it("boş oda uyarısı yalnız doluluk listesi varken ve oda listede yoksa çıkar", async () => {
    const w = await minibarWorld({ rooms: 2 });
    const kat = await staff("R-KAT", w.hotelCode);
    const [a, b] = w.rooms as [typeof w.room, typeof w.room];
    expect((await rc.getRoomCheckView(kat.ctx, a.id, T0)).emptyRoomWarning).toBeNull();
    const task = await testDb.dailyTask.create({ data: { hotelId: w.hotelId, date, type: "INHOUSE_KONTROL" } });
    await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: a.id } });
    expect((await rc.getRoomCheckView(kat.ctx, a.id, T0)).emptyRoomWarning).toBeNull();
    expect((await rc.getRoomCheckView(kat.ctx, b.id, T0)).emptyRoomWarning).toMatch(/boş görünüyor/);
  });

  it("startRoomCheck: eski ACIK kayıtları silinir, ikame açık kaydı kapatır (ikinci kayıt açmaz)", async () => {
    const { w, kat, kat2 } = await world({ rooms: 2 });
    const [r1, r2] = w.rooms as [typeof w.room, typeof w.room];
    const a = await rc.startRoomCheck(kat.ctx, r1.id, T0);
    const other = await rc.startRoomCheck(kat2.ctx, r1.id, T0);
    const b = await rc.startRoomCheck(kat.ctx, r2.id, minutes(T0, 1));
    expect(await testDb.roomCheck.findUnique({ where: { id: a.checkId } })).toBeNull();
    expect(await testDb.roomCheck.findUnique({ where: { id: other.checkId } })).not.toBeNull();
    expect(await testDb.roomCheck.count({ where: { userId: kat.userId, type: "ACIK" } })).toBe(1);

    const r = await rep(kat.ctx, w, 1, { roomId: r2.id, now: minutes(T0, 2) });
    const row = await testDb.roomCheck.findUniqueOrThrow({ where: { id: b.checkId } });
    expect(row).toMatchObject({ type: "URUN_EKLENDI", transactionId: r.transactionId });
    expect(row.endedAt).not.toBeNull();
    expect(await testDb.roomCheck.count({ where: { roomId: r2.id } })).toBe(1);
  });

  it("startRoomCheck aynı oda / aynı gün için tekrar açılınca (geri - ileri, yenileme) aynı kaydı verir (D13)", async () => {
    const { w, kat } = await world({ rooms: 2 });
    const [r1, r2] = w.rooms as [typeof w.room, typeof w.room];
    const a = await rc.startRoomCheck(kat.ctx, r1.id, T0);
    const again = await rc.startRoomCheck(kat.ctx, r1.id, minutes(T0, 3));
    expect(again.checkId).toBe(a.checkId);
    expect(await testDb.roomCheck.count({ where: { userId: kat.userId, type: "ACIK" } })).toBe(1);
    // Another room still replaces the open one; the next business day opens a new record.
    const b = await rc.startRoomCheck(kat.ctx, r2.id, minutes(T0, 4));
    expect(b.checkId).not.toBe(a.checkId);
    expect(await testDb.roomCheck.findUnique({ where: { id: a.checkId } })).toBeNull();
    const back = await rc.startRoomCheck(kat.ctx, r2.id, new Date(T0.getTime() + 24 * 3_600_000));
    expect(back.checkId).not.toBe(b.checkId);
    expect(await testDb.roomCheck.count({ where: { userId: kat.userId, type: "ACIK" } })).toBe(1);
  });
});

describe("deleteMyTransaction", () => {
  it("bugünkü kendi işlem: IADE +n, havuz geri, kalemler BEKLIYOR'a döner, işlem ve olay", async () => {
    const { w, inh, arr, kat } = await world();
    const r = await rep(kat.ctx, w, 3);
    expect(await itemStatus(inh.item.id)).toBe("TAMAMLANDI");
    const out = await rc.deleteMyTransaction(kat.ctx, r.transactionId, minutes(T0, 5));
    expect(out.restored).toEqual([{ productId: w.cola.id, qty: 3 }]);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(100);
    const iade = await testDb.hotelStockMovement.findFirstOrThrow({ where: { type: "IADE", productId: w.cola.id } });
    expect(iade).toMatchObject({ qty: 3, refType: "MinibarTransaction", refId: r.transactionId });
    await expectConsistent(w.hotelId, w.cola.id, 100);
    expect(await testDb.minibarTransaction.count()).toBe(0);
    expect(await testDb.roomCheck.count()).toBe(0);
    expect(await itemStatus(inh.item.id)).toBe("BEKLIYOR");
    expect(await itemStatus(arr.item.id)).toBe("BEKLIYOR");
    expect(await testDb.auditLog.count({ where: { action: "MINIBAR_ROOM_CHECK_DELETE", entityId: r.transactionId } })).toBe(1);
    expect(events("room.check.changed")).toHaveLength(1);
  });

  it("dünkü işlem FORBIDDEN, başkasının işlemi NOT_FOUND, onay yetkilisi başkasınınkini silebilir", async () => {
    const { w, kat, kat2, sys } = await world();
    const old = await rep(kat.ctx, w, 1, { now: YESTERDAY });
    expect(await messageOf(rc.deleteMyTransaction(kat.ctx, old.transactionId, T0))).toBe("Sadece bugün yapılan işlemler silinebilir");
    expect(await codeOf(rc.deleteMyTransaction(kat.ctx, old.transactionId, T0))).toBe("FORBIDDEN");

    const mine = await rep(kat.ctx, w, 1);
    expect(await codeOf(rc.deleteMyTransaction(kat2.ctx, mine.transactionId, T0))).toBe("NOT_FOUND");
    expect(await messageOf(rc.deleteMyTransaction(kat2.ctx, mine.transactionId, T0))).toBe("İşlem bulunamadı");
    expect(await codeOf(rc.deleteMyTransaction(kat.ctx, "yok", T0))).toBe("NOT_FOUND");
    expect(await testDb.minibarTransaction.count()).toBe(2);

    await rc.deleteMyTransaction(sys.ctx, mine.transactionId, T0);
    expect(await testDb.minibarTransaction.count()).toBe(1);
  });

  it("çift silme (eşzamanlı): biri başarılı, diğeri NOT_FOUND; havuz bir kez iade", async () => {
    const { w, kat } = await world();
    const r = await rep(kat.ctx, w, 2);
    const results = await Promise.all([rc.deleteMyTransaction(kat.ctx, r.transactionId, T0), rc.deleteMyTransaction(kat.ctx, r.transactionId, T0)].map(codeOf));
    expect(results.sort()).toEqual(["NOT_FOUND", "OK"]);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(100);
    expect(await testDb.hotelStockMovement.count({ where: { type: "IADE" } })).toBe(1);
    await expectConsistent(w.hotelId, w.cola.id, 100);
  });

  it("başka otelin işlemi NOT_FOUND; R-HKS FORBIDDEN", async () => {
    const { w, kat } = await world();
    const r = await rep(kat.ctx, w, 1);
    const katOther = await staff("R-KAT", "DIAMOND");
    expect(await codeOf(rc.deleteMyTransaction(katOther.ctx, r.transactionId, T0))).toBe("NOT_FOUND");
    const hks = await staff("R-HKS", w.hotelCode);
    expect(await codeOf(rc.deleteMyTransaction(hks.ctx, r.transactionId, T0))).toBe("FORBIDDEN");
    expect(await testDb.minibarTransaction.count()).toBe(1);
  });
});

describe("updateMyTransaction", () => {
  it("fark havuzdan geri/alınır, kalem anlık görüntüsü güncellenir, kapasite diğer işlemleri sayar", async () => {
    const { w, kat, kat2 } = await world();
    const r = await rep(kat.ctx, w, 2);
    await rep(kat2.ctx, w, 1, { now: minutes(T0, 1) }); // someone else added 1 cola today
    const out = await rc.updateMyTransaction(kat.ctx, { transactionId: r.transactionId, updatedItems: [{ productId: w.cola.id, qty: 3 }, { productId: w.water.id, qty: 1 }] }, minutes(T0, 2));
    expect(out.message).toMatch(/güncellendi/);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(100 - 3 - 1);
    expect((await stockOf(w.hotelId, w.water.id)).remainingQty).toBe(99);
    const items = await testDb.minibarTransactionItem.findMany({ where: { transactionId: r.transactionId } });
    expect(items.find((i) => i.productId === w.cola.id)).toMatchObject({ added: 3, consumed: 3, startStock: 1, endStock: 4 });
    expect(items.find((i) => i.productId === w.water.id)).toMatchObject({ added: 1, setupQty: 4, setupId: w.setup.id });
    // 1 (other) + 4 > 4
    expect(await messageOf(rc.updateMyTransaction(kat.ctx, { transactionId: r.transactionId, updatedItems: [{ productId: w.cola.id, qty: 4 }] }, T0))).toBe(
      "Setup miktarı aşılamaz: setup 4, bugün eklenen 1, kalan 3",
    );
    await expectConsistent(w.hotelId, w.cola.id, 100);
    await expectConsistent(w.hotelId, w.water.id, 100);

    // all lines to zero is a delete, not a silent "Sarfiyat Yok": refused, nothing changes
    const zero = rc.updateMyTransaction(kat.ctx, { transactionId: r.transactionId, updatedItems: [{ productId: w.cola.id, qty: 0 }, { productId: w.water.id, qty: 0 }] }, minutes(T0, 3));
    expect(await messageOf(zero)).toBe("Tüm adetler sıfır olamaz; kaydı kaldırmak için Sil'i kullanın");
    expect((await testDb.minibarTransaction.findUniqueOrThrow({ where: { id: r.transactionId } })).type).toBe("SETUP_KONTROL");
  });

  it("bugünkü Sarfiyat Yok düzenlenemez (not saklanır), listede düzenle kapalı, sil açık", async () => {
    const w2 = await world();
    const nc = await rc.recordNoConsumption(w2.kat.ctx, { roomId: w2.w.room.id, clientRequestId: randomUUID(), note: "Dolap tam" }, T0);
    expect((await testDb.minibarTransaction.findUniqueOrThrow({ where: { id: nc.transactionId } })).note).toBe("Dolap tam");
    expect(await messageOf(rc.updateMyTransaction(w2.kat.ctx, { transactionId: nc.transactionId, updatedItems: [{ productId: w2.w.cola.id, qty: 1 }] }, minutes(T0, 1)))).toBe(
      "Sarfiyat Yok kaydı değiştirilemez; gerekirse silip ürün ekleyin",
    );
    const listed = (await rc.listMyTransactions(w2.kat.ctx, {}, minutes(T0, 2))).find((x) => x.id === nc.transactionId);
    expect(listed).toMatchObject({ canEditDirectly: false, canDelete: true });
  });

  it("başkasının işlemi NOT_FOUND, dünkü FORBIDDEN, fazla alan / yinelenen ürün VALIDATION", async () => {
    const { w, kat, kat2 } = await world();
    const r = await rep(kat.ctx, w, 1);
    const one = { productId: w.cola.id, qty: 2 };
    expect(await codeOf(rc.updateMyTransaction(kat2.ctx, { transactionId: r.transactionId, updatedItems: [one] }, T0))).toBe("NOT_FOUND");
    const old = await rep(kat.ctx, w, 1, { now: YESTERDAY });
    expect(await codeOf(rc.updateMyTransaction(kat.ctx, { transactionId: old.transactionId, updatedItems: [one] }, T0))).toBe("FORBIDDEN");
    expect(await codeOf(rc.updateMyTransaction(kat.ctx, { transactionId: r.transactionId, updatedItems: [one], extra: 1 }, T0))).toBe("VALIDATION");
    expect(await codeOf(rc.updateMyTransaction(kat.ctx, { transactionId: r.transactionId, updatedItems: [one, one] }, T0))).toBe("VALIDATION");
  });

  it("karşıt yönlü iki güncelleme aynı iki ürüne eşzamanlı dokunur: kilitlenme yok, bakiye tutarlı", async () => {
    const { w, kat, kat2 } = await world({ rooms: 2 });
    const [r1, r2] = w.rooms as [typeof w.room, typeof w.room];
    const a = await rc.addReplacement(kat.ctx, { roomId: r1.id, items: [{ productId: w.cola.id, setupId: w.setup.id, qty: 2 }, { productId: w.water.id, setupId: w.setup.id, qty: 1 }], clientRequestId: randomUUID() }, T0);
    const b = await rc.addReplacement(kat2.ctx, { roomId: r2.id, items: [{ productId: w.cola.id, setupId: w.setup.id, qty: 1 }, { productId: w.water.id, setupId: w.setup.id, qty: 2 }], clientRequestId: randomUUID() }, T0);
    const upd = (ctx: Ctx, id: string, cola: number, water: number, now: Date) =>
      rc.updateMyTransaction(ctx, { transactionId: id, updatedItems: [{ productId: w.cola.id, qty: cola }, { productId: w.water.id, qty: water }] }, now);
    // round i: a -> (cola down, water up) while b -> (cola up, water down), then swapped back
    const plan = [
      [[1, 2], [2, 1]],
      [[2, 1], [1, 2]],
      [[1, 2], [2, 1]],
      [[2, 1], [1, 2]],
    ] as const;
    for (const [i, [pa, pb]] of plan.entries()) {
      const now = minutes(T0, 10 + i);
      const results = await Promise.all([upd(kat.ctx, a.transactionId, pa[0], pa[1], now), upd(kat2.ctx, b.transactionId, pb[0], pb[1], now)].map(codeOf));
      expect(results).toEqual(["OK", "OK"]);
    }
    await expectConsistent(w.hotelId, w.cola.id, 100);
    await expectConsistent(w.hotelId, w.water.id, 100);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(97);
    expect((await stockOf(w.hotelId, w.water.id)).remainingQty).toBe(97);
  });
});

describe("listMyTransactions", () => {
  it("yalnız kendi işlemleri ve DND kayıtları; bugünkü silinebilir, dünkü silinemez", async () => {
    const { w, kat, kat2 } = await world();
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, minutes(T0, 1));
    const mine = await rep(kat.ctx, w, 2, { now: minutes(T0, 5) });
    await rep(kat2.ctx, w, 1, { now: minutes(T0, 6) });
    const old = await rep(kat.ctx, w, 1, { now: YESTERDAY });

    const list = await rc.listMyTransactions(kat.ctx, {}, minutes(T0, 20));
    expect(list.map((x) => x.id)).toContain(mine.transactionId);
    expect(list.every((x) => x.kind === "DND" || x.items.every((i) => i.productName))).toBe(true);
    const todayRow = list.find((x) => x.id === mine.transactionId)!;
    expect(todayRow).toMatchObject({ kind: "ISLEM", canDelete: true, isToday: true, totalItemsCount: 2, typeLabel: "Ürün İkamesi" });
    expect(list.find((x) => x.id === old.transactionId)).toMatchObject({ canDelete: false, isToday: false });
    expect(list.filter((x) => x.kind === "DND")).toHaveLength(1);
    expect(list.some((x) => x.id !== mine.transactionId && x.id !== old.transactionId && x.kind === "ISLEM")).toBe(false);
    expect(JSON.stringify(list)).not.toMatch(/price/i);
    const forDay = await rc.listMyTransactions(kat.ctx, { day: DAY }, minutes(T0, 20));
    expect(forDay.find((x) => x.id === old.transactionId)).toBeUndefined();
  });

  it("kullanıcının kendi MMD kayıtları da listelenir (başkasınınki değil); silinemez", async () => {
    const { w, kat, kat2 } = await world();
    await mmd.recordMmd(kat.ctx, { roomId: w.room.id, reason: "Misafir uyuyor" }, minutes(T0, 2));
    await mmd.recordMmd(kat2.ctx, { roomId: w.room.id, reason: "Başkasının kaydı" }, minutes(T0, 3));
    const list = await rc.listMyTransactions(kat.ctx, {}, minutes(T0, 20));
    const mmds = list.filter((x) => x.kind === "MMD");
    expect(mmds).toHaveLength(1);
    expect(mmds[0]).toMatchObject({ type: "MMD", note: "Misafir uyuyor", canDelete: false, isToday: true, roomNumber: w.room.number });
  });
});

describe("düzeltme talebi akışı", () => {
  it("R-KAT (KAT-6, İşlemlerim) ve R-DEP talep eder, ikisi de karara bağlayamaz, R-OTM bağlayamaz, R-SYS onaylayınca silme uygulanır", async () => {
    const { w, kat, depo, mudur, sys } = await world();
    const old = await rep(kat.ctx, w, 3, { now: YESTERDAY });
    const input = { transactionId: old.transactionId, actionType: "SILME", reason: "Yanlış girildi" };

    expect(await codeOf(rc.createCorrectionRequest(depo.ctx, { ...input, reason: "yok" }))).toBe("VALIDATION");
    const req = await rc.createCorrectionRequest(kat.ctx, input);
    expect(await codeOf(rc.createCorrectionRequest(depo.ctx, input))).toBe("CONFLICT");

    expect(await codeOf(rc.resolveCorrectionRequest(kat.ctx, { requestId: req.requestId, approved: true }, T0))).toBe("FORBIDDEN");
    expect(await codeOf(rc.resolveCorrectionRequest(mudur.ctx, { requestId: req.requestId, approved: true }, T0))).toBe("FORBIDDEN");
    expect(await codeOf(rc.resolveCorrectionRequest(depo.ctx, { requestId: req.requestId, approved: true }, T0))).toBe("FORBIDDEN");
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(97);

    await rc.resolveCorrectionRequest(sys.ctx, { requestId: req.requestId, approved: true }, T0);
    expect((await testDb.minibarCorrectionRequest.findUniqueOrThrow({ where: { id: req.requestId } })).status).toBe("ONAYLANDI");
    expect(await testDb.minibarTransaction.count({ where: { id: old.transactionId } })).toBe(0);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(100);
    expect(await testDb.auditLog.count({ where: { action: "MINIBAR_CORRECTION_APPROVE" } })).toBe(1);
    expect(await codeOf(rc.resolveCorrectionRequest(sys.ctx, { requestId: req.requestId, approved: true }, T0))).toBe("CONFLICT");
  });

  it("düzeltme (DUZELTME) onayı farkı havuza yansıtır; ret hiçbir şeyi değiştirmez; başka otel NOT_FOUND", async () => {
    const { w, kat, depo, sys } = await world();
    const old = await rep(kat.ctx, w, 3, { now: YESTERDAY });
    const req = await rc.createCorrectionRequest(depo.ctx, {
      transactionId: old.transactionId,
      actionType: "DUZELTME",
      reason: "Fazla yazılmış",
      proposedData: { [w.cola.id]: 1 },
    });
    const sysOther = await staff("R-SYS", "DIAMOND");
    // R-SYS sees every active hotel; a hotel-bound user would get NOT_FOUND
    const katOther = await staff("R-KAT", "DIAMOND");
    expect(await codeOf(rc.resolveCorrectionRequest(katOther.ctx, { requestId: req.requestId, approved: false }, T0))).toBe("NOT_FOUND");
    expect(sysOther.userId).toBeTruthy();

    await rc.resolveCorrectionRequest(sys.ctx, { requestId: req.requestId, approved: true }, T0);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(99);
    expect(await testDb.minibarTransactionItem.findFirstOrThrow({ where: { transactionId: old.transactionId } })).toMatchObject({ added: 1 });

    const old2 = await rep(kat.ctx, w, 1, { productId: w.water.id, now: new Date(YESTERDAY.getTime() - 3_600_000) });
    const req2 = await rc.createCorrectionRequest(depo.ctx, { transactionId: old2.transactionId, actionType: "SILME", reason: "Talep ret edilecek" });
    await rc.resolveCorrectionRequest(sys.ctx, { requestId: req2.requestId, approved: false, rejectReason: "Gerekçe yetersiz" }, T0);
    expect(await testDb.minibarCorrectionRequest.findUniqueOrThrow({ where: { id: req2.requestId } })).toMatchObject({ status: "REDDEDILDI", rejectReason: "Gerekçe yetersiz" });
    expect(await testDb.minibarTransaction.count({ where: { id: old2.transactionId } })).toBe(1);
  });
});

describe("QR doğrulama kanıtı (KAT-1) ve DND bekleme süresi (KAT-3)", () => {
  async function requireQr(hotelId: string) {
    await testDb.setting.create({ data: { hotelId, key: "minibar.requireQrForControl", value: true } });
  }
  const scan = (userId: string, roomId: string, at: Date) =>
    testDb.qrScanLog.create({ data: { userId, roomId, kind: "PERSONEL", ok: true, ip: "t", userAgent: "t", createdAt: at } });

  it("MMD ayrı bir kayıttır: QR istemez, DND sayısına girmez, odayı ve görevini tamamlamaz", async () => {
    const { w, kat, kat2 } = await world();
    await requireQr(w.hotelId);
    const key = randomUUID();
    const first = await mmd.recordMmd(kat.ctx, { roomId: w.room.id, reason: "Misafir uyuyor", clientRequestId: key }, T0);
    expect(first).toMatchObject({ roomNumber: w.room.number, reason: "Misafir uyuyor", countToday: 1 });
    // The same tap again is the same record; somebody else's use of the key is refused.
    expect((await mmd.recordMmd(kat.ctx, { roomId: w.room.id, reason: "Misafir uyuyor", clientRequestId: key }, T0)).mmdId).toBe(first.mmdId);
    expect(await codeOf(mmd.recordMmd(kat2.ctx, { roomId: w.room.id, reason: "x y", clientRequestId: key }, T0))).toBe("CONFLICT");
    for (let i = 1; i <= 4; i += 1) await mmd.recordMmd(kat.ctx, { roomId: w.room.id, reason: `Sebep ${i}` }, minutes(T0, i));

    expect(await testDb.roomMmd.count({ where: { roomId: w.room.id, date } })).toBe(5);
    expect(await testDb.roomDnd.count({ where: { roomId: w.room.id } })).toBe(0);
    expect(await testDb.roomCheck.count({ where: { roomId: w.room.id } })).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: "MMD_MARK", userId: kat.userId } })).toBe(5);
    const listed = await mmd.roomMmdsToday(kat.ctx, w.room.id, minutes(T0, 10));
    expect(listed.rows).toHaveLength(5);
    expect(listed.rows[0]!.reason).toBe("Sebep 4");

    expect(await codeOf(mmd.recordMmd(kat.ctx, { roomId: w.room.id, reason: " " }, T0))).toBe("VALIDATION");
    const gar = await staff("R-GAR");
    expect(await codeOf(mmd.recordMmd(gar.ctx, { roomId: w.room.id, reason: "Misafir uyuyor" }, T0))).toBe("FORBIDDEN");
  });

  it("kontrol edilen odaya (ikame, Sarfiyat Yok, tamamlanan DND) MMD girilemez; önceki kaydın tekrarı yine döner", async () => {
    const { w, kat, kat2 } = await world();
    const key = randomUUID();
    await mmd.recordMmd(kat.ctx, { roomId: w.room.id, reason: "Misafir uyuyor", clientRequestId: key }, T0);
    await rep(kat.ctx, w, 1, { now: minutes(T0, 10) });
    expect(await messageOf(mmd.recordMmd(kat.ctx, { roomId: w.room.id, reason: "Misafir uyuyor" }, minutes(T0, 20)))).toBe(
      "Bu oda bugün zaten kontrol edildi; MMD kaydı girilemez",
    );
    // A retried tap of the earlier record is still that record, not a refusal.
    expect(await codeOf(mmd.recordMmd(kat.ctx, { roomId: w.room.id, reason: "Misafir uyuyor", clientRequestId: key }, minutes(T0, 21)))).toBe("OK");

    const w2 = await minibarWorld({ hotelCode: w.hotelCode });
    await noUse(kat.ctx, w2.room.id, T0);
    expect(await codeOf(mmd.recordMmd(kat.ctx, { roomId: w2.room.id, reason: "Misafir uyuyor" }, minutes(T0, 5)))).toBe("CONFLICT");

    const w3 = await minibarWorld({ hotelCode: w.hotelCode });
    await dnd.markDnd(kat.ctx, { roomId: w3.room.id }, T0);
    await dnd.markDnd(kat2.ctx, { roomId: w3.room.id }, minutes(T0, 130));
    expect(await codeOf(mmd.recordMmd(kat.ctx, { roomId: w3.room.id, reason: "Misafir uyuyor" }, minutes(T0, 140)))).toBe("CONFLICT");
    expect(await testDb.roomMmd.count()).toBe(1);
  });

  it("QR zorunluyken DND ve MMD kanıt istemez: odaya girilemediği için kaydedilirler", async () => {
    const { w, kat } = await world();
    await requireQr(w.hotelId);
    expect(await codeOf(dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0))).toBe("OK");
    expect(await codeOf(mmd.recordMmd(kat.ctx, { roomId: w.room.id, reason: "Misafir uyuyor" }, T0))).toBe("OK");
    // The writers that mean "I was inside the room" still ask for the scan.
    expect(await codeOf(rep(kat.ctx, w, 1))).toBe("FORBIDDEN");
    expect(await codeOf(noUse(kat.ctx, w.room.id))).toBe("FORBIDDEN");
  });

  it("QR zorunluyken kanıtsız ikame / sarfiyat yok / kontrol API'si FORBIDDEN; kanıtla serbest", async () => {
    const { w, kat, kat2 } = await world();
    await requireQr(w.hotelId);
    expect(await messageOf(rep(kat.ctx, w, 1))).toBe("Bu oda için QR doğrulaması gerekli. Lütfen odadaki QR kodu okutun.");
    expect(await codeOf(noUse(kat.ctx, w.room.id))).toBe("FORBIDDEN");
    requireUser.mockResolvedValue(kat.ctx);
    const res = await checkRoute.POST(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [{ productId: w.cola.id, setupId: w.setup.id, qty: 1 }], clientRequestId: randomUUID() }),
      }),
      { params: Promise.resolve({ roomId: w.room.id }) },
    );
    expect(res.status).toBe(403);
    expect(await testDb.minibarTransaction.count()).toBe(0);
    expect((await rc.getRoomCheckView(kat.ctx, w.room.id, T0)).qrVerified).toBe(false);

    // A failed scan is no proof; a successful one of another user neither.
    await testDb.qrScanLog.create({ data: { userId: kat.userId, roomId: w.room.id, kind: "PERSONEL", ok: false, ip: "t", userAgent: "t", createdAt: T0 } });
    await scan(kat2.userId, w.room.id, T0);
    expect(await codeOf(rep(kat.ctx, w, 1))).toBe("FORBIDDEN");

    await scan(kat.userId, w.room.id, minutes(T0, -5));
    expect((await rc.getRoomCheckView(kat.ctx, w.room.id, T0)).qrVerified).toBe(true);
    expect(await codeOf(rep(kat.ctx, w, 1))).toBe("OK");
    // 10 dakikadan eski kanıt geçmez
    expect(await codeOf(rep(kat.ctx, w, 1, { now: minutes(T0, 6) }))).toBe("FORBIDDEN");
  });

  it("dndAllowed gerçek değer: bekleme süresi boyunca false, sonra true; kontrol edilen odada false", async () => {
    const { w, kat } = await world();
    expect((await rc.getRoomCheckView(kat.ctx, w.room.id, T0)).taskItem).toMatchObject({ dndAllowed: true, dndWaitMinutes: 0 });
    await dnd.markDnd(kat.ctx, { roomId: w.room.id }, T0);
    expect((await rc.getRoomCheckView(kat.ctx, w.room.id, minutes(T0, 10))).taskItem).toMatchObject({
      dndAllowed: false,
      dndWaitMinutes: 110,
    });
    expect((await rc.getRoomCheckView(kat.ctx, w.room.id, minutes(T0, 120))).taskItem).toMatchObject({
      dndAllowed: true,
      dndWaitMinutes: 0,
    });
    await rep(kat.ctx, w, 1, { now: minutes(T0, 121) });
    expect((await rc.getRoomCheckView(kat.ctx, w.room.id, minutes(T0, 122))).taskItem?.dndAllowed).toBe(false);
  });
});

describe("KAT-11 / KAT-12", () => {
  it("MyBar karşılama kaydı oda kontrolünden silinemez", async () => {
    const { w, kat, sys } = await world();
    const tx = await testDb.minibarTransaction.create({
      data: { hotelId: w.hotelId, roomId: w.room.id, userId: kat.userId, type: "MYBAR_KARSILAMA", occurredAt: T0 },
    });
    expect(await messageOf(rc.deleteMyTransaction(kat.ctx, tx.id, T0))).toBe(
      "MyBar karşılama kaydı buradan silinemez; MyBar talebi üzerinden düzeltin",
    );
    expect(await codeOf(rc.deleteMyTransaction(sys.ctx, tx.id, T0))).toBe("VALIDATION");
    expect(await testDb.minibarTransaction.count({ where: { id: tx.id } })).toBe(1);
  });

  it("düzeltme talebi: önerilen ürün setup'ta olmalı, DUZELTME miktarsız olamaz, SILME önerisi saklanmaz", async () => {
    const { w, kat, depo } = await world();
    const old = await rep(kat.ctx, w, 2, { now: YESTERDAY });
    const other = await minibarWorld({ hotelCode: w.hotelCode });
    const base = { transactionId: old.transactionId, reason: "Yanlış girildi" };
    expect(await messageOf(rc.createCorrectionRequest(depo.ctx, { ...base, actionType: "DUZELTME", proposedData: { [other.cola.id]: 1 } }))).toBe(
      "Ürün bu setup'ta bulunamadı",
    );
    expect(await codeOf(rc.createCorrectionRequest(depo.ctx, { ...base, actionType: "DUZELTME" }))).toBe("VALIDATION");
    expect(await codeOf(rc.createCorrectionRequest(depo.ctx, { ...base, actionType: "DUZELTME", proposedData: {} }))).toBe("VALIDATION");
    expect(await testDb.minibarCorrectionRequest.count()).toBe(0);

    const ok = await rc.createCorrectionRequest(depo.ctx, { ...base, actionType: "SILME", proposedData: { [w.cola.id]: 1 } });
    expect((await testDb.minibarCorrectionRequest.findUniqueOrThrow({ where: { id: ok.requestId } })).proposedData).toBeNull();
  });
});

describe("rotalar ve eski servisler", () => {
  const json = (body: unknown, method = "POST") =>
    new Request("http://localhost/api/minibar/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });

  it("eski MMD servisi yok (yeni MMD kaydı server/mmd.ts ve kendi uç noktasıdır)", async () => {
    expect((rc as Record<string, unknown>).submitRoomMmd).toBeUndefined();
    expect(existsSync(path.join(process.cwd(), "src/modules/minibar/server/minibarService.ts"))).toBe(false);
    expect((rc as Record<string, unknown>).getMyRoomCheckHistory).toBeUndefined();
  });

  it("check / no-consumption / my-checks rotaları servise bağlı (yeni ve eski gövde)", async () => {
    const { w, kat } = await world();
    requireUser.mockResolvedValue(kat.ctx);

    const res = await checkRoute.POST(json({ items: [{ productId: w.cola.id, setupId: w.setup.id, qty: 2 }], clientRequestId: randomUUID() }), params({ roomId: w.room.id }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { transactionId: string; added: number };
    expect(body.added).toBe(2);

    // deprecated page shape: setupId resolved on the server, qty 0 dropped
    const legacy = await checkRoute.POST(json({ consumedItems: [{ productId: w.water.id, qty: 1 }, { productId: w.cola.id, qty: 0 }] }), params({ roomId: w.room.id }));
    expect(legacy.status).toBe(200);
    expect(((await legacy.json()) as { replenishedCount: number }).replenishedCount).toBe(1);

    const strict = await checkRoute.POST(json({ items: [{ productId: w.cola.id, setupId: w.setup.id, qty: 1 }], clientRequestId: "bad" }), params({ roomId: w.room.id }));
    expect(strict.status).toBe(400);

    const w2 = await minibarWorld({ hotelCode: w.hotelCode });
    const none = await noUseRoute.POST(json({ clientRequestId: randomUUID() }), params({ roomId: w2.room.id }));
    expect(none.status).toBe(200);
    const again = await noUseRoute.POST(json({ clientRequestId: randomUUID() }), params({ roomId: w2.room.id }));
    expect(again.status).toBe(409);
    // legacy "empty list" on a recorded room is also a conflict
    const legacyNone = await checkRoute.POST(json({ consumedItems: [] }), params({ roomId: w2.room.id }));
    expect(legacyNone.status).toBe(409);

    const view = await roomRoute.GET(new Request("http://localhost/api/minibar/room/x"), params({ roomId: w.room.id }));
    expect(view.status).toBe(200);
    expect(((await view.json()) as { badge: { kind: string } }).badge.kind).toBe("KONTROL_EDILDI");

    const del = await myCheckRoute.DELETE(new Request("http://localhost/api/minibar/my-checks/t", { method: "DELETE" }), params({ txId: body.transactionId }));
    expect(del.status).toBe(200);
    expect(((await del.json()) as { restored: unknown[] }).restored).toHaveLength(1);
  });
});

describe("R-OSS: birden çok otelde İşlemlerim ve grup iptali", () => {
  /** R-OSS: oturum oteli DIAMOND, oda kontrolü yaptığı otel ROYAL (kapsamında). */
  async function ossWorld() {
    const base = await world({ rooms: 2 });
    const oss = await staff("R-OSS", "DIAMOND", [base.w.hotelCode]);
    return { ...base, oss };
  }

  it("oturum oteli başka olsa da kendi kayıtları (kapsamdaki tüm oteller) listelenir; başkasınınki listelenmez", async () => {
    const { w, kat, oss } = await ossWorld();
    const mine = await rep(oss.ctx, w, 2, { now: minutes(T0, 5) });
    await rep(kat.ctx, w, 1, { now: minutes(T0, 6), roomId: w.rooms[1]!.id });
    const list = await rc.listMyTransactions(oss.ctx, {}, minutes(T0, 20));
    expect(list.map((x) => x.id)).toEqual([mine.transactionId]);
    expect(list[0]).toMatchObject({ roomNumber: w.room.number, canDelete: true, isToday: true });
    // narrowing to a hotel outside the scope still fails
    const other = await testDb.hotel.findFirstOrThrow({ where: { code: "DIAMOND" } });
    expect(await rc.listMyTransactions(oss.ctx, { hotelId: other.id }, minutes(T0, 20))).toEqual([]);
    const katOther = await staff("R-KAT", "DIAMOND");
    expect(await codeOf(rc.listMyTransactions(katOther.ctx, { hotelId: w.hotelId }, T0))).toBe("FORBIDDEN");
  });

  it("R-OSS bugünkü kaydını tek tek siler; stok geri döner", async () => {
    const { w, oss } = await ossWorld();
    const r = await rep(oss.ctx, w, 2);
    await rc.deleteMyTransaction(oss.ctx, r.transactionId, minutes(T0, 5));
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(100);
  });

  it("deleteMyTransactions: bir odanın tüm bugünkü kayıtları tek işlemde silinir, ürünler depoya döner", async () => {
    const { w, oss } = await ossWorld();
    const a = await rep(oss.ctx, w, 1, { now: T0 });
    const b = await rep(oss.ctx, w, 2, { now: minutes(T0, 10), productId: w.water.id });
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(99);
    const out = await rc.deleteMyTransactions(oss.ctx, { transactionIds: [a.transactionId, b.transactionId] }, minutes(T0, 20));
    expect(out.deleted).toBe(2);
    expect(out.restored).toEqual(expect.arrayContaining([{ productId: w.cola.id, qty: 1 }, { productId: w.water.id, qty: 2 }]));
    expect(await testDb.minibarTransaction.count()).toBe(0);
    await expectConsistent(w.hotelId, w.cola.id, 100);
    await expectConsistent(w.hotelId, w.water.id, 100);
  });

  it("deleteMyTransactions: hepsi ya da hiçbiri (dünkü kayıt varsa FORBIDDEN, başkasınınki NOT_FOUND)", async () => {
    const { w, kat, kat2, oss } = await ossWorld();
    const today = await rep(kat.ctx, w, 1, { now: minutes(T0, 1) });
    const old = await rep(kat.ctx, w, 1, { now: YESTERDAY });
    expect(await codeOf(rc.deleteMyTransactions(kat.ctx, { transactionIds: [today.transactionId, old.transactionId] }, T0))).toBe("FORBIDDEN");
    expect(await codeOf(rc.deleteMyTransactions(kat2.ctx, { transactionIds: [today.transactionId] }, T0))).toBe("NOT_FOUND");
    expect(await codeOf(rc.deleteMyTransactions(kat.ctx, { transactionIds: [] }, T0))).toBe("VALIDATION");
    expect(await testDb.minibarTransaction.count()).toBe(2);
    expect((await stockOf(w.hotelId, w.cola.id)).remainingQty).toBe(98);
    // R-OSS (MB-TUK A) may cancel the group of another attendant, as with a single record
    await rc.deleteMyTransactions(oss.ctx, { transactionIds: [today.transactionId] }, T0);
    expect(await testDb.minibarTransaction.count()).toBe(1);
  });

  it("createCorrectionRequests: geçmiş grup için tek gerekçeyle SILME talepleri; bekleyen atlanır; R-OSS karar verir", async () => {
    const { w, kat, oss } = await ossWorld();
    const a = await rep(kat.ctx, w, 1, { now: YESTERDAY });
    const b = await rep(kat.ctx, w, 1, { now: new Date(YESTERDAY.getTime() + 600_000), productId: w.water.id });
    const out = await rc.createCorrectionRequests(kat.ctx, { transactionIds: [a.transactionId, b.transactionId], reason: "Yanlış oda seçildi" });
    expect(out.requestIds).toHaveLength(2);
    expect(out.message).toMatch(/Oda Servisi Sorumlusu/);
    expect(await testDb.minibarCorrectionRequest.count({ where: { actionType: "SILME", status: "BEKLIYOR" } })).toBe(2);
    expect(await codeOf(rc.createCorrectionRequests(kat.ctx, { transactionIds: [a.transactionId], reason: "Yanlış oda seçildi" }))).toBe("CONFLICT");
    expect(await codeOf(rc.createCorrectionRequests(kat.ctx, { transactionIds: [a.transactionId], reason: "yok" }))).toBe("VALIDATION");

    const listed = await rc.listMyTransactions(kat.ctx, {}, T0);
    expect(listed.find((x) => x.id === a.transactionId)?.pendingCorrection).toMatchObject({ actionType: "SILME" });

    await rc.resolveCorrectionRequest(oss.ctx, { requestId: out.requestIds[0], approved: true }, T0);
    expect(await testDb.minibarTransaction.count({ where: { id: a.transactionId } })).toBe(0);
  });
});
