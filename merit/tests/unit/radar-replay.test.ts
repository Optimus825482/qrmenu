import { randomUUID } from "node:crypto";
import { fromZonedTime } from "date-fns-tz";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { resetSingleFlight } from "@/lib/singleFlight";
import { TZ, businessDate, businessDay } from "@/lib/time";
import { compareRadarEvents } from "@/modules/radar/events";
import { findForbiddenKeys } from "@/modules/radar/privacy";
import { comparableState, initialState } from "@/modules/radar/state";
import type { RadarEvent } from "@/modules/radar/types";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData } from "../helpers/fixtures";
import { makeRadarWorld, resetRadarData, type RadarWorld } from "../helpers/radarFixtures";

const auth = vi.hoisted(() => ({ ctx: undefined as unknown as Ctx }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => auth.ctx }));

const { GET } = await import("@/app/api/radar/replay/route");
const { radarSnapshot } = await import("@/modules/radar/server/snapshot");
const { assertRadarScope } = await import("@/modules/radar/server/scope");
const { parseReplayQuery, MAX_EVENTS, PAGE } = await import("@/modules/radar/server/replay/limits");
const { replayLines } = await import("@/modules/radar/server/replay/stream");
const { mergeSources } = await import("@/modules/radar/server/replay/merge");
const { auditReplayOnce } = await import("@/modules/radar/server/replay/audit");
type ReplayLine = import("@/modules/radar/server/replay/stream").ReplayLine;

let w: RadarWorld;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetRadarData();
  resetSingleFlight();
  w = await makeRadarWorld();
});
afterAll(async () => {
  await resetRadarData();
  await dropReferenceData();
  await testDb.$disconnect();
});

const DAY_MS = 86_400_000;
/** The synthetic day: two days ago (inside the 90 day retention, never today). */
const D = businessDate(new Date(Date.now() - 2 * DAY_MS));
const D1 = businessDate(new Date(Date.now() - DAY_MS));
const at = (day: string, hms: string): Date => fromZonedTime(`${day}T${hms.length === 5 ? `${hms}:00` : hms}`, TZ);
const uniq = () => randomUUID().slice(0, 8);

let orderSeq = 0;
function orderData(over: { hotelId: string; outletId: string; kind: "MASA" | "ODA_SERVISI" } & Record<string, unknown>) {
  return {
    businessDate: businessDay(D),
    orderNo: 2000 + ++orderSeq,
    status: "GONDERILDI" as const,
    guestLanguage: "tr",
    idempotencyKey: randomUUID(),
    clientIp: "10.9.9.9",
    note: "gizli siparis notu",
    subtotal: "99.90",
    rejectReason: "gizli ret sebebi",
    ...over,
  };
}

type Day = {
  orders: { o1: string; o2: string; o3: string; rs: string };
  rooms: string[];
  tables: string[];
  outletId: string;
  hotelId: string;
  productId: string;
  waiterId: string;
  sessions: { staff: string; system: string };
};

