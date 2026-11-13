import { formatInTimeZone } from "date-fns-tz";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { TZ } from "@/lib/time";
import { KPI_CELL_SCREENS } from "@/shell/kpiAccess";
import { CANCELLED_ORDER, COMPLETED_ORDER, commandScope, rowHotels, todayBounds, todayOrderWhere } from "./liveStatus";

/*
 * What opens when a row of the desktop "Anlık Durum" widget is clicked: the same numbers, broken down.
 * Scope is the widget's own (hotels where the caller may view CR-KOM); each kind is then narrowed to the
 * hotels where the caller may see that area, by the same screens that gate the widget's row. A hotel the
 * caller may not see is simply absent.
 */

export const LIVE_DETAIL_KINDS = ["online", "occupancy", "rooms", "roomService", "mybar", "minibarTasks"] as const;
export type LiveDetailKind = (typeof LIVE_DETAIL_KINDS)[number];

export type DetailHotel = { hotelId: string; code: string; name: string };

export type OnlineDetailRow = {
  id: string;
  fullName: string;
  roleName: string;
  hotelName: string;
  outletName: string | null;
  deviceLabel: string | null;
  loginAt: string;
  lastSeenAt: string;
  status: "ONLINE" | "UYARI";
};

export type OccupancyDetailHotel = DetailHotel & {
  totalRooms: number;
  occupiedRooms: number;
  percent: number;
  /** Occupied rooms whose stay starts / ends today. */
  arrivals: number;
  departures: number;
};

export type FloorOccupancy = { floorId: string; number: number; name: string; total: number; occupied: number };
export type RoomsDetailHotel = DetailHotel & { totalRooms: number; occupiedRooms: number; floors: FloorOccupancy[] };

export type FlowTone = "new" | "progress" | "done" | "cancel" | "hold";
export type FlowSegment = { key: string; label: string; value: number; tone: FlowTone };
export type FlowFloor = { floorId: string; number: number; name: string; done: number; total: number };
export type FlowHotel = DetailHotel & {
  total: number;
  segments: FlowSegment[];
  /** 24 numbers, hour 0-23 Nicosia time (see `hourlyLabel`). */
  hourly: number[];
  /** Counted today but taken before midnight (room service only). */
  carried: number;
  /** Average minutes from order to delivery, over today's delivered orders (room service only). */
  avgMinutes: number | null;
  /** Minibar tasks only: progress floor by floor. */
  floors: FlowFloor[];
};

export type LiveDetail =
  | { kind: "online"; generatedAt: string; rows: OnlineDetailRow[]; hiddenHotels: number }
  | { kind: "occupancy"; generatedAt: string; hotels: OccupancyDetailHotel[] }
  | { kind: "rooms"; generatedAt: string; hotels: RoomsDetailHotel[] }
  | { kind: "roomService" | "mybar" | "minibarTasks"; generatedAt: string; hourlyLabel: string; hotels: FlowHotel[] };

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const hourOf = (d: Date) => Number(formatInTimeZone(d, TZ, "H"));
const emptyHours = () => Array.from({ length: 24 }, () => 0);

/** Of `hotelIds`, those where the caller may view ANY of `screens`. */
async function hotelsWithAny(ctx: Ctx, screens: readonly string[], hotelIds: readonly string[]): Promise<string[]> {
  const checks = await Promise.all(hotelIds.map(async (h) => (await Promise.all(screens.map((s) => can(ctx, s, "V", h)))).some(Boolean)));
  return hotelIds.filter((_, i) => checks[i]);
}

const hotelsOf = (ids: string[]) =>
  prisma.hotel.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } });

const head = (h: { id: string; code: string; name: string }): DetailHotel => ({ hotelId: h.id, code: h.code, name: h.name });

/** Names are shown only where the caller may open "Çevrimiçi Kullanıcılar" (CR-ONL); SISTEM sessions stay hidden from others. */
async function onlineDetail(ctx: Ctx, scope: string[], generatedAt: string): Promise<LiveDetail> {
  const visible = await hotelsWithAny(ctx, ["CR-ONL"], scope);
  const sessions = await prisma.userSession.findMany({
    where: {
      hotelId: { in: visible },
      status: { in: ["ONLINE", "UYARI"] },
      ...(ctx.user.roleKind === "SISTEM"
        ? {}
        : { NOT: { OR: [{ role: { kind: "SISTEM" } }, { user: { role: { kind: "SISTEM" } } }] } }),
    },
    select: {
      id: true,
      loginAt: true,
      lastSeenAt: true,
      status: true,
      deviceLabel: true,
      user: { select: { fullName: true } },
      role: { select: { name: true } },
      hotel: { select: { name: true } },
      outlet: { select: { name: true } },
    },
    orderBy: { lastSeenAt: "desc" },
  });
  return {
    kind: "online",
    generatedAt,
    hiddenHotels: scope.length - visible.length,
    rows: sessions.map((s) => ({
      id: s.id,
      fullName: s.user.fullName,
      roleName: s.role.name,
      hotelName: s.hotel.name,
      outletName: s.outlet?.name ?? null,
      deviceLabel: s.deviceLabel,
      loginAt: s.loginAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      status: s.status === "UYARI" ? "UYARI" : "ONLINE",
    })),
  };
}

