import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDate, businessDateStart, businessDay } from "@/lib/time";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { getLiveStatus } = await import("@/modules/core/server/liveStatus");
const { affectsLiveStatus } = await import("@/shell/useLiveStatus");

const TABLES = ["audit_logs", "orders", "mybar_requests", "waiter_calls", "qr_scan_logs", "daily_tasks", "guest_records", "rooms"];

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate(...TABLES);
});
afterAll(async () => {
  await truncate(...TABLES);
  await dropReferenceData();
  await testDb.$disconnect();
});

const TODAY = () => businessDay(businessDate());
const YESTERDAY = () => new Date(TODAY().getTime() - 86_400_000);
/** An instant before 00:00 Nicosia today. */
const BEFORE_TODAY = () => new Date(businessDateStart(businessDate()).getTime() - 30 * 3_600_000);

async function sysCtx(extra: string[] = ["DIAMOND", "PREMIUM"], username = "sys1") {
  const user = await makeUser({ username, roleCode: "R-SYS", hotelCode: "ROYAL", extraHotelCodes: extra });
  return ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: extra });
}

let seq = 0;
async function outletOf(hotel: string, type: "ODA_SERVISI" | "BAR" = "BAR") {
  const hid = await hotelId(hotel);
  const existing = await testDb.outlet.findFirst({ where: { hotelId: hid, type } });
  if (existing) return existing;
  return testDb.outlet.create({ data: { hotelId: hid, name: `${type} ${hotel}`, type, hasMenu: true, hasOrdering: true } });
}

async function tableOf(hotel: string) {
  const outlet = await outletOf(hotel, "BAR");
  const found = await testDb.outletTable.findFirst({ where: { outletId: outlet.id } });
  if (found) return found;
  const area = await testDb.outletAreaDefinition.create({ data: { outletId: outlet.id, type: "KAPALI" } });
  return testDb.outletTable.create({ data: { outletId: outlet.id, areaId: area.id, label: `M${++seq}` } });
}

async function order(hotel: string, kind: "ODA_SERVISI" | "MASA", status: string, day: Date = TODAY()) {
  const outlet = await outletOf(hotel, kind === "ODA_SERVISI" ? "ODA_SERVISI" : "BAR");
  return testDb.order.create({
    data: {
      hotelId: outlet.hotelId,
      outletId: outlet.id,
      kind,
      status: status as never,
      businessDate: day,
      orderNo: ++seq,
      guestLanguage: "tr",
      idempotencyKey: `k${++seq}`,
      clientIp: "10.0.0.1",
    },
  });
}

async function room(hotel: string) {
  const hid = await hotelId(hotel);
  const floor =
    (await testDb.floor.findFirst({ where: { hotelId: hid } })) ??
    (await testDb.floor.create({ data: { hotelId: hid, number: 1, name: "Kat 1" } }));
  return testDb.room.create({ data: { hotelId: hid, floorId: floor.id, number: `${++seq}` } });
}

async function mybar(hotel: string, status: "BEKLEMEDE" | "TAMAMLANDI" | "IPTAL", seen = false, day: Date = TODAY()) {
  const r = await room(hotel);
  return testDb.mybarRequest.create({
    data: {
      hotelId: r.hotelId,
      roomId: r.id,
      businessDate: day,
      status,
      language: "tr",
      seenAt: seen ? new Date() : null,
      completedAt: status === "TAMAMLANDI" ? new Date() : null,
      cancelledAt: status === "IPTAL" ? new Date() : null,
      idempotencyKey: `m${++seq}`,
      clientIp: "10.0.0.1",
    },
  });
}

async function taskItems(hotel: string, statuses: string[], day: Date = TODAY()) {
  const hid = await hotelId(hotel);
  const task = await testDb.dailyTask.create({ data: { hotelId: hid, date: day, type: "INHOUSE_KONTROL" } });
  for (const status of statuses) {
    const r = await room(hotel);
    await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: r.id, status: status as never } });
  }
}

async function call(hotel: string, status: "ACIK" | "YANITLANDI" | "KAPANDI", createdAt = new Date()) {
  const table = await tableOf(hotel);
  return testDb.waiterCall.create({ data: { outletId: table.outletId, tableId: table.id, type: "GARSON", status, createdAt } });
}

async function scan(hotel: string, over: { ok?: boolean; createdAt?: Date; roomId?: string } = {}) {
  const table = over.roomId ? null : await tableOf(hotel);
  return testDb.qrScanLog.create({
    data: {
      kind: "MISAFIR",
      ok: over.ok ?? true,
      ip: "10.0.0.1",
      userAgent: "t",
      tableId: table?.id,
      roomId: over.roomId,
      createdAt: over.createdAt ?? new Date(),
    },
  });
}