/** One synthetic day on ROYAL: every replay source gets rows, forbidden columns are filled on purpose. */
async function buildDay(): Promise<Day> {
  const hw = w.royal;
  const hid = hw.hotelId;
  const outlet = hw.outlets[0]!.outlet;
  const [t0, t1, t2] = hw.outlets[0]!.tables;
  const rooms = hw.rooms;
  const staffId = w.katRoyal.user.id;
  const base = { hotelId: hid, outletId: outlet.id };
  const ev = (orderId: string, to: "GONDERILDI" | "ONAYLANDI" | "HAZIR" | "SERVIS_EDILDI", time: string, from?: string) =>
    testDb.orderEvent.create({
      data: { orderId, to, ...(from ? { from: from as "GONDERILDI" } : {}), at: at(D, time), note: "gizli olay notu", userId: staffId },
    });

  // Orders: o1 is created 10:00 and approved at 12:30:00.000; o2 is created in that very millisecond.
  const o1 = await testDb.order.create({
    data: orderData({ ...base, kind: "MASA", tableId: t0!.id, status: "SERVIS_EDILDI", createdAt: at(D, "10:00"), prepStartedAt: at(D, "12:35"), escalatedAt: at(D, "10:20") }),
  });
  await ev(o1.id, "GONDERILDI", "10:00");
  await ev(o1.id, "ONAYLANDI", "12:30:00.000", "GONDERILDI");
  await ev(o1.id, "HAZIR", "12:40", "ONAYLANDI");
  await ev(o1.id, "SERVIS_EDILDI", "13:00", "HAZIR");
  const o2 = await testDb.order.create({
    data: orderData({ ...base, kind: "MASA", tableId: t1!.id, status: "GONDERILDI", createdAt: at(D, "12:30:00.000") }),
  });
  await ev(o2.id, "GONDERILDI", "12:30:00.000");
  const o3 = await testDb.order.create({
    data: orderData({ ...base, kind: "MASA", tableId: t2!.id, status: "ONAYLANDI", createdAt: at(D, "11:00") }),
  });
  await ev(o3.id, "GONDERILDI", "11:00");
  await ev(o3.id, "ONAYLANDI", "11:05", "GONDERILDI");

  const rsOutlet =
    (await testDb.outlet.findFirst({ where: { hotelId: hid, type: "ODA_SERVISI" } })) ??
    (await testDb.outlet.create({
      data: { hotelId: hid, name: `Radar RS ${uniq()}`, type: "ODA_SERVISI", hasMenu: false, hasOrdering: true },
    }));
  const rs = await testDb.order.create({
    data: orderData({
      hotelId: hid, outletId: rsOutlet.id, kind: "ODA_SERVISI", roomId: rooms[6]!.id, status: "ONAYLANDI",
      createdAt: at(D, "09:00"), slaWarnedAt: at(D, "09:30"), slaBreachedAt: at(D, "10:00"),
    }),
  });
  await ev(rs.id, "GONDERILDI", "09:00");
  await ev(rs.id, "ONAYLANDI", "09:10", "GONDERILDI");

  // Calls, scans, assignments.
  await testDb.waiterCall.create({
    data: { outletId: outlet.id, tableId: t0!.id, type: "GARSON", note: "gizli cagri notu", status: "KAPANDI", resolvedAt: at(D, "12:10"), createdAt: at(D, "12:00") },
  });
  await testDb.waiterCall.create({ data: { outletId: outlet.id, tableId: t1!.id, type: "HESAP", createdAt: at(D, "13:00") } });
  await testDb.qrScanLog.create({ data: { tableId: t0!.id, kind: "MISAFIR", ok: true, ip: "1.2.3.4", userAgent: "gizli-ua", createdAt: at(D, "12:30:00.000") } });
  await testDb.qrScanLog.create({ data: { roomId: rooms[0]!.id, kind: "MISAFIR", ok: true, ip: "1.2.3.5", userAgent: "gizli-ua", createdAt: at(D, "12:21") } });
  await testDb.qrScanLog.create({ data: { tableId: t0!.id, kind: "MISAFIR", ok: false, error: "gecersiz", ip: "1.2.3.6", userAgent: "gizli-ua", createdAt: at(D, "12:22") } });
  const waiter = w.fbmRoyal.user.id;
  await testDb.operationEvent.create({ data: { hotelId: hid, outletId: outlet.id, type: "table.assigned", refId: t0!.id, data: { userId: waiter }, at: at(D, "09:00") } });
  await testDb.operationEvent.create({ data: { hotelId: hid, outletId: outlet.id, type: "table.assigned", refId: t0!.id, data: { userId: null }, at: at(D, "14:00") } });

  // Printer and jobs.
  const printer = await testDb.printer.create({ data: { hotelId: hid, outletId: outlet.id, name: `P-${uniq()}`, ip: "10.1.1.1", lastSeenAt: at(D, "20:00"), lastStatus: "OK" } });
  await testDb.operationEvent.create({ data: { hotelId: hid, outletId: outlet.id, type: "printer.health", refId: printer.id, data: { state: "SESSIZ" }, at: at(D, "11:00") } });
  await testDb.operationEvent.create({ data: { hotelId: hid, outletId: outlet.id, type: "printer.health", refId: printer.id, data: { state: "HAZIR" }, at: at(D, "11:30") } });
  await testDb.printJob.create({
    data: { hotelId: hid, printerId: printer.id, orderId: o1.id, kind: "FIS", payload: { gizli: "icerik" }, status: "BASILDI", printedAt: at(D, "12:32"), createdAt: at(D, "12:31"), updatedAt: at(D, "12:32") },
  });
  await testDb.printJob.create({
    data: { hotelId: hid, printerId: printer.id, kind: "FIS", payload: {}, status: "HATA", error: "gizli hata", createdAt: at(D, "15:00"), updatedAt: at(D, "15:01") },
  });

  // Rooms: checks around midnight, DND, audit, tasks.
  await testDb.roomCheck.create({ data: { roomId: rooms[0]!.id, userId: staffId, checkDate: businessDay(D), type: "URUN_EKLENDI", startedAt: at(D, "10:00"), endedAt: at(D, "10:00") } });
  await testDb.roomCheck.create({ data: { roomId: rooms[1]!.id, userId: staffId, checkDate: businessDay(D), type: "SARFIYAT_YOK", startedAt: at(D, "23:50"), endedAt: at(D, "23:50") } });
  await testDb.roomCheck.create({ data: { roomId: rooms[2]!.id, userId: staffId, checkDate: businessDay(D1), type: "URUN_EKLENDI", startedAt: at(D1, "00:10"), endedAt: at(D1, "00:10") } });
  const dndA = await testDb.roomDnd.create({
    data: { hotelId: hid, roomId: rooms[3]!.id, date: businessDay(D), count: 2, firstAt: at(D, "11:00"), lastAt: at(D, "14:00"), status: "TAMAMLANDI", updatedAt: at(D, "14:00") },
  });
  await testDb.roomDndCheck.create({ data: { dndId: dndA.id, no: 1, userId: staffId, at: at(D, "11:00"), note: "gizli dnd notu" } });
  await testDb.roomDndCheck.create({ data: { dndId: dndA.id, no: 2, userId: staffId, at: at(D, "14:00") } });
  const dndB = await testDb.roomDnd.create({
    data: { hotelId: hid, roomId: rooms[4]!.id, date: businessDay(D), count: 1, firstAt: at(D, "11:30"), lastAt: at(D, "11:30"), status: "EKSIK" },
  });
  await testDb.roomDndCheck.create({ data: { dndId: dndB.id, no: 1, userId: staffId, at: at(D, "11:30") } });
  await testDb.roomDnd.update({ where: { id: dndB.id }, data: { updatedAt: at(D, "22:00") } });
  // `updatedAt` is stamped by Prisma on update; pin it for the test.
  await testDb.$executeRaw`UPDATE room_dnds SET updated_at = ${at(D, "22:00")} WHERE id = ${dndB.id}`;
  await testDb.$executeRaw`UPDATE room_dnds SET updated_at = ${at(D, "14:00")} WHERE id = ${dndA.id}`;
  await testDb.auditLog.create({
    data: {
      hotelId: hid, userId: staffId, action: "MINIBAR_ROOM_CHECK_DELETE", entity: "MinibarTransaction", entityId: "tx1",
      before: { roomId: rooms[0]!.id, note: "gizli denetim notu" }, createdAt: at(D, "15:00"),
    },
  });
  const task = await testDb.dailyTask.create({ data: { hotelId: hid, date: businessDay(D), type: "INHOUSE_KONTROL", createdAt: at(D, "06:00") } });
  const item0 = await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: rooms[0]!.id, status: "TAMAMLANDI", priority: 1, checkedAt: at(D, "10:00"), note: "gizli gorev notu" } });
  await testDb.taskStatusLog.create({ data: { taskItemId: item0.id, from: "BEKLIYOR", to: "TAMAMLANDI", userId: staffId, createdAt: at(D, "10:00"), note: "gizli log notu" } });
  await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: rooms[1]!.id, status: "TAMAMLANDI", priority: 2, checkedAt: at(D, "23:50") } });

  // MyBar.
  await testDb.mybarRequest.create({
    data: {
      hotelId: hid, roomId: rooms[5]!.id, businessDate: businessDay(D), status: "TAMAMLANDI", language: "tr", note: "gizli mybar notu",
      closeNote: "gizli kapanis", idempotencyKey: randomUUID(), clientIp: "10.0.0.9",
      createdAt: at(D, "14:00"), seenAt: at(D, "14:05"), completedAt: at(D, "14:20"), seenById: staffId, completedById: staffId,
    },
  });

  // Stock: 68 -> 63 (12:00) -> 60 (14:00) -> 80 (16:00); today's remaining is 80.
  const group = await testDb.productGroup.create({ data: { name: `G-${uniq()}` } });
  const product = await testDb.product.create({ data: { groupId: group.id, name: `Kola-${uniq()}`, salePrice: "3.50" } });
  await testDb.hotelStock.create({ data: { hotelId: hid, productId: product.id, totalQty: 200, usedQty: 120, remainingQty: 80, criticalLevel: 100 } });
  const move = (qty: number, type: "KULLANIM" | "GIRIS", time: string) =>
    testDb.hotelStockMovement.create({ data: { hotelId: hid, productId: product.id, userId: staffId, type, qty, note: "gizli stok notu", createdAt: at(D, time) } });
  await move(-5, "KULLANIM", "12:00");
  await move(-3, "KULLANIM", "14:00");
  await move(20, "GIRIS", "16:00");
  await testDb.operationEvent.create({ data: { hotelId: hid, type: "upload.missing", refId: `${D}@10:00`, data: { date: D, slot: "10:00" }, at: at(D, "10:00") } });

  // Sessions: a floor supervisor (two sessions), a SISTEM-role session, idle marker, failed mail.
  const roleOf = async (c: Ctx) => (await testDb.role.findUniqueOrThrow({ where: { id: c.user.roleId } })).id;
  const mk = (ctx: Ctx, over: Record<string, unknown>) =>
    roleOf(ctx).then((roleId) =>
      testDb.userSession.create({
        data: { userId: ctx.user.id, hotelId: hid, roleId, status: "ONLINE", expiresAt: new Date(Date.now() + 3_600_000), ip: "10.4.4.4", userAgent: "gizli-ua", deviceLabel: "gizli-cihaz", ...over },
      }),
    );
  await mk(w.katRoyal, { status: "CIKTI", loginAt: at(D, "08:00"), logoutAt: at(D, "17:00"), lastSeenAt: at(D, "17:00") });
  const live = await mk(w.katRoyal, { loginAt: at(D, "09:00"), lastSeenAt: at(D, "09:30") });
  const sys = await mk(w.sys, { loginAt: at(D, "10:00"), lastSeenAt: at(D, "10:00") });
  await testDb.sessionEvent.create({ data: { sessionId: live.id, event: "WARN", createdAt: at(D, "16:00") } });
  await testDb.operationEvent.create({ data: { hotelId: hid, type: "presence.idle", refId: live.id, data: { idleMinutes: 10 }, at: at(D, "15:00") } });
  await testDb.emailLog.create({ data: { to: "x@example.com", subject: "gizli konu", kind: "TEST", status: "HATA", error: "gizli", trackingId: randomUUID(), createdAt: at(D, "11:50"), updatedAt: at(D, "12:00") } });
  await testDb.$executeRaw`UPDATE email_logs SET updated_at = ${at(D, "12:00")}`;

  return {
    orders: { o1: o1.id, o2: o2.id, o3: o3.id, rs: rs.id },
    rooms: rooms.map((r) => r.id),
    tables: [t0!.id, t1!.id, t2!.id],
    outletId: outlet.id,
    hotelId: hid,
    productId: product.id,
    waiterId: waiter,
    sessions: { staff: live.id, system: sys.id },
  };
}

