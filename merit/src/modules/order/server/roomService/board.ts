import type { OrderStatus, Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDay } from "@/lib/time";
import { outletAllowed } from "../approvals";
import type { CoverageMode } from "./coverage";
import { coveredModes } from "./coverageAccess";
import { occupancyHint, type OccupancyStatus } from "./occupancy";
import { slaDue, slaStart, slaStateOf } from "./sla";
import { staffNote } from "@/modules/order/server/noteTranslation";

export type RoomBoardColumn = "NEW" | "PREP" | "READY" | "ONWAY";

export type RoomOrderCard = {
  id: string;
  orderNo: number;
  roomId: string;
  roomNumber: string;
  extension?: string;
  status: OrderStatus;
  createdAt: Date;
  slaStartAt: Date;
  slaDueAt: Date;
  slaState: "OK" | "WARN" | "BREACH";
  items: { name: string; qty: number; note?: string; noteOriginal?: string }[];
  /** Turkish for staff; `noteOriginal` (with `noteLang`) carries the guest's own words when it was translated. */
  note?: string;
  noteOriginal?: string;
  noteLang?: string;
  guestLanguage: string;
  occupancy: OccupancyStatus;
  /** Present only when prices were shown for this order. */
  subtotal?: string;
  currency?: string;
};

/** A delivered order of today: read-only on the board. */
export type RoomDeliveredCard = {
  id: string;
  orderNo: number;
  roomNumber: string;
  deliveredAt: Date;
  items: { name: string; qty: number }[];
};

/** How many of today's delivered orders the board carries (newest first). */
export const DELIVERED_LIMIT = 20;

export type RoomBoard = {
  columns: Record<RoomBoardColumn, RoomOrderCard[]>;
  /** Today's delivered orders, newest first, at most `DELIVERED_LIMIT`. */
  delivered?: RoomDeliveredCard[];
  kpis: { open: number; overdue: number; today: number; avgDeliverySec?: number };
  orderingEnabled: boolean;
  /** Server clock (ISO) at read time: clients derive their clock offset from it for the SLA countdown. */
  serverNow: string;
};

const COLUMN_OF: Partial<Record<OrderStatus, RoomBoardColumn>> = {
  GONDERILDI: "NEW",
  ONAYLANDI: "PREP",
  HAZIR: "READY",
  YOLDA: "ONWAY",
};
const OPEN_STATUSES = Object.keys(COLUMN_OF) as OrderStatus[];

/** Fields of an open order a board card is built from. */
const CARD_SELECT = {
  id: true,
  orderNo: true,
  roomId: true,
  status: true,
  createdAt: true,
  deliveredAt: true,
  note: true,
  noteTr: true,
  noteSrcLang: true,
  guestLanguage: true,
  pricesShown: true,
  subtotal: true,
  currency: true,
  room: { select: { number: true, extension: true } },
  items: { orderBy: { createdAt: "asc" as const }, select: { nameSnapshot: true, qty: true, note: true, noteTr: true } },
} satisfies Prisma.OrderSelect;

type CardRow = Prisma.OrderGetPayload<{ select: typeof CARD_SELECT }>;

/** One open order as a board card; `null` for a row that has no column or no room. */
function toCard(
  row: CardRow,
  now: Date,
  slaMinutes: number,
  occupancy: Map<string, OccupancyStatus>,
): { card: RoomOrderCard; column: RoomBoardColumn; breached: boolean } | null {
  const column = COLUMN_OF[row.status];
  if (!column || !row.roomId) return null;
  const state = slaStateOf(row, now, slaMinutes);
  const card: RoomOrderCard = {
    id: row.id,
    orderNo: row.orderNo,
    roomId: row.roomId,
    roomNumber: row.room?.number ?? "—",
    ...(row.room?.extension ? { extension: row.room.extension } : {}),
    status: row.status,
    createdAt: row.createdAt,
    slaStartAt: slaStart(row),
    slaDueAt: slaDue(row, slaMinutes),
    slaState: state === "WARN" || state === "BREACH" ? state : "OK",
    items: row.items.map((i) => ({ name: i.nameSnapshot, qty: i.qty, ...staffNote(i) })),
    ...staffNote(row),
    guestLanguage: row.guestLanguage,
    occupancy: occupancy.get(row.roomId) ?? "BILINMIYOR",
    ...(row.pricesShown && row.subtotal !== null
      ? { subtotal: row.subtotal.toFixed(2), currency: row.currency }
      : {}),
  };
  return { card, column, breached: state === "BREACH" };
}

const bySla = (a: RoomOrderCard, b: RoomOrderCard) => a.slaDueAt.getTime() - b.slaDueAt.getTime() || a.orderNo - b.orderNo;

/**
 * Room-service staff board of one outlet: four open-order columns (most urgent SLA first) and the
 * day's KPIs. RO-TAL view in the outlet's hotel; outlet roles are bound to their session outlet.
 */
