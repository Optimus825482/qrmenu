import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { getSettings } from "@/lib/settings";
import { businessDate, businessDay } from "@/lib/time";
import { DEFAULT_ARRIVAL_TIME, DEFAULT_DEPARTURE_TIME } from "../constants";
import { stockStatus } from "../stockStatus";
import { dayRange } from "./dates";
import type { RoomCardData } from "./minibarTypes";
import type { RoomCheckBadge } from "./roomCheckService";
import { type TaskSummary as ItemSummary, taskSummary } from "./tasks";

/*
 * Floor attendant read models: the hotel plan (`katPlan`), one floor with per-room occupancy flags and
 * the day's check badge (`floorOccupancy`) and one room (`roomDetail`). Read-only; the hotel is the
 * session hotel (lists) or the floor's / room's hotel (entities, always inside `ctx.hotelIds`).
 * "Occupied" = an active room with a guest record whose arrivalDate <= day <= departureDate.
 * Nothing here returns a price.
 */

const SCREEN = "MB-KAT";
const pct1 = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10);

// ---------------------------------------------------------------- types

export type FloorSummary = {
  id: string;
  number: number;
  name: string;
  totalRooms: number;
  occupiedRooms: number;
  emptyRooms: number;
  /** 0-100, one decimal. */
  occupancyRate: number;
  arrivalCount: number;
  departureCount: number;
  checkedCount: number;
  dndCount: number;
  mybarCount: number;
};

export type KatPlan = {
  hotel: { id: string; name: string; code: string } | null;
  today: string;
  /** Old dashboard shape of the day's task items (kept for the current page). */
  taskSummary: {
    total: number;
    completed: number;
    pending: number;
    dnd: number;
    completionRate: number;
    clashCount: number;
  };
  tasks: ItemSummary;
  criticalStockCount: number;
  occupancy: {
    totalRooms: number;
    occupiedRooms: number;
    ratePct: number;
    arrivalsToday: number;
    departuresToday: number;
  };
  floors: FloorSummary[];
  activeMybarCount: number;
};

export type FloorFilter = "ALL" | "DOLU" | "BOS" | "GIRIS" | "CIKIS";

export type FloorRoomCard = RoomCardData & {
  /** The room has a guest arriving on the day / leaving on the day (both true = turnover). */
  arrival: boolean;
  departure: boolean;
  occupied: boolean;
  check: RoomCheckBadge;
};

export type FloorView = {
  /** `hotelName` is printed above the rooms: the floor decides the hotel, the page says which one it is. */
  floor: { id: string; number: number; name: string; hotelId: string; hotelName: string };
  today: string;
  filter: FloorFilter;
  rooms: FloorRoomCard[];
  stats: {
    total: number;
    occupied: number;
    empty: number;
    arrival: number;
    departure: number;
    completed: number;
    dnd: number;
    mybar: number;
  };
  settings?: {
    dndRecheckMinutes: number;
    requireQrForControl: boolean;
  };
};

// ---------------------------------------------------------------- shared

type GuestRow = {
  roomId: string;
  arrivalDate: Date;
  arrivalTime: string | null;
  departureDate: Date;
  departureTime: string | null;
};

type RoomFlags = {
  arrival: boolean;
  departure: boolean;
  occupied: boolean;
  arrivalTime: string | null;
  departureTime: string | null;
};

function flagsOf(records: GuestRow[], date: Date): RoomFlags {
  const t = date.getTime();
  const arr = records.find((g) => g.arrivalDate.getTime() === t);
  const dep = records.find((g) => g.departureDate.getTime() === t);
  return {
    arrival: Boolean(arr),
    departure: Boolean(dep),
    occupied: records.length > 0,
    arrivalTime: arr ? (arr.arrivalTime ?? DEFAULT_ARRIVAL_TIME) : null,
    departureTime: dep ? (dep.departureTime ?? DEFAULT_DEPARTURE_TIME) : null,
  };
}

function groupByRoom<T extends { roomId: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.roomId);
    if (list) list.push(r);
    else m.set(r.roomId, [r]);
  }
  return m;
}

const guestWhere = (date: Date) => ({ arrivalDate: { lte: date }, departureDate: { gte: date } });

// ---------------------------------------------------------------- hotel plan