function url(p: Record<string, string>): string {
  return `http://localhost/api/radar/replay?${new URLSearchParams(p).toString()}`;
}

async function fetchLines(ctx: Ctx, p: Record<string, string>): Promise<{ status: number; lines: ReplayLine[]; body: string }> {
  auth.ctx = ctx;
  const res = await GET(new Request(url(p)));
  const body = await res.text();
  if (!res.ok) return { status: res.status, lines: [], body };
  return { status: res.status, lines: body.trim().split("\n").map((l) => JSON.parse(l) as ReplayLine), body };
}

const eventsOf = (lines: ReplayLine[]): RadarEvent[] => lines.flatMap((l) => (l.kind === "event" ? [l.e] : []));

async function direct(ctx: Ctx, p: Record<string, string>, opts: { maxEvents?: number; page?: number } = {}): Promise<ReplayLine[]> {
  const q = parseReplayQuery(new URLSearchParams(p), new Date(), 90);
  const layers = await assertRadarScope(ctx, q.hotelId, "R");
  const out: ReplayLine[] = [];
  for await (const line of replayLines(ctx, q, layers, opts)) out.push(line);
  return out;
}

const WHOLE_DAY = () => ({ hotelId: w.royal.hotelId, day: D });

describe("limits", () => {
  const now = new Date();
  const parse = (p: Record<string, string>, retention = 90) => parseReplayQuery(new URLSearchParams({ hotelId: "h1", day: D, ...p }), now, retention);
  const fails = (fn: () => unknown, message: string) => {
    try {
      fn();
    } catch (e) {
      expect(e).toMatchObject({ code: "VALIDATION", message });
      return;
    }
    throw new Error("expected a VALIDATION error");
  };

  it("defaults to the whole business day in Nicosia time", () => {
    const q = parse({});
    expect(q.from.getTime()).toBe(at(D, "00:00").getTime());
    expect(q.to.getTime()).toBe(at(businessDate(new Date(at(D, "12:00").getTime() + DAY_MS)), "00:00").getTime());
    expect(q.cursor).toBeUndefined();
    expect(MAX_EVENTS).toBe(50_000);
    expect(PAGE).toBe(2000);
  });

  it("accepts HH:mm and HH:mm:ss", () => {
    const q = parse({ from: "08:30:15", to: "09:00" });
    expect(q.from.getTime()).toBe(at(D, "08:30:15").getTime());
    expect(q.to.getTime()).toBe(at(D, "09:00").getTime());
  });

  it("rejects tomorrow and days outside retention", () => {
    fails(() => parse({ day: businessDate(new Date(now.getTime() + DAY_MS)) }), "Gelecekteki bir gün oynatılamaz");
    const today = businessDate(now);
    const edge = businessDate(new Date(fromZonedTime(`${today}T12:00:00`, TZ).getTime() - 7 * DAY_MS));
    expect(parse({ day: edge }, 7).hotelId).toBe("h1"); // exactly retention days back is fine
    const past = businessDate(new Date(fromZonedTime(`${today}T12:00:00`, TZ).getTime() - 8 * DAY_MS));
    fails(() => parse({ day: past }, 7), "Gün saklama süresi dışında");
  });

  it("rejects inverted and oversized windows", () => {
    fails(() => parse({ from: "10:00", to: "10:00" }), "Başlangıç saati bitişten önce olmalı");
    fails(() => parse({ from: "11:00", to: "10:00" }), "Başlangıç saati bitişten önce olmalı");
    fails(() => parse({ from: "00:00", to: "25:00" }), "Pencere en çok 24 saat olabilir");
    fails(() => parse({ from: "00:00", to: "25:01" }), "Pencere en çok 24 saat olabilir");
    expect(parse({ from: "00:30", to: "24:30" }).to.getTime() - parse({ from: "00:30", to: "24:30" }).from.getTime()).toBe(DAY_MS);
  });

  it("rejects malformed input", () => {
    fails(() => parse({ day: "2026-13-40" }), "Geçersiz gün");
    fails(() => parse({ day: "dün" }), "Gün yyyy-MM-dd biçiminde olmalı");
    fails(() => parse({ from: "8" }), "Saat HH:mm veya HH:mm:ss biçiminde olmalı");
    fails(() => parse({ cursor: "bozuk" }), "Geçersiz imleç");
    fails(() => parseReplayQuery(new URLSearchParams({ day: D }), now, 90), "Otel belirtilmedi");
  });

  it("reads a cursor back and keeps it inside the window", () => {
    const c = `${at(D, "12:00").toISOString()}|order_events:abc:status`;
    const q = parse({ cursor: c });
    expect(q.cursor).toEqual({ at: at(D, "12:00"), id: "order_events:abc:status" });
    fails(() => parse({ from: "13:00", cursor: c }), "İmleç pencerenin dışında");
  });
});

