import type { OrderStatus } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDay } from "@/lib/time";
import { outletAllowed } from "../approvals";
import { occupancyHint, type OccupancyStatus } from "./occupancy";
import { slaDue, slaStart, slaStateOf } from "./sla";

export type RoomBoardColumn = "CONFIRM" | "NEW" | "PREP" | "READY" | "ONWAY";

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
  items: { name: string; qty: number; note?: string }[];
  note?: string;
  guestLanguage: string;
  occupancy: OccupancyStatus;
  /** Present only when prices were shown for this order. */
  subtotal?: string;
  currency?: string;
};

export type RoomBoard = {
  columns: Record<RoomBoardColumn, RoomOrderCard[]>;
  kpis: { open: number; overdue: number; today: number; avgDeliverySec?: number };
  orderingEnabled: boolean;
  confirmRequired: boolean;
};

const COLUMN_OF: Partial<Record<OrderStatus, RoomBoardColumn>> = {
  TEYIT_BEKLIYOR: "CONFIRM",
  GONDERILDI: "NEW",
  ONAYLANDI: "PREP",
  HAZIR: "READY",
  YOLDA: "ONWAY",
};
const OPEN_STATUSES = Object.keys(COLUMN_OF) as OrderStatus[];

/**
 * Room-service staff board of one outlet: five open-order columns (most urgent SLA first) and the
 * day's KPIs. RO-TAL view in the outlet's hotel; outlet roles are bound to their session outlet.
 */
async function get(ctx: Ctx, outletId: string): Promise<RoomBoard> {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, hotelId: true, type: true, orderingEnabled: true, phoneConfirmRequired: true },
  });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  await assertCan(ctx, "RO-TAL", "V", outlet.hotelId);
  if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  if (outlet.type !== "ODA_SERVISI") throw new DomainError("NOT_FOUND", "Oda servisi outleti bulunamadı");

  const now = new Date();
  const today = businessDay(businessDate(now));
  const slaMinutes = await getSetting("rs.slaMinutes", outlet.hotelId);

  const select = {
    id: true,
    orderNo: true,
    roomId: true,
    status: true,
    createdAt: true,
    phoneConfirmedAt: true,
    deliveredAt: true,
    note: true,
    guestLanguage: true,
    pricesShown: true,
    subtotal: true,
    currency: true,
    room: { select: { number: true, extension: true } },
    items: { orderBy: { createdAt: "asc" as const }, select: { nameSnapshot: true, qty: true, note: true } },
  };
  const [openRows, todayRows] = await Promise.all([
    prisma.order.findMany({
      where: { outletId, kind: "ODA_SERVISI", status: { in: OPEN_STATUSES } },
      select,
    }),
    prisma.order.findMany({
      where: { outletId, kind: "ODA_SERVISI", businessDate: today },
      select: { status: true, createdAt: true, phoneConfirmedAt: true, deliveredAt: true },
    }),
  ]);

  const roomIds = [...new Set(openRows.flatMap((r) => (r.roomId ? [r.roomId] : [])))];
  const occupancy = await occupancyHint(outlet.hotelId, roomIds, today);

  const columns: RoomBoard["columns"] = { CONFIRM: [], NEW: [], PREP: [], READY: [], ONWAY: [] };
  let overdue = 0;
  for (const row of openRows) {
    const col = COLUMN_OF[row.status];
    if (!col || !row.roomId) continue;
    const state = slaStateOf(row, now, slaMinutes);
    if (state === "BREACH") overdue += 1;
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
      items: row.items.map((i) => ({ name: i.nameSnapshot, qty: i.qty, ...(i.note ? { note: i.note } : {}) })),
      ...(row.note ? { note: row.note } : {}),
      guestLanguage: row.guestLanguage,
      occupancy: occupancy.get(row.roomId) ?? "BILINMIYOR",
      ...(row.pricesShown && row.subtotal !== null
        ? { subtotal: row.subtotal.toFixed(2), currency: row.currency }
        : {}),
    };
    columns[col].push(card);
  }
  for (const list of Object.values(columns)) {
    list.sort((a, b) => a.slaDueAt.getTime() - b.slaDueAt.getTime() || a.orderNo - b.orderNo);
  }

  const durations = todayRows
    .filter((r) => r.status === "TESLIM_EDILDI" && r.deliveredAt)
    .map((r) => (r.deliveredAt!.getTime() - slaStart(r).getTime()) / 1000);
  const avgDeliverySec = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : undefined;

  return {
    columns,
    kpis: {
      open: Object.values(columns).reduce((n, l) => n + l.length, 0),
      overdue,
      today: todayRows.length,
      ...(avgDeliverySec !== undefined ? { avgDeliverySec } : {}),
    },
    orderingEnabled: outlet.orderingEnabled,
    confirmRequired: outlet.phoneConfirmRequired,
  };
}

export const board = { get };