/** The floor attendant's home: per-floor occupancy and check progress, task totals, critical stock count. */
export async function katPlan(ctx: Ctx, day: string = businessDate(), now: Date = new Date()): Promise<KatPlan> {
  void now;
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "V", hotelId);
  const date = businessDay(day);

  const [hotel, floors, guests, mybar, tasks, clashCount, stocks, items] = await Promise.all([
    prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, code: true } }),
    prisma.floor.findMany({
      where: { hotelId, isActive: true },
      select: { id: true, number: true, name: true, rooms: { where: { isActive: true }, select: { id: true } } },
      orderBy: { number: "asc" },
    }),
    prisma.guestRecord.findMany({
      where: { hotelId, room: { isActive: true }, ...guestWhere(date) },
      select: { roomId: true, arrivalDate: true, arrivalTime: true, departureDate: true, departureTime: true },
    }),
    prisma.mybarRequest.findMany({
      where: { hotelId, businessDate: date, status: "BEKLEMEDE" },
      select: { roomId: true },
    }),
    taskSummary(prisma, hotelId, day),
    prisma.dailyTaskItem.count({
      where: { task: { hotelId, date }, arrivalTime: { not: null }, departureTime: { not: null } },
    }),
    prisma.hotelStock.findMany({
      // Same products as the stock and critical lists (stockViews.loadRows).
      where: { hotelId, OR: [{ product: { isActive: true } }, { remainingQty: { gt: 0 } }] },
      select: { remainingQty: true, criticalLevel: true },
    }),
    prisma.dailyTaskItem.findMany({
      where: { task: { hotelId, date } },
      select: { roomId: true, status: true, dndCount: true },
    }),
  ]);

  const byRoom = groupByRoom(guests);
  const itemByRoom = new Map(items.map((i) => [i.roomId, i]));
  const mybarRooms = new Set(mybar.map((m) => m.roomId));

  let totalRooms = 0;
  let occupiedRooms = 0;
  let arrivalsToday = 0;
  let departuresToday = 0;
  const floorSummaries: FloorSummary[] = floors.map((f) => {
    let occupied = 0;
    let arrivals = 0;
    let departures = 0;
    let checked = 0;
    let dnd = 0;
    let mybarCount = 0;
    for (const r of f.rooms) {
      const fl = flagsOf(byRoom.get(r.id) ?? [], date);
      if (fl.occupied) occupied += 1;
      if (fl.arrival) arrivals += 1;
      if (fl.departure) departures += 1;
      const it = itemByRoom.get(r.id);
      if (it?.status === "TAMAMLANDI") checked += 1;
      else if (it && (it.status === "DND_BEKLIYOR" || it.dndCount > 0)) dnd += 1;
      if (mybarRooms.has(r.id)) mybarCount += 1;
    }
    totalRooms += f.rooms.length;
    occupiedRooms += occupied;
    arrivalsToday += arrivals;
    departuresToday += departures;
    return {
      id: f.id,
      number: f.number,
      name: f.name,
      totalRooms: f.rooms.length,
      occupiedRooms: occupied,
      emptyRooms: f.rooms.length - occupied,
      occupancyRate: pct1(occupied, f.rooms.length),
      arrivalCount: arrivals,
      departureCount: departures,
      checkedCount: checked,
      dndCount: dnd,
      mybarCount,
    };
  });

  return {
    hotel,
    today: date.toISOString(),
    taskSummary: {
      total: tasks.total,
      completed: tasks.completed,
      pending: tasks.waiting,
      dnd: tasks.dnd,
      completionRate: tasks.ratePct,
      clashCount,
    },
    tasks,
    criticalStockCount: stocks.filter((s) => stockStatus(s.remainingQty, s.criticalLevel) !== "NORMAL").length,
    occupancy: { totalRooms, occupiedRooms, ratePct: pct1(occupiedRooms, totalRooms), arrivalsToday, departuresToday },
    floors: floorSummaries,
    activeMybarCount: mybar.length,
  };
}

// ---------------------------------------------------------------- floor

const floorQuerySchema = z.strictObject({
  day: z.string().optional(),
  filter: z.enum(["ALL", "DOLU", "BOS", "GIRIS", "CIKIS"]).default("ALL"),
});

/**
 * One floor: every active room with its occupancy flags and the day's check badge. The badges are loaded
 * in bulk (the day's check transactions and the DND rows of the whole floor: two queries, none per room).
 */