describe("merge", () => {
  const e = (id: string, ms: number, to: "GONDERILDI" | "ONAYLANDI"): RadarEvent => ({
    id, at: new Date(ms).toISOString(), hotelId: "h", layer: "SIPARIS", type: "order.status", orderId: id, orderNo: 1, kind: "MASA", to,
  });
  async function* gen(xs: RadarEvent[]) {
    for (const x of xs) yield x;
  }
  const collect = async (it: AsyncIterable<RadarEvent>) => {
    const out: RadarEvent[] = [];
    for await (const x of it) out.push(x);
    return out;
  };

  it("orders by (at, rank, id) and puts the creation first on equal instants", async () => {
    const a = [e("a1", 1000, "ONAYLANDI"), e("a2", 3000, "ONAYLANDI")];
    const b = [e("b1", 1000, "GONDERILDI"), e("b2", 2000, "ONAYLANDI")];
    const c: RadarEvent[] = [];
    const out = await collect(mergeSources([gen(a), gen(b), gen(c)]));
    expect(out.map((x) => x.id)).toEqual(["b1", "a1", "b2", "a2"]);
    expect([...out].sort(compareRadarEvents).map((x) => x.id)).toEqual(out.map((x) => x.id));
  });

  it("is stable for identical keys and handles no inputs", async () => {
    const x = e("same", 5, "ONAYLANDI");
    const out = await collect(mergeSources([gen([x]), gen([{ ...x }])]));
    expect(out).toHaveLength(2);
    expect(await collect(mergeSources([]))).toEqual([]);
  });
});