/** Active rooms with their floor, and today's stays, for the hotels where the caller may see occupancy. */
async function loadOccupancy(ctx: Ctx, scope: string[]) {
  const visible = await hotelsWithAny(ctx, KPI_CELL_SCREENS.doluluk, scope);
  const { day } = todayBounds();
  const [hotels, rooms, stays] = await Promise.all([
    hotelsOf(visible),
    prisma.room.findMany({
      where: { hotelId: { in: visible }, isActive: true },
      select: { id: true, hotelId: true, floor: { select: { id: true, number: true, name: true } } },
    }),
    // The Komuta Merkezi rule: a room is occupied when a stay covers today (one room, however many records).
    prisma.guestRecord.findMany({
      where: { hotelId: { in: visible }, room: { isActive: true }, arrivalDate: { lte: day }, departureDate: { gte: day } },
      select: { roomId: true, arrivalDate: true, departureDate: true },
    }),
  ]);
  const occupied = new Set(stays.map((s) => s.roomId));
  const sameDay = (d: Date) => d.getTime() === day.getTime();
  const arriving = new Set(stays.filter((s) => sameDay(s.arrivalDate)).map((s) => s.roomId));
  const departing = new Set(stays.filter((s) => sameDay(s.departureDate)).map((s) => s.roomId));
  return { hotels, rooms, occupied, arriving, departing };
}

async function occupancyDetail(ctx: Ctx, scope: string[], generatedAt: string): Promise<LiveDetail> {
  const { hotels, rooms, occupied, arriving, departing } = await loadOccupancy(ctx, scope);
  return {
    kind: "occupancy",
    generatedAt,
    hotels: hotels.map((h) => {
      const mine = rooms.filter((r) => r.hotelId === h.id);
      const count = (set: Set<string>) => mine.filter((r) => set.has(r.id)).length;
      const occupiedRooms = count(occupied);
      return {
        ...head(h),
        totalRooms: mine.length,
        occupiedRooms,
        percent: percent(occupiedRooms, mine.length),
        arrivals: count(arriving),
        departures: count(departing),
      };
    }),
  };
}

async function roomsDetail(ctx: Ctx, scope: string[], generatedAt: string): Promise<LiveDetail> {
  const { hotels, rooms, occupied } = await loadOccupancy(ctx, scope);
  return {
    kind: "rooms",
    generatedAt,
    hotels: hotels.map((h) => {
      const floors = new Map<string, FloorOccupancy>();
      for (const r of rooms) {
        if (r.hotelId !== h.id) continue;
        const f = floors.get(r.floor.id) ?? { floorId: r.floor.id, number: r.floor.number, name: r.floor.name, total: 0, occupied: 0 };
        f.total += 1;
        if (occupied.has(r.id)) f.occupied += 1;
        floors.set(r.floor.id, f);
      }
      // Top floor first, like the building itself.
      const list = [...floors.values()].sort((a, b) => b.number - a.number);
      return {
        ...head(h),
        totalRooms: list.reduce((n, f) => n + f.total, 0),
        occupiedRooms: list.reduce((n, f) => n + f.occupied, 0),
        floors: list,
      };
    }),
  };
}

type SegmentDef = { key: string; label: string; tone: FlowTone };

function flowHotel(h: DetailHotel, defs: readonly SegmentDef[], keys: readonly string[], extra: Partial<FlowHotel> = {}): FlowHotel {
  const segments = defs.map((d) => ({ ...d, value: keys.filter((k) => k === d.key).length }));
  return { ...h, total: keys.length, segments, hourly: emptyHours(), carried: 0, avgMinutes: null, floors: [], ...extra };
}

const ROOM_SERVICE_SEGMENTS: readonly SegmentDef[] = [
  { key: "GONDERILDI", label: "Yeni", tone: "new" },
  { key: "ONAYLANDI", label: "Onaylandı", tone: "progress" },
  { key: "HAZIR", label: "Hazır", tone: "progress" },
  { key: "YOLDA", label: "Yolda", tone: "progress" },
  { key: "TAMAM", label: "Teslim edildi", tone: "done" },
  { key: "IPTAL", label: "İptal / ret", tone: "cancel" },
];

async function roomServiceDetail(ctx: Ctx, scope: string[], generatedAt: string): Promise<LiveDetail> {
  const visible = await rowHotels(ctx, "roomService", scope);
  const { day, since, until } = todayBounds();
  const [hotels, orders] = await Promise.all([
    hotelsOf(visible),
    prisma.order.findMany({
      where: { hotelId: { in: visible }, kind: "ODA_SERVISI", ...todayOrderWhere(day, since, until) },
      select: { hotelId: true, status: true, createdAt: true, deliveredAt: true },
    }),
  ]);
  return {
    kind: "roomService",
    generatedAt,
    hourlyLabel: "Saat saat alınan talep",
    hotels: hotels.map((h) => {
      const mine = orders.filter((o) => o.hotelId === h.id);
      const hourly = emptyHours();
      let carried = 0;
      const minutes: number[] = [];
      for (const o of mine) {
        if (o.createdAt >= since) hourly[hourOf(o.createdAt)]! += 1;
        else carried += 1;
        if (o.deliveredAt) minutes.push((o.deliveredAt.getTime() - o.createdAt.getTime()) / 60_000);
      }
      const keys = mine.map((o) => (COMPLETED_ORDER.includes(o.status) ? "TAMAM" : CANCELLED_ORDER.includes(o.status) ? "IPTAL" : o.status));
      const avgMinutes = minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null;
      return flowHotel(head(h), ROOM_SERVICE_SEGMENTS, keys, { hourly, carried, avgMinutes });
    }),
  };
}

