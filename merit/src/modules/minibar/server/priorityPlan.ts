import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import type { TaskStatus, TaskType } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDay, TZ } from "@/lib/time";
import {
  ARRIVAL_LEAD_MINUTES,
  CLASH_CRITICAL_MINUTES,
  DEFAULT_ARRIVAL_TIME,
  DEFAULT_DEPARTURE_TIME,
  DEPARTURE_LAG_MINUTES,
} from "../constants";
import { nicosiaInstant } from "./dates";

/*
 * Advisory work order of the day's open task items. `computePriorityPlan` is pure (no clock, no
 * database); `loadPriorityPlan` feeds it from the session hotel. One entry per ROOM: a room with
 * several open items (e.g. IN_HOUSE + DEPARTURE of a departing room) appears once, ranked by its
 * most urgent item, because one room check completes all of them.
 */

const SCREEN = "MB-KAT";
const OPEN: readonly TaskStatus[] = ["BEKLIYOR", "DEVAM", "DND_BEKLIYOR"];
const MINUTE = 60_000;

export type PlanItemInput = {
  itemId: string;
  roomId: string;
  roomNumber: string;
  floorNumber: number;
  floorName: string;
  type: TaskType;
  status: TaskStatus;
  arrivalTime?: string | null;
  departureTime?: string | null;
  dndLastAt?: Date | null;
  dndCount: number;
};

export type PlanEntry = {
  seq: number;
  itemId: string;
  roomId: string;
  roomNumber: string;
  floorNumber: number;
  floorName?: string;
  rank: 1 | 2 | 3 | 4 | 5;
  targetAt?: Date;
  remainingMin?: number;
  overdue: boolean;
  label: string;
  clash?: { departure: string; arrival: string; gapMin: number; critical: boolean };
  isCritical?: boolean;
};

export type PlanFloor = { floorNumber: number; name: string; count: number; critical: number; firstSeq: number };

export type PriorityPlan = {
  entries: PlanEntry[];
  floors: PlanFloor[];
  summary: { total: number; critical: number; normal: number; clashes: number };
  briefing: string[];
  requireQrForControl?: boolean;
};

type Candidate = PlanEntry & { floorName: string; isCritical: boolean };

const hhmm = (at: Date): string => formatInTimeZone(at, TZ, "HH:mm");
const minutesOf = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const normTime = (time: string): string => {
  const [h, m] = time.split(":");
  return `${h.padStart(2, "0")}:${m.slice(0, 2)}`;
};
const natural = (a: string, b: string): number => a.localeCompare(b, "tr", { numeric: true });

function withTarget(
  base: Omit<Candidate, "targetAt" | "remainingMin" | "overdue">,
  target: Date | null,
  now: Date,
): Candidate {
  if (!target) return { ...base, overdue: false };
  const diff = Math.floor((target.getTime() - now.getTime()) / MINUTE);
  return { ...base, targetAt: target, remainingMin: Math.max(0, diff), overdue: target.getTime() < now.getTime() };
}

/** The room's entry from its open items: first matching rule wins (clash, DND, arrival, departure, rest). */
function entryForRoom(items: PlanItemInput[], day: string, recheckMinutes: number, now: Date): Candidate {
  const departure = items.find((i) => i.type === "DEPARTURE_KONTROL");
  const arrival = items.find((i) => i.type === "ARRIVAL_KONTROL");
  const lead = items[0];
  const common = {
    roomId: lead.roomId,
    roomNumber: lead.roomNumber,
    floorNumber: lead.floorNumber,
    floorName: lead.floorName,
    seq: 0,
  };

  if (departure && arrival) {
    const dep = normTime(departure.departureTime || DEFAULT_DEPARTURE_TIME);
    const arr = normTime(arrival.arrivalTime || DEFAULT_ARRIVAL_TIME);
    const gapMin = minutesOf(arr) - minutesOf(dep);
    const critical = gapMin < CLASH_CRITICAL_MINUTES;
    return withTarget(
      {
        ...common,
        itemId: departure.itemId,
        rank: 1,
        label: `Çakışma! Çıkış ${dep}, Giriş ${arr} (${gapMin} dk)`,
        clash: { departure: dep, arrival: arr, gapMin, critical },
        isCritical: critical,
      },
      nicosiaInstant(day, dep),
      now,
    );
  }

  const dnd = items.find((i) => i.status === "DND_BEKLIYOR");
  if (dnd) {
    const target = dnd.dndLastAt ? new Date(dnd.dndLastAt.getTime() + recheckMinutes * MINUTE) : null;
    return withTarget(
      {
        ...common,
        itemId: dnd.itemId,
        rank: 5,
        label: target ? `DND (${dnd.dndCount}x) — Tekrar: ${hhmm(target)}` : `DND (${dnd.dndCount}x)`,
        isCritical: false,
      },
      target,
      now,
    );
  }

  const arrTimed = items.find((i) => i.type === "ARRIVAL_KONTROL" && i.arrivalTime && nicosiaInstant(day, i.arrivalTime));
  if (arrTimed) {
    const time = normTime(arrTimed.arrivalTime!);
    const at = nicosiaInstant(day, time)!;
    return withTarget(
      {
        ...common,
        itemId: arrTimed.itemId,
        rank: 2,
        label: `Arrival — Varış ${time} (${ARRIVAL_LEAD_MINUTES} dk önce hazır)`,
        isCritical: true,
      },
      new Date(at.getTime() - ARRIVAL_LEAD_MINUTES * MINUTE),
      now,
    );
  }

  const depTimed = items.find(
    (i) => i.type === "DEPARTURE_KONTROL" && i.departureTime && nicosiaInstant(day, i.departureTime),
  );
  if (depTimed) {
    const time = normTime(depTimed.departureTime!);
    const at = nicosiaInstant(day, time)!;
    return withTarget(
      {
        ...common,
        itemId: depTimed.itemId,
        rank: 3,
        label: `Departure — Çıkış ${time} (1 saat içinde kontrol)`,
        isCritical: false,
      },
      new Date(at.getTime() + DEPARTURE_LAG_MINUTES * MINUTE),
      now,
    );
  }

  const inHouse = items.find((i) => i.type === "INHOUSE_KONTROL");
  return withTarget(
    {
      ...common,
      itemId: (inHouse ?? lead).itemId,
      rank: 4,
      label: inHouse ? "In House — Günlük kontrol" : "Kontrol görevi",
      isCritical: false,
    },
    null,
    now,
  );
}