describe("day replay stream", () => {
  it("streams the snapshot first, events in total order, then end", async () => {
    const day = await buildDay();
    const lines = await direct(w.sys, { ...WHOLE_DAY() });
    expect(lines[0]!.kind).toBe("snapshot");
    expect(lines.at(-1)).toMatchObject({ kind: "end" });
    const events = eventsOf(lines);
    expect(lines.filter((l) => l.kind === "snapshot")).toHaveLength(1);
    expect(events.length).toBeGreaterThan(40);
    expect((lines.at(-1) as { count: number }).count).toBe(events.length);
    for (let i = 1; i < events.length; i++) expect(compareRadarEvents(events[i - 1]!, events[i]!)).toBeLessThanOrEqual(0);
    expect(new Set(events.map((x) => x.id)).size).toBe(events.length);

    // Same millisecond 12:30:00.000: the order creation comes before the approval of the other order.
    const idx = (pred: (x: RadarEvent) => boolean) => events.findIndex(pred);
    const created = idx((x) => x.type === "order.status" && x.orderId === day.orders.o2 && x.to === "GONDERILDI");
    const approved = idx((x) => x.type === "order.status" && x.orderId === day.orders.o1 && x.to === "ONAYLANDI" && !x.prep);
    expect(created).toBeGreaterThanOrEqual(0);
    expect(created).toBeLessThan(approved);

    const types = new Set(events.map((x) => x.type));
    for (const t of [
      "order.status", "order.escalated", "order.sla", "call.opened", "call.closed", "table.scanned", "room.scanned", "table.assigned",
      "print.job", "printer.health", "room.checked", "room.check.changed", "dnd.marked", "dnd.missed", "task.updated", "task.generated",
      "mybar.opened", "mybar.seen", "mybar.closed", "stock.level", "upload.status", "presence", "mail.failed",
    ]) expect(types, t).toContain(t);
  });

  it("maps each source onto the documented events", async () => {
    const day = await buildDay();
    const events = eventsOf(await direct(w.sys, { ...WHOLE_DAY() }));
    const of = <T extends RadarEvent["type"]>(t: T) => events.filter((x) => x.type === t) as Extract<RadarEvent, { type: T }>[];

    const statuses = of("order.status").filter((x) => x.orderId === day.orders.o1).map((x) => `${x.to}${x.prep ? "+prep" : ""}`);
    expect(statuses).toEqual(["GONDERILDI", "ONAYLANDI", "ONAYLANDI+prep", "HAZIR", "SERVIS_EDILDI"]);
    const prep = of("order.status").find((x) => x.prep)!;
    expect(prep.id).toBe(`order-prep:${day.orders.o1}`);
    expect(of("order.escalated")).toHaveLength(1);
    expect(of("order.sla").map((x) => x.level)).toEqual(["WARN", "BREACH"]);
    expect(of("order.sla")[0]!.layer).toBe("ODA_SERVISI");
    expect(of("order.status").find((x) => x.orderId === day.orders.rs)!.layer).toBe("ODA_SERVISI");

    expect(of("call.opened")).toHaveLength(2);
    expect(of("call.closed")).toHaveLength(1);
    expect(of("table.scanned")).toHaveLength(1); // the failed scan is not a scan
    expect(of("room.scanned")).toHaveLength(1);
    expect(of("table.assigned").map((x) => x.waiterId)).toEqual([day.waiterId, null]);

    expect(of("print.job").map((x) => x.status).sort()).toEqual(["BASILDI", "HATA", "KUYRUKTA", "KUYRUKTA"]);
    expect(of("printer.health").map((x) => x.state)).toEqual(["SESSIZ", "HAZIR"]);

    expect(of("room.checked")).toHaveLength(2); // the 00:10 check belongs to the next day
    expect(of("room.check.changed")).toMatchObject([{ op: "SIL", roomId: day.rooms[0] }]);
    expect(of("dnd.marked").map((x) => `${x.count}/${x.minChecks}:${x.status}`)).toEqual(["1/2:AKTIF", "1/2:AKTIF", "2/2:TAMAMLANDI"]);
    expect(of("dnd.missed")).toMatchObject([{ roomIds: [day.rooms[4]] }]);
    expect(of("task.updated").map((x) => x.to)).toEqual(["TAMAMLANDI", "TAMAMLANDI"]); // log row + checkedAt fallback
    expect(of("task.generated")).toMatchObject([{ itemCount: 2, date: D }]);

    expect(of("mybar.opened")).toHaveLength(1);
    expect(of("mybar.seen")).toHaveLength(1);
    expect(of("mybar.closed")).toMatchObject([{ outcome: "TAMAM" }]);

    expect(of("stock.level").map((x) => x.remaining)).toEqual([63, 60, 80]);
    expect(of("stock.level")[0]).toMatchObject({ productId: day.productId, critical: 100 });
    expect(of("upload.status").filter((x) => x.status === "EKSIK").map((x) => x.kind).sort()).toEqual(["ARRIVAL", "DEPARTURE", "IN_HOUSE"]);

    expect(of("presence").map((x) => `${x.status}`).sort()).toEqual(["BOSTA", "CIKTI", "ONLINE", "ONLINE", "ONLINE", "UYARI"]);
    expect(of("mail.failed")).toHaveLength(1);
  });

  it("loses and duplicates nothing across page boundaries, also with equal milliseconds", async () => {
    await buildDay();
    const whole = eventsOf(await direct(w.sys, { ...WHOLE_DAY() }));
    for (const page of [2, 3, 5]) {
      const paged = eventsOf(await direct(w.sys, { ...WHOLE_DAY() }, { page }));
      expect(paged.map((x) => x.id), `page ${page}`).toEqual(whole.map((x) => x.id));
    }
    // 12:30:00.000 holds an order creation, an approval and a table scan: three sources in one millisecond.
    const sameMs = whole.filter((x) => x.at === at(D, "12:30:00.000").toISOString());
    expect(sameMs.length).toBeGreaterThanOrEqual(3);
  });

  it("starts from the state at `from`, not from today", async () => {
    const day = await buildDay();
    const lines = await direct(w.sys, { ...WHOLE_DAY(), from: "12:00", to: "13:30" });
    const snap = lines[0] as Extract<ReplayLine, { kind: "snapshot" }>;
    expect(snap.at).toBe(at(D, "12:00").toISOString());
    expect(snap.state.generatedAt).toBe(at(D, "12:00").toISOString());
    const tables = snap.state.layers.order!.outlets[0]!.areas.flatMap((a) => a.tables);
    const ordersAt = tables.flatMap((t) => t.orders);
    // o1 was sent at 10:00 and approved only at 12:30: GONDERILDI at noon. o2 does not exist yet.
    expect(ordersAt.find((o) => o.orderId === day.orders.o1)).toMatchObject({ status: "GONDERILDI", escalated: true });
    expect(ordersAt.find((o) => o.orderId === day.orders.o2)).toBeUndefined();
    expect(ordersAt.find((o) => o.orderId === day.orders.o3)).toMatchObject({ status: "ONAYLANDI" });
    // The call opened at 12:00 is open (created at the instant), the second one does not exist yet.
    expect(tables.flatMap((t) => (t.call ? [t.call.callId] : []))).toHaveLength(1);
    // Stock after the 12:00 movement.
    expect(snap.state.layers.minibar!.stock.find((s) => s.productId === day.productId)!.remaining).toBe(63);
    // The stream holds only what happens after noon.
    for (const e of eventsOf(lines)) {
      expect(Date.parse(e.at)).toBeGreaterThan(at(D, "12:00").getTime());
      expect(Date.parse(e.at)).toBeLessThanOrEqual(at(D, "13:30").getTime());
    }
  });

  it("separates the business days at Nicosia midnight", async () => {
    const day = await buildDay();
    const wide = await direct(w.sys, { ...WHOLE_DAY(), from: "00:30", to: "24:30" });
    const checks = eventsOf(wide).filter((x) => x.type === "room.checked");
    const late = checks.find((x) => x.roomId === day.rooms[1])!;
    const early = checks.find((x) => x.roomId === day.rooms[2])!;
    expect(late.at).toBe(at(D, "23:50").toISOString());
    expect(early.at).toBe(at(D1, "00:10").toISOString());
    expect(businessDate(new Date(late.at))).toBe(D);
    expect(businessDate(new Date(early.at))).toBe(D1);

    const minibar = async (instant: Date) => (await radarSnapshot(w.sys, day.hotelId, { asOf: instant }));
    const rooms = (s: Awaited<ReturnType<typeof minibar>>) => s.layers.minibar!.floors.flatMap((f) => f.rooms);
    const before = await minibar(at(D, "23:55"));
    expect(before.businessDate).toBe(D);
    expect(rooms(before).find((r) => r.roomId === day.rooms[1])!.checkedToday).toMatchObject({ type: "SARFIYAT_YOK" });
    const after = await minibar(at(D1, "00:05"));
    expect(after.businessDate).toBe(D1);
    expect(rooms(after).every((r) => r.checkedToday === null)).toBe(true); // yesterday's checks do not carry over
    const later = await minibar(at(D1, "00:15"));
    expect(rooms(later).find((r) => r.roomId === day.rooms[2])!.checkedToday).toMatchObject({ type: "URUN_EKLENDI" });
    expect(rooms(later).find((r) => r.roomId === day.rooms[1])!.checkedToday).toBeNull();

    const tail = await direct(w.sys, { ...WHOLE_DAY(), from: "23:30", to: "24:00" });
    expect(eventsOf(tail).filter((x) => x.type === "room.checked").map((x) => x.roomId)).toEqual([day.rooms[1]]);
  });

  it("carries no forbidden key and no forbidden value on any line", async () => {
    await buildDay();
    const { status, lines, body } = await fetchLines(w.sys, { ...WHOLE_DAY() });
    expect(status).toBe(200);
    expect(lines.length).toBeGreaterThan(40);
    for (const line of lines) expect(findForbiddenKeys(line), JSON.stringify(line).slice(0, 200)).toEqual([]);
    for (const secret of ["gizli", "1.2.3.", "10.4.4.4", "99.90", "icerik"]) expect(body).not.toContain(secret);
  });
});