const rowOf = (s: Awaited<ReturnType<typeof getLiveStatus>>, key: string) => s.rows.find((r) => r.key === key);

describe("getLiveStatus (gerçek test DB)", () => {
  it("oda servisi: alınan / tamamlanan / bekleyen; iptal hiçbirinde sayılmaz, dünkü sayılmaz; otel otel ve toplam", async () => {
    const ctx = await sysCtx();
    for (const s of ["GONDERILDI", "ONAYLANDI", "HAZIR", "YOLDA"]) await order("ROYAL", "ODA_SERVISI", s);
    await order("ROYAL", "ODA_SERVISI", "TESLIM_EDILDI");
    await order("ROYAL", "ODA_SERVISI", "TESLIM_EDILDI");
    await order("ROYAL", "ODA_SERVISI", "IPTAL");
    await order("ROYAL", "ODA_SERVISI", "TESLIM_EDILDI", YESTERDAY()); // closed yesterday
    await order("DIAMOND", "ODA_SERVISI", "ONAYLANDI");
    await order("ROYAL", "MASA", "GONDERILDI"); // a table order is not room service

    const row = rowOf(await getLiveStatus(ctx), "roomService")!;
    expect(row.byHotel[await hotelId("ROYAL")]).toEqual([7, 2, 4]);
    expect(row.byHotel[await hotelId("DIAMOND")]).toEqual([1, 0, 1]);
    expect(row.byHotel[await hotelId("PREMIUM")]).toEqual([0, 0, 0]);
    expect(row.total).toEqual([8, 2, 5]);
  });

  it("gece yarısını aşan sipariş: dün alınıp bugün teslim edilen tamamlanan, hâlâ açık olan bekleyen sayılır", async () => {
    const ctx = await sysCtx();
    const dayStart = businessDateStart(businessDate());
    // Taken at 23:55 yesterday, delivered after midnight.
    const late = await order("DIAMOND", "ODA_SERVISI", "TESLIM_EDILDI", YESTERDAY());
    await testDb.order.update({
      where: { id: late.id },
      data: { createdAt: new Date(dayStart.getTime() - 5 * 60_000), deliveredAt: new Date(dayStart.getTime() + 1000) },
    });
    // Taken yesterday evening, still on its way.
    const open = await order("DIAMOND", "ODA_SERVISI", "YOLDA", YESTERDAY());
    await testDb.order.update({ where: { id: open.id }, data: { createdAt: new Date(dayStart.getTime() - 20 * 60_000) } });
    // Not counted: delivered yesterday, cancelled yesterday, and an order abandoned days ago.
    const done = await order("DIAMOND", "ODA_SERVISI", "TESLIM_EDILDI", YESTERDAY());
    await testDb.order.update({ where: { id: done.id }, data: { deliveredAt: new Date(dayStart.getTime() - 60_000) } });
    await order("DIAMOND", "ODA_SERVISI", "IPTAL", YESTERDAY());
    const stale = await order("DIAMOND", "ODA_SERVISI", "GONDERILDI", YESTERDAY());
    await testDb.order.update({ where: { id: stale.id }, data: { createdAt: BEFORE_TODAY() } });

    const row = rowOf(await getLiveStatus(ctx), "roomService")!;
    expect(row.byHotel[await hotelId("DIAMOND")]).toEqual([2, 1, 1]);
  });

  it("QR sipariş: yalnız MASA; SERVIS_EDILDI tamamlanan, REDDEDILDI hiçbirinde değil", async () => {
    const ctx = await sysCtx();
    await order("ROYAL", "MASA", "GONDERILDI");
    await order("ROYAL", "MASA", "ONAYLANDI");
    await order("ROYAL", "MASA", "SERVIS_EDILDI");
    await order("ROYAL", "MASA", "REDDEDILDI");
    await order("ROYAL", "ODA_SERVISI", "GONDERILDI");
    await order("ROYAL", "MASA", "SERVIS_EDILDI", YESTERDAY()); // served yesterday

    const row = rowOf(await getLiveStatus(ctx), "qrOrders")!;
    expect(row.byHotel[await hotelId("ROYAL")]).toEqual([4, 1, 2]);
    expect(row.total).toEqual([4, 1, 2]);
  });

  it("MyBar: bekleyen = tamamlanmamış ve iptal olmamış (onay bekleyen + onaylanan)", async () => {
    const ctx = await sysCtx();
    await mybar("ROYAL", "BEKLEMEDE");
    await mybar("ROYAL", "BEKLEMEDE", true);
    await mybar("ROYAL", "TAMAMLANDI", true);
    await mybar("ROYAL", "IPTAL");
    await mybar("DIAMOND", "BEKLEMEDE");
    await mybar("ROYAL", "BEKLEMEDE", false, YESTERDAY());

    const row = rowOf(await getLiveStatus(ctx), "mybar")!;
    expect(row.byHotel[await hotelId("ROYAL")]).toEqual([4, 1, 2]);
    expect(row.byHotel[await hotelId("DIAMOND")]).toEqual([1, 0, 1]);
    expect(row.total).toEqual([5, 1, 3]);
  });

  it("minibar görevi: Kat panosu tanımı (tamamlanan / toplam görev kalemi), dünkü sayılmaz", async () => {
    const ctx = await sysCtx();
    await taskItems("ROYAL", ["TAMAMLANDI", "TAMAMLANDI", "BEKLIYOR", "DND_BEKLIYOR", "EKSIK"]);
    await taskItems("DIAMOND", ["TAMAMLANDI", "DEVAM"]);
    await taskItems("ROYAL", ["BEKLIYOR"], YESTERDAY());

    const row = rowOf(await getLiveStatus(ctx), "minibarTasks")!;
    expect(row.byHotel[await hotelId("ROYAL")]).toEqual([2, 5]);
    expect(row.byHotel[await hotelId("DIAMOND")]).toEqual([1, 2]);
    expect(row.total).toEqual([3, 7]);
  });

  it("garson çağrısı: alınan / bekleyen (yalnız ACIK); dünkü sayılmaz", async () => {
    const ctx = await sysCtx();
    await call("ROYAL", "ACIK");
    await call("ROYAL", "ACIK");
    await call("ROYAL", "YANITLANDI");
    await call("ROYAL", "KAPANDI");
    await call("DIAMOND", "ACIK");
    await call("ROYAL", "ACIK", BEFORE_TODAY());

    const row = rowOf(await getLiveStatus(ctx), "waiterCalls")!;
    expect(row.byHotel[await hotelId("ROYAL")]).toEqual([4, 2]);
    expect(row.total).toEqual([5, 3]);
  });

  it("QR menü görüntüleme: bugünkü başarılı masa taraması; oda taraması, hatalı ve dünkü sayılmaz", async () => {
    const ctx = await sysCtx();
    const r = await room("ROYAL");
    await scan("ROYAL");
    await scan("ROYAL");
    await scan("DIAMOND");
    await scan("ROYAL", { ok: false });
    await scan("ROYAL", { createdAt: BEFORE_TODAY() });
    await scan("ROYAL", { roomId: r.id });

    const row = rowOf(await getLiveStatus(ctx), "qrViews")!;
    expect(row.byHotel[await hotelId("ROYAL")]).toEqual([2]);
    expect(row.byHotel[await hotelId("DIAMOND")]).toEqual([1]);
    expect(row.total).toEqual([3]);
  });

  it("modül kapalı: o otelin hücresi null; her yerde kapalıysa satır yok", async () => {
    const ctx = await sysCtx();
    await order("ROYAL", "MASA", "GONDERILDI");
    const off = async (hotel: string) =>
      testDb.hotelModule.updateMany({ where: { hotelId: await hotelId(hotel), moduleKey: "QR_ORDER" }, data: { enabled: false } });
    await off("DIAMOND");

    const row = rowOf(await getLiveStatus(ctx), "qrOrders")!;
    expect(row.byHotel[await hotelId("DIAMOND")]).toBeNull();
    expect(row.byHotel[await hotelId("ROYAL")]).toEqual([1, 0, 1]);
    expect(row.total).toEqual([1, 0, 1]);

    await off("ROYAL");
    await off("PREMIUM");
    const none = await getLiveStatus(ctx);
    expect(rowOf(none, "qrOrders")).toBeUndefined();
    expect(rowOf(none, "roomService")).toBeDefined(); // other rows are unaffected
  });

  it("izin: minibar yönetimi (R-MTY) oda servisi / QR satırlarını görmez, minibar görevini görür", async () => {
    const user = await makeUser({ username: "mty1", roleCode: "R-MTY", hotelCode: "ROYAL" });
    const ctx = await ctxFor(user, { hotelCode: "ROYAL" });
    await order("ROYAL", "ODA_SERVISI", "GONDERILDI");
    await order("ROYAL", "MASA", "GONDERILDI");
    await taskItems("ROYAL", ["TAMAMLANDI", "BEKLIYOR"]);

    const keys = (await getLiveStatus(ctx)).rows.map((r) => r.key);
    expect(keys).not.toContain("roomService");
    expect(keys).not.toContain("qrOrders");
    expect(keys).not.toContain("qrViews");
    expect(keys).not.toContain("waiterCalls");
    expect(keys).toContain("minibarTasks");
  });

  it("kullanıcıya özel istisna bir satırı açar (RO-TAL canView=true) ve kapatır (MB-PERS canView=false)", async () => {
    const user = await makeUser({ username: "mty2", roleCode: "R-MTY", hotelCode: "ROYAL" });
    const ctx = await ctxFor(user, { hotelCode: "ROYAL" });
    await order("ROYAL", "ODA_SERVISI", "GONDERILDI");
    await mybar("ROYAL", "BEKLEMEDE");
    expect(rowOf(await getLiveStatus(ctx), "mybar")).toBeDefined();

    const grant = await testDb.appScreen.findUniqueOrThrow({ where: { code: "RO-TAL" } });
    const withhold = await testDb.appScreen.findUniqueOrThrow({ where: { code: "MB-PERS" } });
    await testDb.userScreenPermission.create({ data: { userId: user.id, screenId: grant.id, canView: true } });
    await testDb.userScreenPermission.create({ data: { userId: user.id, screenId: withhold.id, canView: false } });

    const s = await getLiveStatus(ctx);
    expect(rowOf(s, "roomService")!.total).toEqual([1, 0, 1]);
    expect(rowOf(s, "mybar")).toBeUndefined();
  });

  it("otel kapsamı: yalnız ROYAL yöneticisi DIAMOND rakamı almaz; hotelId tek otele daraltır", async () => {
    const ctx = await sysCtx([]); // scope: ROYAL only
    await order("ROYAL", "ODA_SERVISI", "GONDERILDI");
    await order("DIAMOND", "ODA_SERVISI", "GONDERILDI");
    await order("DIAMOND", "ODA_SERVISI", "GONDERILDI");

    const s = await getLiveStatus(ctx);
    expect(s.hotels.map((h) => h.code)).toEqual(["ROYAL"]);
    expect(Object.keys(rowOf(s, "roomService")!.byHotel)).toEqual([await hotelId("ROYAL")]);
    expect(rowOf(s, "roomService")!.total).toEqual([1, 0, 1]);
    await expect(getLiveStatus(ctx, await hotelId("DIAMOND"))).rejects.toMatchObject({ code: "FORBIDDEN" });

    const all = await sysCtx(["DIAMOND", "PREMIUM"], "sys2");
    const one = await getLiveStatus(all, await hotelId("DIAMOND"));
    expect(one.hotels.map((h) => h.code)).toEqual(["DIAMOND"]);
    expect(rowOf(one, "roomService")!.total).toEqual([2, 0, 2]);
  });

  it("CR-KOM görme yetkisi olmayan rol (R-KAT) → FORBIDDEN", async () => {
    const kat = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });
    await expect(getLiveStatus(await ctxFor(kat, { hotelCode: "ROYAL" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("otel bazlı CR-KOM yetkisi: canView=false olan otel kapsam dışı kalır", async () => {
    const user = await makeUser({ username: "otm1", roleCode: "R-OTM", hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND"] });
    const ctx = await ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND"] });
    await taskItems("DIAMOND", ["TAMAMLANDI", "BEKLIYOR", "BEKLIYOR"]);
    await taskItems("ROYAL", ["TAMAMLANDI", "BEKLIYOR"]);
    const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "CR-KOM" } });
    await testDb.roleScreenPermission.create({
      data: { roleId: user.roleId, screenId: screen.id, hotelId: await hotelId("DIAMOND"), canView: false },
    });
    try {
      const s = await getLiveStatus(ctx);
      expect(s.hotels.map((h) => h.code)).toEqual(["ROYAL"]);
      expect(rowOf(s, "minibarTasks")!.total).toEqual([1, 2]);
    } finally {
      await testDb.roleScreenPermission.deleteMany({ where: { hotelId: { not: null } } });
    }
  });
});

describe("affectsLiveStatus", () => {
  it("sipariş, MyBar, görev, çağrı ve masa tarama olayları yeniler; oturum olayı yenilemez", () => {
    for (const t of ["order.created", "order.delivered", "mybar.created", "mybar.completed", "task.updated", "call.created", "call.resolved", "scan.table"]) {
      expect(affectsLiveStatus(t)).toBe(true);
    }
    expect(affectsLiveStatus("session.changed")).toBe(false);
  });
});