/** Pure: the ordered work plan. Only open items count; ordering is (rank, remaining minutes, floor, room no). */
export function computePriorityPlan(input: {
  now: Date;
  day: string;
  recheckMinutes: number;
  items: PlanItemInput[];
}): PriorityPlan {
  const byRoom = new Map<string, PlanItemInput[]>();
  for (const item of input.items) {
    if (!OPEN.includes(item.status)) continue;
    const list = byRoom.get(item.roomId);
    if (list) list.push(item);
    else byRoom.set(item.roomId, [item]);
  }

  const candidates = [...byRoom.values()].map((items) =>
    entryForRoom(items, input.day, input.recheckMinutes, input.now),
  );
  candidates.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.remainingMin ?? 9999) - (b.remainingMin ?? 9999) ||
      a.floorNumber - b.floorNumber ||
      natural(a.roomNumber, b.roomNumber),
  );

  const entries: PlanEntry[] = [];
  const floors = new Map<number, PlanFloor>();
  let critical = 0;
  let clashes = 0;
  candidates.forEach((c, index) => {
    const seq = index + 1;
    const { floorName, isCritical, ...entry } = c;
    entries.push({ ...entry, floorName: c.floorName, isCritical: c.isCritical, seq });
    if (c.rank === 1) clashes += 1;
    if (isCritical) critical += 1;
    const floor = floors.get(c.floorNumber) ?? {
      floorNumber: c.floorNumber,
      name: floorName,
      count: 0,
      critical: 0,
      firstSeq: seq,
    };
    floor.count += 1;
    if (isCritical) floor.critical += 1;
    floors.set(c.floorNumber, floor);
  });

  const floorList = [...floors.values()].sort((a, b) => a.firstSeq - b.firstSeq);
  const total = entries.length;
  const briefing: string[] = [];
  if (total === 0) {
    briefing.push("Bugün için bekleyen görev bulunmuyor.");
  } else {
    briefing.push(`Toplam ${total} görev bekliyor.`);
    if (clashes > 0) briefing.push(`${clashes} odada Departure-Arrival çakışması var!`);
    if (critical > 0) briefing.push(`${critical} kritik öncelikli görev mevcut.`);
    briefing.push(`Önerilen başlangıç: Kat ${entries[0].floorNumber} — Oda ${entries[0].roomNumber}`);
    if (floorList.length > 1) {
      briefing.push(`Önerilen kat sırası: ${floorList.map((f) => `Kat ${f.floorNumber}`).join(" → ")}`);
    }
  }

  return { entries, floors: floorList, summary: { total, critical, normal: total - critical, clashes }, briefing };
}

const loadSchema = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı").optional(),
    hotelId: z.string().optional(),
  })
  .strict();

export type HotelPlanSummary = {
  hotelId: string;
  hotelName: string;
  hotelCode: string;
  requireQrForControl: boolean;
  plan: PriorityPlan;
};

export type ExtendedPriorityPlan = PriorityPlan & {
  requireQrForControl?: boolean;
  multiHotels?: HotelPlanSummary[];
  hotels?: Array<{ id: string; name: string; code: string }>;
  selectedHotelId?: string;
};