describe("scope", () => {
  it("answers 403 and audits a hotel outside the caller's scope", async () => {
    await buildDay();
    const res = await fetchLines(w.otmRoyal, { hotelId: w.premium.hotelId, day: D });
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME", userId: w.otmRoyal.user.id } })).toBeGreaterThan(0);
    expect(await testDb.auditLog.count({ where: { action: "RADAR_REPLAY" } })).toBe(0);
  });

  it("answers 403 for a role without the radar right", async () => {
    const res = await fetchLines(w.katRoyal, { ...WHOLE_DAY() });
    expect(res.status).toBe(403);
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME", userId: w.katRoyal.user.id } })).toBeGreaterThan(0);
  });

  it("leaves the minibar layer out for a role that cannot see it", async () => {
    await buildDay();
    const { lines } = await fetchLines(w.customNoKat, { ...WHOLE_DAY() });
    const events = eventsOf(lines);
    expect(events.length).toBeGreaterThan(10);
    expect(events.some((e) => e.layer === "MINIBAR")).toBe(false);
    expect(events.some((e) => e.type === "order.status")).toBe(true);
    const snap = lines[0] as Extract<ReplayLine, { kind: "snapshot" }>;
    expect(snap.state.layers.minibar).toBeUndefined();
  });

  it("hides mail failures and SISTEM sessions from everybody but SISTEM", async () => {
    const day = await buildDay();
    const asManager = eventsOf((await fetchLines(w.otmRoyal, { ...WHOLE_DAY() })).lines);
    expect(asManager.some((e) => e.type === "mail.failed")).toBe(false);
    const sessions = (es: RadarEvent[]) => es.flatMap((e) => (e.type === "presence" ? [e.sessionId] : []));
    expect(sessions(asManager)).not.toContain(day.sessions.system);
    expect(sessions(asManager)).toContain(day.sessions.staff);

    const asSystem = eventsOf((await fetchLines(w.sys, { ...WHOLE_DAY() })).lines);
    expect(asSystem.some((e) => e.type === "mail.failed")).toBe(true);
    expect(sessions(asSystem)).toContain(day.sessions.system);
  });

  it("names people only through the snapshot, never in events", async () => {
    await buildDay();
    const { body } = await fetchLines(w.floorWatcher, { ...WHOLE_DAY() });
    expect(body).not.toContain("Test ");
  });
});

