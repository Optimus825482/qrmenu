import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDate, businessDateStart, businessDay } from "@/lib/time";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { getLiveDetail } = await import("@/modules/core/server/liveStatusDetail");
const { getLiveStatus } = await import("@/modules/core/server/liveStatus");

const TABLES = ["audit_logs", "user_sessions", "orders", "mybar_requests", "daily_tasks", "guest_records", "rooms", "floors"];

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

async function sysCtx(extra: string[] = ["DIAMOND", "PREMIUM"]) {
  const user = await makeUser({ username: "sys1", roleCode: "R-SYS", hotelCode: "ROYAL", extraHotelCodes: extra });
  return ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: extra });
}

let seq = 0;
async function floor(hotel: string, number: number) {
  const hid = await hotelId(hotel);
  return (
    (await testDb.floor.findFirst({ where: { hotelId: hid, number } })) ??
    (await testDb.floor.create({ data: { hotelId: hid, number, name: `Kat ${number}` } }))
  );
}
async function room(hotel: string, floorNo = 1) {
  const f = await floor(hotel, floorNo);
  return testDb.room.create({ data: { hotelId: f.hotelId, floorId: f.id, number: `${++seq}` } });
}
async function stay(r: { id: string; hotelId: string }, arrival: Date, departure: Date) {
  return testDb.guestRecord.create({
    data: { hotelId: r.hotelId, roomId: r.id, batchCode: "b", guestCount: 2, arrivalDate: arrival, departureDate: departure, kind: "IN_HOUSE" },
  });
}
async function order(hotel: string, status: string, day: Date = TODAY()) {
  const hid = await hotelId(hotel);
  const outlet =
    (await testDb.outlet.findFirst({ where: { hotelId: hid, type: "ODA_SERVISI" } })) ??
    (await testDb.outlet.create({ data: { hotelId: hid, name: `RS ${hotel}`, type: "ODA_SERVISI", hasMenu: true, hasOrdering: true } }));
  return testDb.order.create({
    data: {
      hotelId: hid,
      outletId: outlet.id,
      kind: "ODA_SERVISI",
      status: status as never,
      businessDate: day,
      orderNo: ++seq,
      guestLanguage: "tr",
      idempotencyKey: `k${++seq}`,
      clientIp: "10.0.0.1",
    },
  });
}

const flow = (d: Awaited<ReturnType<typeof getLiveDetail>>) => {
  if (d.kind === "online" || d.kind === "occupancy" || d.kind === "rooms") throw new Error("akış detayı değil");
  return d;
};
const seg = (h: { segments: { key: string; value: number }[] }) => Object.fromEntries(h.segments.map((s) => [s.key, s.value]));