/** Priority plan of the open task items (supports single hotel, multi-hotel for system admin, default: today). */
export async function loadPriorityPlan(
  ctx: Ctx,
  q: z.input<typeof loadSchema> = {},
  now: Date = new Date(),
): Promise<ExtendedPriorityPlan> {
  const parsed = loadSchema.safeParse(q);
  if (!parsed.success) throw fromZod(parsed.error);
  const requestedHotelId = parsed.data.hotelId;
  const isSuper = ctx.user.roleKind === "SISTEM";
  const day = parsed.data.day ?? businessDate(now);
  let date: Date;
  try {
    date = businessDay(day);
  } catch {
    throw new DomainError("VALIDATION", "Geçersiz tarih");
  }

  // Get all hotels the user can access
  const availableHotels = await prisma.hotel.findMany({
    where: { isActive: true, ...(isSuper ? {} : { id: { in: ctx.hotelIds } }) },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  const isMulti = requestedHotelId === "ALL" || (!requestedHotelId && isSuper && availableHotels.length > 1);

  if (isMulti) {
    // Multi-hotel mode: load priority plan for all 3 hotels
    const multiHotels: HotelPlanSummary[] = await Promise.all(
      availableHotels.map(async (h) => {
        const [recheckMinutes, requireQrForControl] = await Promise.all([
          getSetting("dnd.recheckMinutes", h.id),
          getSetting("minibar.requireQrForControl", h.id),
        ]);
        const rows = await prisma.dailyTaskItem.findMany({
          where: { status: { in: [...OPEN] }, task: { hotelId: h.id, date }, room: { hotelId: h.id } },
          select: {
            id: true,
            roomId: true,
            status: true,
            arrivalTime: true,
            departureTime: true,
            lastDndAt: true,
            dndCount: true,
            task: { select: { type: true } },
            room: { select: { number: true, floor: { select: { number: true, name: true } } } },
          },
          orderBy: { id: "asc" },
        });
        const plan = computePriorityPlan({
          now,
          day,
          recheckMinutes,
          items: rows.map((r) => ({
            itemId: r.id,
            roomId: r.roomId,
            roomNumber: r.room.number,
            floorNumber: r.room.floor.number,
            floorName: r.room.floor.name,
            type: r.task.type,
            status: r.status,
            arrivalTime: r.arrivalTime,
            departureTime: r.departureTime,
            dndLastAt: r.lastDndAt,
            dndCount: r.dndCount,
          })),
        });
        return {
          hotelId: h.id,
          hotelName: h.name,
          hotelCode: h.code,
          requireQrForControl: Boolean(requireQrForControl),
          plan,
        };
      }),
    );

    const allHotelItems = multiHotels.flatMap((h) =>
      h.plan.entries.map((e) => ({
        ...e,
        floorName: `${h.hotelName} · ${e.floorName ?? `Kat ${e.floorNumber}`}`,
        label: `${e.label} (${h.hotelCode})`,
      })),
    );
    const total = allHotelItems.length;
    const critical = multiHotels.reduce((sum, h) => sum + h.plan.summary.critical, 0);
    const clashes = multiHotels.reduce((sum, h) => sum + h.plan.summary.clashes, 0);
    const briefing: string[] = [
      `Tüm Oteller Özeti: Toplam ${total} görev bekliyor (${clashes} çakışma, ${critical} kritik).`,
      ...multiHotels.map(
        (h) => `${h.hotelName}: ${h.plan.summary.total} görev (${h.plan.summary.clashes} çakışma, ${h.plan.summary.critical} kritik)`,
      ),
    ];

    const allFloors = multiHotels.flatMap((h) =>
      h.plan.floors.map((f) => ({
        ...f,
        name: `${h.hotelCode} · ${f.name}`,
      })),
    );

    return {
      entries: allHotelItems,
      floors: allFloors,
      summary: { total, critical, normal: total - critical, clashes },
      briefing,
      multiHotels,
      hotels: availableHotels,
      selectedHotelId: "ALL",
      requireQrForControl: multiHotels.some((h) => h.requireQrForControl),
    };
  }

  // Single hotel mode
  const targetHotelId =
    requestedHotelId && availableHotels.some((h) => h.id === requestedHotelId)
      ? requestedHotelId
      : ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "V", targetHotelId);

  const [recheckMinutes, requireQrForControl] = await Promise.all([
    getSetting("dnd.recheckMinutes", targetHotelId),
    getSetting("minibar.requireQrForControl", targetHotelId),
  ]);
  const rows = await prisma.dailyTaskItem.findMany({
    where: { status: { in: [...OPEN] }, task: { hotelId: targetHotelId, date }, room: { hotelId: targetHotelId } },
    select: {
      id: true,
      roomId: true,
      status: true,
      arrivalTime: true,
      departureTime: true,
      lastDndAt: true,
      dndCount: true,
      task: { select: { type: true } },
      room: { select: { number: true, floor: { select: { number: true, name: true } } } },
    },
    orderBy: { id: "asc" },
  });
  const plan = computePriorityPlan({
    now,
    day,
    recheckMinutes,
    items: rows.map((r) => ({
      itemId: r.id,
      roomId: r.roomId,
      roomNumber: r.room.number,
      floorNumber: r.room.floor.number,
      floorName: r.room.floor.name,
      type: r.task.type,
      status: r.status,
      arrivalTime: r.arrivalTime,
      departureTime: r.departureTime,
      dndLastAt: r.lastDndAt,
      dndCount: r.dndCount,
    })),
  });
  return {
    ...plan,
    hotels: availableHotels,
    selectedHotelId: targetHotelId,
    requireQrForControl: Boolean(requireQrForControl),
  };
}