describe("limits at the route", () => {
  it("answers 400 with a Turkish message", async () => {
    const tomorrow = businessDate(new Date(Date.now() + DAY_MS));
    const r1 = await fetchLines(w.sys, { hotelId: w.royal.hotelId, day: tomorrow });
    expect(r1.status).toBe(400);
    expect(JSON.parse(r1.body).error.message).toBe("Gelecekteki bir gün oynatılamaz");
    const old = businessDate(new Date(Date.now() - 92 * DAY_MS));
    const r2 = await fetchLines(w.sys, { hotelId: w.royal.hotelId, day: old });
    expect(r2.status).toBe(400);
    expect(JSON.parse(r2.body).error.message).toBe("Gün saklama süresi dışında");
    const r3 = await fetchLines(w.sys, { ...WHOLE_DAY(), from: "10:00", to: "09:00" });
    expect(r3.status).toBe(400);
    const r4 = await fetchLines(w.sys, { ...WHOLE_DAY(), from: "00:00", to: "25:00" });
    expect(r4.status).toBe(400);
  });

  it("serves NDJSON that is not cached", async () => {
    auth.ctx = w.sys;
    const res = await GET(new Request(url({ ...WHOLE_DAY() })));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await res.text();
  });
});

describe("event cap", () => {
  it("ends with more + end at the cap and resumes without duplicates", async () => {
    await buildDay();
    const full = eventsOf(await direct(w.sys, { ...WHOLE_DAY() }));
    expect(full.length).toBeGreaterThan(25);

    const first = await direct(w.sys, { ...WHOLE_DAY() }, { maxEvents: 10 });
    expect(first[0]!.kind).toBe("snapshot");
    const tail = first.slice(-2);
    expect(tail[0]!.kind).toBe("more");
    expect(tail[1]).toEqual({ kind: "end", count: 10 });
    const more = tail[0] as Extract<ReplayLine, { kind: "more" }>;
    const got = eventsOf(first);
    expect(got).toHaveLength(10);
    expect(more.cursor).toBe(`${got[9]!.at}|${got[9]!.id}`);
    expect(more.nextFrom).toBe(got[9]!.at);

    // Follow the cursor chain until the day is exhausted.
    const all = [...got];
    let cursor: string | undefined = more.cursor;
    let guard = 0;
    while (cursor && guard++ < 20) {
      const next = await direct(w.sys, { ...WHOLE_DAY(), cursor }, { maxEvents: 10 });
      expect(next[0]!.kind).not.toBe("snapshot"); // a continuation keeps the client's state
      all.push(...eventsOf(next));
      const m = next.find((l) => l.kind === "more") as Extract<ReplayLine, { kind: "more" }> | undefined;
      cursor = m?.cursor;
    }
    expect(all.map((x) => x.id)).toEqual(full.map((x) => x.id));
  });

  it("does not say `more` when the day fits exactly", async () => {
    await buildDay();
    const full = eventsOf(await direct(w.sys, { ...WHOLE_DAY() }));
    const lines = await direct(w.sys, { ...WHOLE_DAY() }, { maxEvents: full.length });
    expect(lines.some((l) => l.kind === "more")).toBe(false);
    expect(lines.at(-1)).toEqual({ kind: "end", count: full.length });
  });
});