describe("getLiveDetail (gerçek test DB)", () => {
  it("doluluk ve kat kat doluluk: dolu oda, bugün giriş/çıkış, katlar üstten alta", async () => {
    const ctx = await sysCtx();
    const tomorrow = new Date(TODAY().getTime() + 86_400_000);
    const a = await room("ROYAL", 1);
    const b = await room("ROYAL", 2);
    await room("ROYAL", 2); // empty
    await stay(a, TODAY(), tomorrow); // arrives today
    await stay(b, YESTERDAY(), TODAY()); // leaves today
    await stay(b, YESTERDAY(), TODAY()); // a second record of the same room does not count twice
    const gone = await room("ROYAL", 1);
    await stay(gone, new Date(TODAY().getTime() - 3 * 86_400_000), YESTERDAY()); // already left

    const occ = await getLiveDetail(ctx, "occupancy");
    if (occ.kind !== "occupancy") throw new Error("beklenmeyen tür");
    const royal = occ.hotels.find((h) => h.code === "ROYAL")!;
    expect(royal).toMatchObject({ totalRooms: 4, occupiedRooms: 2, percent: 50, arrivals: 1, departures: 1 });
    expect(occ.hotels).toHaveLength(3);

    const rooms = await getLiveDetail(ctx, "rooms");
    if (rooms.kind !== "rooms") throw new Error("beklenmeyen tür");
    const floors = rooms.hotels.find((h) => h.code === "ROYAL")!.floors;
    expect(floors.map((f) => [f.number, f.occupied, f.total])).toEqual([
      [2, 1, 2],
      [1, 1, 2],
    ]);
  });

  it("oda servisi: aşamalar widget satırıyla aynı toplamı verir; saatlik dağılım ve ortalama teslim süresi", async () => {
    const ctx = await sysCtx();
    for (const s of ["GONDERILDI", "ONAYLANDI", "YOLDA", "IPTAL"]) await order("ROYAL", s);
    const delivered = await order("ROYAL", "TESLIM_EDILDI");
    await testDb.order.update({ where: { id: delivered.id }, data: { deliveredAt: new Date(delivered.createdAt.getTime() + 20 * 60_000) } });
    // Taken before midnight, still open: counted today, but not in today's hours.
    const carried = await order("ROYAL", "HAZIR", YESTERDAY());
    await testDb.order.update({ where: { id: carried.id }, data: { createdAt: new Date(businessDateStart(businessDate()).getTime() - 10 * 60_000) } });

    const royal = flow(await getLiveDetail(ctx, "roomService")).hotels.find((h) => h.code === "ROYAL")!;
    expect(seg(royal)).toEqual({ GONDERILDI: 1, ONAYLANDI: 1, HAZIR: 1, YOLDA: 1, TAMAM: 1, IPTAL: 1 });
    expect(royal.total).toBe(6);
    expect(royal.carried).toBe(1);
    expect(royal.avgMinutes).toBe(20);
    expect(royal.hourly.reduce((a, b) => a + b, 0)).toBe(5);

    const row = (await getLiveStatus(ctx)).rows.find((r) => r.key === "roomService")!;
    expect(row.byHotel[await hotelId("ROYAL")]![0]).toBe(royal.total);
  });

  it("MyBar dört aşama; minibar görevleri durum ve kat kat ilerleme", async () => {
    const ctx = await sysCtx();
    const mk = async (status: "BEKLEMEDE" | "TAMAMLANDI" | "IPTAL", seen: boolean) => {
      const r = await room("DIAMOND");
      await testDb.mybarRequest.create({
        data: { hotelId: r.hotelId, roomId: r.id, businessDate: TODAY(), status, language: "tr", seenAt: seen ? new Date() : null, completedAt: status === "TAMAMLANDI" ? new Date() : null, cancelledAt: status === "IPTAL" ? new Date() : null, idempotencyKey: `m${++seq}`, clientIp: "10.0.0.1" },
      });
    };
    await mk("BEKLEMEDE", false);
    await mk("BEKLEMEDE", true);
    await mk("TAMAMLANDI", true);
    await mk("IPTAL", false);
    const diamond = flow(await getLiveDetail(ctx, "mybar")).hotels.find((h) => h.code === "DIAMOND")!;
    expect(seg(diamond)).toEqual({ ONAY_BEKLIYOR: 1, ONAYLANDI: 1, TAMAMLANDI: 1, IPTAL: 1 });

    const task = await testDb.dailyTask.create({ data: { hotelId: await hotelId("PREMIUM"), date: TODAY(), type: "INHOUSE_KONTROL" } });
    const item = async (floorNo: number, status: string) => {
      const r = await room("PREMIUM", floorNo);
      await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: r.id, status: status as never, checkedAt: status === "TAMAMLANDI" ? new Date() : null } });
    };
    await item(3, "TAMAMLANDI");
    await item(3, "BEKLIYOR");
    await item(1, "TAMAMLANDI");
    await item(1, "DND_BEKLIYOR");
    const premium = flow(await getLiveDetail(ctx, "minibarTasks")).hotels.find((h) => h.code === "PREMIUM")!;
    expect(seg(premium)).toMatchObject({ TAMAMLANDI: 2, BEKLIYOR: 1, DND_BEKLIYOR: 1, DEVAM: 0 });
    expect(premium.floors.map((f) => [f.number, f.done, f.total])).toEqual([
      [3, 1, 2],
      [1, 1, 2],
    ]);
    expect(premium.hourly.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("çevrimiçi: açık oturumlar giriş ve son hareket zamanıyla; kapanan oturum listelenmez", async () => {
    const ctx = await sysCtx();
    const waiter = await makeUser({ username: "garson1", roleCode: "R-SYS", hotelCode: "DIAMOND" });
    const base = { roleId: waiter.roleId, hotelId: await hotelId("DIAMOND"), expiresAt: new Date(Date.now() + 3_600_000), ip: "10.0.0.1", userAgent: "t" };
    const loginAt = new Date(Date.now() - 90 * 60_000);
    const lastSeenAt = new Date(Date.now() - 4 * 60_000);
    await testDb.userSession.create({ data: { ...base, userId: waiter.id, status: "ONLINE", loginAt, lastSeenAt } });
    await testDb.userSession.create({ data: { ...base, userId: waiter.id, status: "CIKTI", logoutAt: new Date() } });

    const d = await getLiveDetail(ctx, "online");
    if (d.kind !== "online") throw new Error("beklenmeyen tür");
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toMatchObject({ fullName: waiter.fullName, status: "ONLINE", loginAt: loginAt.toISOString(), lastSeenAt: lastSeenAt.toISOString() });
    expect(d.hiddenHotels).toBe(0);
  });

  it("Komuta Merkezi yetkisi olmayan kullanıcı detay alamaz", async () => {
    const user = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const ctx = await ctxFor(user, { hotelCode: "ROYAL" });
    await expect(getLiveDetail(ctx, "online")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