export async function floorOccupancy(
  ctx: Ctx,
  floorId: string,
  q: { day?: string; filter?: FloorFilter } = {},
  now: Date = new Date(),
): Promise<FloorView> {
  const parsed = floorQuerySchema.safeParse(q);
  if (!parsed.success) throw fromZod(parsed.error);
  const day = parsed.data.day ?? businessDate(now);
  const date = businessDay(day);
  const filter = parsed.data.filter;

  const floor = await prisma.floor.findFirst({
    where: { id: floorId, hotelId: { in: ctx.hotelIds } },
    select: {
      id: true,
      number: true,
      name: true,
      hotelId: true,
      hotel: { select: { name: true } },
      rooms: {
        where: { isActive: true },
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          roomType: { select: { id: true, name: true } },
          mybarRequests: {
            where: { businessDate: date, status: "BEKLEMEDE" },
            select: {
              id: true,
              createdAt: true,
              note: true,
              items: { select: { requestedQty: true, product: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!floor) throw new DomainError("NOT_FOUND", "Kat bulunamadı");
  await assertCan(ctx, SCREEN, "V", floor.hotelId);

  const roomIds = floor.rooms.map((r) => r.id);
  const [guests, txs, dnds, settings] = await Promise.all([
    prisma.guestRecord.findMany({
      where: { roomId: { in: roomIds }, ...guestWhere(date) },
      select: { roomId: true, arrivalDate: true, arrivalTime: true, departureDate: true, departureTime: true },
    }),
    prisma.minibarTransaction.findMany({
      where: { roomId: { in: roomIds }, type: { in: ["SETUP_KONTROL", "SARFIYAT_YOK"] }, occurredAt: dayRange(day) },
      orderBy: { occurredAt: "desc" },
      select: { roomId: true, type: true, occurredAt: true },
    }),
    prisma.roomDnd.findMany({
      where: { roomId: { in: roomIds }, date },
      select: { roomId: true, status: true, count: true, lastAt: true },
    }),
    getSettings(["dnd.minChecks", "dnd.recheckMinutes", "minibar.requireQrForControl"], floor.hotelId),
  ]);
  const required = settings["dnd.minChecks"];
  const guestsBy = groupByRoom(guests);
  const lastTx = new Map<string, (typeof txs)[number]>();
  for (const t of txs) if (!lastTx.has(t.roomId)) lastTx.set(t.roomId, t);
  const dndBy = new Map(dnds.map((d) => [d.roomId, d]));

  const cards: FloorRoomCard[] = floor.rooms.map((room) => {
    const fl = flagsOf(guestsBy.get(room.id) ?? [], date);
    const tx = lastTx.get(room.id);
    const dnd = dndBy.get(room.id);
    let check: RoomCheckBadge = { kind: "BEKLIYOR" };
    if (tx) {
      check = { kind: tx.type === "SARFIYAT_YOK" ? "SARFIYAT_YOK" : "KONTROL_EDILDI", at: tx.occurredAt.toISOString() };
    } else if (dnd?.status === "TAMAMLANDI") {
      check = { kind: "KONTROL_EDILDI", at: dnd.lastAt.toISOString(), dndCount: dnd.count, required };
    } else if (dnd?.status === "AKTIF") {
      check = { kind: "DND", at: dnd.lastAt.toISOString(), dndCount: dnd.count, required };
    } else if (dnd?.status === "EKSIK") {
      check = { kind: "DND", at: dnd.lastAt.toISOString(), dndCount: dnd.count, required, incomplete: true };
    }

    let status: RoomCardData["status"] = "empty";
    let statusLabel = "Boş";
    if (fl.arrival && fl.departure) {
      status = "clash";
      statusLabel = "Çakışma (Çıkış + Giriş)";
    } else if (fl.arrival) {
      status = "arrival";
      statusLabel = "Giriş";
    } else if (fl.departure) {
      status = "departure";
      statusLabel = "Çıkış";
    } else if (fl.occupied) {
      status = "in_house";
      statusLabel = "Konaklama";
    }
    const mybar = room.mybarRequests[0];
    return {
      id: room.id,
      number: room.number,
      floorId: floor.id,
      floorName: floor.name,
      roomTypeId: room.roomType?.id ?? null,
      roomTypeName: room.roomType?.name ?? "Standart Oda",
      status,
      statusLabel,
      guestName: null,
      arrivalTime: fl.arrivalTime,
      departureTime: fl.departureTime,
      checkStatus: check.kind === "DND" ? "dnd" : check.kind === "BEKLIYOR" ? "pending" : "completed",
      lastCheckAt: check.at ?? null,
      dndCount: dnd?.count ?? 0,
      lastDndAt: dnd?.lastAt.toISOString() ?? null,
      hasMybarRequest: Boolean(mybar),
      mybarDetails: mybar
        ? {
            id: mybar.id,
            requestedAt: mybar.createdAt.toISOString(),
            items: mybar.items.map((i) => ({ productName: i.product.name, qty: i.requestedQty })),
            notes: mybar.note,
          }
        : null,
      arrival: fl.arrival,
      departure: fl.departure,
      occupied: fl.occupied,
      check,
    };
  });

  const keep = (c: FloorRoomCard): boolean =>
    filter === "ALL" ||
    (filter === "DOLU" && c.occupied) ||
    (filter === "BOS" && !c.occupied) ||
    (filter === "GIRIS" && c.arrival) ||
    (filter === "CIKIS" && c.departure);

  return {
    floor: { id: floor.id, number: floor.number, name: floor.name, hotelId: floor.hotelId, hotelName: floor.hotel.name },
    today: date.toISOString(),
    filter,
    rooms: cards.filter(keep),
    stats: {
      total: cards.length,
      occupied: cards.filter((c) => c.occupied).length,
      empty: cards.filter((c) => !c.occupied).length,
      arrival: cards.filter((c) => c.arrival).length,
      departure: cards.filter((c) => c.departure).length,
      completed: cards.filter((c) => c.checkStatus === "completed").length,
      dnd: cards.filter((c) => c.checkStatus === "dnd").length,
      mybar: cards.filter((c) => c.hasMybarRequest).length,
    },
    settings: {
      dndRecheckMinutes: settings["dnd.recheckMinutes"],
      requireQrForControl: settings["minibar.requireQrForControl"],
    },
  };
}

// ---------------------------------------------------------------- room

export type RoomDetail = {
  room: { id: string; number: string; floorId: string; floorName: string; roomTypeName: string };
  current: {
    arrivalDate: string;
    arrivalTime: string | null;
    departureDate: string;
    departureTime: string | null;
    guestCount: number;
  } | null;
  upcoming: { arrivalDate: string; arrivalTime: string | null; departureDate: string; guestCount: number }[];
  recent: {
    id: string;
    type: string;
    occurredAt: string;
    note: string | null;
    items: { productId: string; productName: string; added: number; consumed: number }[];
  }[];
};

/** Read-only room card: the current guest, the next arrivals and the last 10 records (no prices). */
export async function roomDetail(ctx: Ctx, roomId: string, now: Date = new Date()): Promise<RoomDetail> {
  const room = await prisma.room.findFirst({
    where: { id: roomId, hotelId: { in: ctx.hotelIds } },
    select: {
      id: true,
      hotelId: true,
      number: true,
      floor: { select: { id: true, name: true } },
      roomType: { select: { name: true } },
    },
  });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  await assertCan(ctx, SCREEN, "V", room.hotelId);
  const date = businessDay(businessDate(now));

  const [current, upcoming, recent] = await Promise.all([
    prisma.guestRecord.findFirst({ where: { roomId, ...guestWhere(date) }, orderBy: { createdAt: "desc" } }),
    prisma.guestRecord.findMany({ where: { roomId, arrivalDate: { gt: date } }, orderBy: { arrivalDate: "asc" }, take: 5 }),
    prisma.minibarTransaction.findMany({
      where: { roomId },
      orderBy: { occurredAt: "desc" },
      take: 10,
      select: {
        id: true,
        type: true,
        occurredAt: true,
        note: true,
        items: { select: { productId: true, added: true, consumed: true, product: { select: { name: true } } } },
      },
    }),
  ]);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    room: {
      id: room.id,
      number: room.number,
      floorId: room.floor.id,
      floorName: room.floor.name,
      roomTypeName: room.roomType?.name ?? "Standart Oda",
    },
    current: current
      ? {
          arrivalDate: iso(current.arrivalDate),
          arrivalTime: current.arrivalTime,
          departureDate: iso(current.departureDate),
          departureTime: current.departureTime,
          guestCount: current.guestCount,
        }
      : null,
    upcoming: upcoming.map((g) => ({
      arrivalDate: iso(g.arrivalDate),
      arrivalTime: g.arrivalTime,
      departureDate: iso(g.departureDate),
      guestCount: g.guestCount,
    })),
    recent: recent.map((t) => ({
      id: t.id,
      type: t.type,
      occurredAt: t.occurredAt.toISOString(),
      note: t.note,
      items: t.items.map((i) => ({
        productId: i.productId,
        productName: i.product.name,
        added: i.added,
        consumed: i.consumed,
      })),
    })),
  };
}