async function get(ctx: Ctx, outletId: string): Promise<RoomBoard> {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, hotelId: true, type: true, orderingEnabled: true },
  });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  await assertCan(ctx, "RO-TAL", "V", outlet.hotelId);
  if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  if (outlet.type !== "ODA_SERVISI") throw new DomainError("NOT_FOUND", "Oda servisi outleti bulunamadı");

  const now = new Date();
  const today = businessDay(businessDate(now));
  const slaMinutes = await getSetting("rs.slaMinutes", outlet.hotelId);

  const select = CARD_SELECT;
  const [openRows, todayRows, deliveredRows] = await Promise.all([
    prisma.order.findMany({
      where: { outletId, kind: "ODA_SERVISI", status: { in: OPEN_STATUSES } },
      select,
    }),
    prisma.order.findMany({
      where: { outletId, kind: "ODA_SERVISI", businessDate: today },
      select: { status: true, createdAt: true, deliveredAt: true },
    }),
    prisma.order.findMany({
      where: { outletId, kind: "ODA_SERVISI", businessDate: today, status: "TESLIM_EDILDI", deliveredAt: { not: null } },
      orderBy: [{ deliveredAt: "desc" }, { orderNo: "desc" }],
      take: DELIVERED_LIMIT,
      select: {
        id: true,
        orderNo: true,
        deliveredAt: true,
        room: { select: { number: true } },
        items: { orderBy: { createdAt: "asc" as const }, select: { nameSnapshot: true, qty: true } },
      },
    }),
  ]);

  const roomIds = [...new Set(openRows.flatMap((r) => (r.roomId ? [r.roomId] : [])))];
  const occupancy = await occupancyHint(outlet.hotelId, roomIds, today);

  const columns: RoomBoard["columns"] = { NEW: [], PREP: [], READY: [], ONWAY: [] };
  let overdue = 0;
  for (const row of openRows) {
    const built = toCard(row, now, slaMinutes, occupancy);
    if (!built) continue;
    if (built.breached) overdue += 1;
    columns[built.column].push(built.card);
  }
  for (const list of Object.values(columns)) {
    list.sort(bySla);
  }

  const durations = todayRows
    .filter((r) => r.status === "TESLIM_EDILDI" && r.deliveredAt)
    .map((r) => (r.deliveredAt!.getTime() - slaStart(r).getTime()) / 1000);
  const avgDeliverySec = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : undefined;

  return {
    columns,
    delivered: deliveredRows.map((row) => ({
      id: row.id,
      orderNo: row.orderNo,
      roomNumber: row.room?.number ?? "—",
      deliveredAt: row.deliveredAt!,
      items: row.items.map((i) => ({ name: i.nameSnapshot, qty: i.qty })),
    })),
    kpis: {
      open: Object.values(columns).reduce((n, l) => n + l.length, 0),
      overdue,
      today: todayRows.length,
      ...(avgDeliverySec !== undefined ? { avgDeliverySec } : {}),
    },
    orderingEnabled: outlet.orderingEnabled,
    serverNow: now.toISOString(),
  };
}

/** Open requests of one covered hotel (cross-hotel coverage, roomService/coverage.ts). */
export type CoveredHotelBoard = {
  hotelId: string;
  hotelName: string;
  hotelCode: string;
  /** The hotel's room-service outlet (events of the covered hotel carry this id). */
  outletId: string;
  mode: CoverageMode;
  /** ISLEME: the caller may move these requests with their own (home) rights. IZLEME: read-only. */
  canProcess: boolean;
  /** Open requests, most urgent SLA first, each with its board column. */
  cards: { card: RoomOrderCard; column: RoomBoardColumn }[];
};

export type CoveredBoard = { hotels: CoveredHotelBoard[]; serverNow: string };

/**
 * Open room-service requests of every hotel the caller covers right now. Needs RO-TAL view in the caller's
 * own session hotel (the same right their own board needs) and an active grant per hotel; a caller without
 * any active grant gets an empty list. Nothing but the open requests of the covered hotels is read: no KPIs,
 * no delivered history, no switches.
 */
async function covered(ctx: Ctx): Promise<CoveredBoard> {
  await assertCan(ctx, "RO-TAL", "V", ctx.session.hotelId);
  const now = new Date();
  const modes = await coveredModes(ctx, now);
  if (modes.size === 0) return { hotels: [], serverNow: now.toISOString() };

  const today = businessDay(businessDate(now));
  const outlets = await prisma.outlet.findMany({
    where: { hotelId: { in: [...modes.keys()] }, type: "ODA_SERVISI", hotel: { isActive: true } },
    orderBy: [{ hotel: { name: "asc" } }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      hotelId: true,
      hotel: { select: { name: true, code: true } },
    },
  });

  const hotels: CoveredHotelBoard[] = [];
  for (const outlet of outlets) {
    const mode = modes.get(outlet.hotelId);
    if (!mode) continue;
    const [rows, slaMinutes] = await Promise.all([
      prisma.order.findMany({
        where: { outletId: outlet.id, hotelId: outlet.hotelId, kind: "ODA_SERVISI", status: { in: OPEN_STATUSES } },
        select: CARD_SELECT,
      }),
      getSetting("rs.slaMinutes", outlet.hotelId),
    ]);
    const roomIds = [...new Set(rows.flatMap((r) => (r.roomId ? [r.roomId] : [])))];
    const occupancy = await occupancyHint(outlet.hotelId, roomIds, today);
    const cards = rows
      .flatMap((row) => {
        const built = toCard(row, now, slaMinutes, occupancy);
        return built ? [{ card: built.card, column: built.column }] : [];
      })
      .sort((a, b) => bySla(a.card, b.card));
    hotels.push({
      hotelId: outlet.hotelId,
      hotelName: outlet.hotel.name,
      hotelCode: outlet.hotel.code,
      outletId: outlet.id,
      mode,
      canProcess: mode === "ISLEME",
      cards,
    });
  }
  return { hotels, serverNow: now.toISOString() };
}

export const board = { get, covered };