describe("audit", () => {
  const p = () => ({ hotelId: w.royal.hotelId, day: D, from: "00:00", to: "24:00" });
  const rows = () => testDb.auditLog.count({ where: { action: "RADAR_REPLAY" } });

  it("writes one RADAR_REPLAY row per user, hotel and day within 10 minutes", async () => {
    const t = new Date();
    expect(await auditReplayOnce(w.sys, p(), t)).toBe(true);
    expect(await auditReplayOnce(w.sys, { ...p(), from: "08:00", to: "09:00" }, new Date(t.getTime() + 5 * 60_000))).toBe(false);
    expect(await rows()).toBe(1);
    const row = await testDb.auditLog.findFirstOrThrow({ where: { action: "RADAR_REPLAY" } });
    expect(row).toMatchObject({ entity: "Radar", userId: w.sys.user.id, hotelId: w.royal.hotelId });
    expect(row.after).toEqual({ hotelId: w.royal.hotelId, day: D, from: "00:00", to: "24:00" });
    // The 11th minute starts a new record.
    expect(await auditReplayOnce(w.sys, p(), new Date(t.getTime() + 11 * 60_000))).toBe(true);
    expect(await rows()).toBe(2);
  });

  it("keeps users, hotels and days apart", async () => {
    const t = new Date();
    expect(await auditReplayOnce(w.sys, p(), t)).toBe(true);
    expect(await auditReplayOnce(w.otmRoyal, p(), t)).toBe(true);
    expect(await auditReplayOnce(w.sys, { ...p(), day: D1 }, t)).toBe(true);
    expect(await auditReplayOnce(w.sys, { ...p(), hotelId: w.premium.hotelId }, t)).toBe(true);
    expect(await rows()).toBe(4);
  });

  it("is written by the route, once for two requests", async () => {
    await fetchLines(w.sys, { ...WHOLE_DAY() });
    await fetchLines(w.sys, { ...WHOLE_DAY(), from: "08:00", to: "10:00" });
    expect(await rows()).toBe(1);
  });

  it("does not let two parallel requests both write", async () => {
    const t = new Date();
    const results = await Promise.all([auditReplayOnce(w.sys, p(), t), auditReplayOnce(w.sys, p(), t), auditReplayOnce(w.sys, p(), t)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await rows()).toBe(1);
  });
});

describe("snapshot + events = later snapshot", () => {
  it("folds the replayed events into the state a snapshot at the window end shows", async () => {
    const day = await buildDay();
    const { applyEvents } = await import("@/modules/radar/ui/reducers");
    const lines = await direct(w.sys, { ...WHOLE_DAY(), from: "09:30", to: "18:00" });
    const snap = lines[0] as Extract<ReplayLine, { kind: "snapshot" }>;
    const folded = applyEvents(initialState(snap.state), eventsOf(lines));
    const end = await radarSnapshot(w.sys, day.hotelId, { asOf: at(D, "18:00") });
    // Staff presence is left out: the idle marker and sessions opened after the start live only in the stream
    // (the client reducer asks for a refresh for a session it does not know), the snapshot has no such fields.
    const foldedRest = { ...comparableState(folded), staff: undefined };
    const endRest = { ...comparableState(initialState(end)), staff: undefined };
    expect(foldedRest).toEqual(endRest);

    // Sub-window before 16:00 movement (+20): historical stock must rebase against movements after `to`.
    const subLines = await direct(w.sys, { ...WHOLE_DAY(), from: "11:00", to: "15:00" });
    const subStock = eventsOf(subLines).filter((x) => x.type === "stock.level" && x.productId === day.productId);
    expect(subStock.map((x) => (x as Extract<RadarEvent, { type: "stock.level" }>).remaining)).toEqual([63, 60]);
  });
});

describe("asOf snapshot", () => {
  it("equals the live snapshot when asOf is now", async () => {
    const hw = w.royal;
    const outlet = hw.outlets[0]!.outlet;
    const [t0, t1] = hw.outlets[0]!.tables;
    const staffId = w.katRoyal.user.id;
    const now = Date.now();
    const ago = (min: number) => new Date(now - min * 60_000);
    const today = businessDay(businessDate(new Date(now)));
    const mk = async (tableId: string, status: "GONDERILDI" | "ONAYLANDI", min: number, extra: Record<string, unknown> = {}) => {
      const o = await testDb.order.create({
        data: {
          hotelId: hw.hotelId, outletId: outlet.id, kind: "MASA", tableId, businessDate: today, orderNo: 3000 + ++orderSeq, status,
          guestLanguage: "tr", idempotencyKey: randomUUID(), clientIp: "10.9.9.9", createdAt: ago(min), ...extra,
        },
      });
      await testDb.orderEvent.create({ data: { orderId: o.id, to: "GONDERILDI", at: ago(min) } });
      if (status === "ONAYLANDI") await testDb.orderEvent.create({ data: { orderId: o.id, from: "GONDERILDI", to: "ONAYLANDI", at: ago(min - 1) } });
      return o;
    };
    await mk(t0!.id, "GONDERILDI", 10);
    await mk(t1!.id, "ONAYLANDI", 8, { prepStartedAt: ago(5), escalatedAt: ago(6) });
    await testDb.waiterCall.create({ data: { outletId: outlet.id, tableId: t0!.id, type: "GARSON", createdAt: ago(4) } });
    await testDb.waiterCall.create({ data: { outletId: outlet.id, tableId: t1!.id, type: "HESAP", status: "KAPANDI", resolvedAt: ago(3), createdAt: ago(9) } });
    const dnd = await testDb.roomDnd.create({ data: { hotelId: hw.hotelId, roomId: hw.rooms[0]!.id, date: today, count: 2, firstAt: ago(30), lastAt: ago(10), status: "TAMAMLANDI" } });
    await testDb.roomDndCheck.create({ data: { dndId: dnd.id, no: 1, userId: staffId, at: ago(30) } });
    await testDb.roomDndCheck.create({ data: { dndId: dnd.id, no: 2, userId: staffId, at: ago(10) } });
    await testDb.roomCheck.create({ data: { roomId: hw.rooms[1]!.id, userId: staffId, checkDate: today, type: "URUN_EKLENDI", startedAt: ago(20), endedAt: ago(20) } });
    await testDb.mybarRequest.create({
      data: { hotelId: hw.hotelId, roomId: hw.rooms[2]!.id, businessDate: today, language: "tr", idempotencyKey: randomUUID(), clientIp: "10.0.0.1", createdAt: ago(15), seenAt: ago(12) },
    });
    const task = await testDb.dailyTask.create({ data: { hotelId: hw.hotelId, date: today, type: "INHOUSE_KONTROL", createdAt: ago(120) } });
    const item = await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: hw.rooms[1]!.id, status: "TAMAMLANDI", priority: 1, checkedAt: ago(20) } });
    await testDb.taskStatusLog.create({ data: { taskItemId: item.id, from: "BEKLIYOR", to: "TAMAMLANDI", userId: staffId, createdAt: ago(20) } });
    await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: hw.rooms[3]!.id, status: "BEKLIYOR", priority: 2 } });
    const group = await testDb.productGroup.create({ data: { name: `G-${uniq()}` } });
    const product = await testDb.product.create({ data: { groupId: group.id, name: `Su-${uniq()}`, salePrice: "1.00" } });
    await testDb.hotelStock.create({ data: { hotelId: hw.hotelId, productId: product.id, totalQty: 100, usedQty: 60, remainingQty: 40, criticalLevel: 50 } });
    await testDb.hotelStockMovement.create({ data: { hotelId: hw.hotelId, productId: product.id, userId: staffId, type: "KULLANIM", qty: -10, createdAt: ago(25) } });
    const role = await testDb.role.findUniqueOrThrow({ where: { id: w.katRoyal.user.roleId } });
    await testDb.userSession.create({
      data: { userId: staffId, hotelId: hw.hotelId, roleId: role.id, loginAt: ago(60), lastSeenAt: ago(1), expiresAt: new Date(now + 3_600_000), ip: "10.4.4.4", userAgent: "ua" },
    });

    const instant = new Date(now + 1000);
    const live = await radarSnapshot(w.sys, hw.hotelId, { now: instant });
    const past = await radarSnapshot(w.sys, hw.hotelId, { asOf: instant });
    expect(comparableState(initialState(past))).toEqual(comparableState(initialState(live)));
    expect(past.generatedAt).toBe(instant.toISOString());
    expect(past.businessDate).toBe(live.businessDate);
    expect(findForbiddenKeys(past)).toEqual([]);
  });

  it("is a snapshot nobody else may ask for", async () => {
    await expect(radarSnapshot(w.otmRoyal, w.premium.hotelId, { asOf: new Date() })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