/** The four MyBar stages (status + seenAt), with the staff screen's names. */
const MYBAR_SEGMENTS: readonly SegmentDef[] = [
  { key: "ONAY_BEKLIYOR", label: "Onay bekliyor", tone: "new" },
  { key: "ONAYLANDI", label: "Onaylandı", tone: "progress" },
  { key: "TAMAMLANDI", label: "Tamamlandı", tone: "done" },
  { key: "IPTAL", label: "İptal", tone: "cancel" },
];

async function mybarDetail(ctx: Ctx, scope: string[], generatedAt: string): Promise<LiveDetail> {
  const visible = await rowHotels(ctx, "mybar", scope);
  const { day } = todayBounds();
  const [hotels, requests] = await Promise.all([
    hotelsOf(visible),
    prisma.mybarRequest.findMany({
      where: { hotelId: { in: visible }, businessDate: day },
      select: { hotelId: true, status: true, seenAt: true, createdAt: true },
    }),
  ]);
  return {
    kind: "mybar",
    generatedAt,
    hourlyLabel: "Saat saat alınan talep",
    hotels: hotels.map((h) => {
      const mine = requests.filter((r) => r.hotelId === h.id);
      const hourly = emptyHours();
      for (const r of mine) hourly[hourOf(r.createdAt)]! += 1;
      const keys = mine.map((r) => (r.status === "BEKLEMEDE" ? (r.seenAt ? "ONAYLANDI" : "ONAY_BEKLIYOR") : r.status));
      return flowHotel(head(h), MYBAR_SEGMENTS, keys, { hourly });
    }),
  };
}

const TASK_SEGMENTS: readonly SegmentDef[] = [
  { key: "TAMAMLANDI", label: "Tamamlandı", tone: "done" },
  { key: "DEVAM", label: "Devam ediyor", tone: "progress" },
  { key: "BEKLIYOR", label: "Bekliyor", tone: "new" },
  { key: "DND_BEKLIYOR", label: "Rahatsız etmeyin", tone: "hold" },
  { key: "EKSIK", label: "Eksik", tone: "cancel" },
];

async function minibarTasksDetail(ctx: Ctx, scope: string[], generatedAt: string): Promise<LiveDetail> {
  const visible = await rowHotels(ctx, "minibarTasks", scope);
  const { day } = todayBounds();
  const [hotels, items] = await Promise.all([
    hotelsOf(visible),
    prisma.dailyTaskItem.findMany({
      where: { task: { date: day, hotelId: { in: visible } } },
      select: {
        status: true,
        checkedAt: true,
        task: { select: { hotelId: true } },
        room: { select: { floor: { select: { id: true, number: true, name: true } } } },
      },
    }),
  ]);
  return {
    kind: "minibarTasks",
    generatedAt,
    hourlyLabel: "Saat saat tamamlanan görev",
    hotels: hotels.map((h) => {
      const mine = items.filter((i) => i.task.hotelId === h.id);
      const hourly = emptyHours();
      const floors = new Map<string, FlowFloor>();
      for (const i of mine) {
        const done = i.status === "TAMAMLANDI";
        if (done && i.checkedAt) hourly[hourOf(i.checkedAt)]! += 1;
        const fl = i.room.floor;
        const f = floors.get(fl.id) ?? { floorId: fl.id, number: fl.number, name: fl.name, done: 0, total: 0 };
        f.total += 1;
        if (done) f.done += 1;
        floors.set(fl.id, f);
      }
      return flowHotel(head(h), TASK_SEGMENTS, mine.map((i) => i.status), {
        hourly,
        floors: [...floors.values()].sort((a, b) => b.number - a.number),
      });
    }),
  };
}

/** Breakdown behind one row of the "Anlık Durum" widget. */
export async function getLiveDetail(ctx: Ctx, kind: LiveDetailKind): Promise<LiveDetail> {
  const scope = await commandScope(ctx);
  const generatedAt = new Date().toISOString();
  switch (kind) {
    case "online":
      return onlineDetail(ctx, scope, generatedAt);
    case "occupancy":
      return occupancyDetail(ctx, scope, generatedAt);
    case "rooms":
      return roomsDetail(ctx, scope, generatedAt);
    case "roomService":
      return roomServiceDetail(ctx, scope, generatedAt);
    case "mybar":
      return mybarDetail(ctx, scope, generatedAt);
    case "minibarTasks":
      return minibarTasksDetail(ctx, scope, generatedAt);
  }
}
