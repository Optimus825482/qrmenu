import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDateStart, businessDay } from "@/lib/time";
import { outletAllowed } from "../approvals";
import { slaStart, slaStateOf } from "./slaConstants";

/** Rows per page of the delivered list (a busy day has a few hundred deliveries). */
export const DELIVERED_PAGE_SIZE = 50;

/** Screen of the delivery tab: whoever follows deliveries may look the delivered ones up. */
export const DELIVERED_SCREEN = "RO-TES";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day written 'yyyy-MM-dd'. */
const daySchema = z
  .string()
  .regex(DAY_RE)
  .refine((day) => {
    try {
      businessDay(day);
      return true;
    } catch {
      return false;
    }
  });

/** Room numbers are short labels ("1204", "A12"); nothing else is searched. */
const roomSchema = z
  .string()
  .trim()
  .max(12)
  .regex(/^[\p{L}\p{N} ._/-]*$/u);

const filterSchema = z.object({
  /** Business day (Europe/Nicosia) the orders were DELIVERED on; today when absent. */
  day: daySchema.optional(),
  /** Room number prefix. */
  room: roomSchema.optional(),
  page: z.number().int().min(1).max(10_000).default(1),
});

export type DeliveredFilter = z.input<typeof filterSchema>;

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * Filter of the page address (`?tarih=&oda=&sayfa=`). A shared or hand-edited link never breaks the page:
 * a value that does not validate falls back to its default (today, no room, first page).
 */
export function parseDeliveredQuery(
  query: { tarih?: string | string[]; oda?: string | string[]; sayfa?: string | string[] },
  now: Date = new Date(),
): { day: string; room: string; page: number } {
  const day = daySchema.safeParse(first(query.tarih));
  const room = roomSchema.safeParse(first(query.oda) ?? "");
  const page = z.coerce.number().int().min(1).max(10_000).safeParse(first(query.sayfa) ?? "1");
  return {
    day: day.success ? day.data : businessDate(now),
    room: room.success ? room.data : "",
    page: page.success ? page.data : 1,
  };
}

const nextDay = (day: string): string => new Date(businessDay(day).getTime() + 86_400_000).toISOString().slice(0, 10);

const ROW_SELECT = {
  id: true,
  orderNo: true,
  status: true,
  createdAt: true,
  deliveredAt: true,
  note: true,
  pricesShown: true,
  subtotal: true,
  currency: true,
  room: { select: { number: true } },
  deliveredBy: { select: { fullName: true } },
  items: { orderBy: { createdAt: "asc" as const }, select: { nameSnapshot: true, qty: true, note: true } },
} satisfies Prisma.OrderSelect;

export type DeliveredRow = {
  id: string;
  orderNo: number;
  roomNumber: string;
  createdAt: Date;
  deliveredAt: Date;
  /** Whole minutes from the SLA clock start (creation) to the delivery. */
  durationMin: number;
  /** Delivered in strictly less than the hotel's `rs.slaMinutes` (slaStateOf). */
  onTime: boolean;
  /** Staff member who marked the delivery; absent when unknown (account removed, old record). */
  deliveredBy?: string;
  /** Present only when prices were shown for this order (same rule as the board cards). */
  subtotal?: string;
  currency?: string;
  note?: string;
  items: { name: string; qty: number; note?: string }[];
};

export type DeliveredList = {
  day: string;
  room: string;
  page: number;
  pageSize: number;
  pageCount: number;
  /** Deliveries matching the filter (all pages). */
  total: number;
  slaMinutes: number;
  rows: DeliveredRow[];
};

/**
 * Delivered room-service orders of one outlet for one business day, newest delivery first. The day is the
 * day of the DELIVERY (`deliveredAt`, Europe/Nicosia): an order taken at 23:55 and delivered at 00:24 is
 * listed on the second day. RO-TES view in the outlet's hotel; outlet roles are bound to their session
 * outlet. Cross-hotel coverage reads open requests only (board.covered), so it gives nothing here.
 */
async function list(ctx: Ctx, outletId: string, raw: DeliveredFilter = {}): Promise<DeliveredList> {
  const parsed = filterSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("VALIDATION", "Geçersiz filtre");
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, hotelId: true, type: true },
  });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  await assertCan(ctx, DELIVERED_SCREEN, "V", outlet.hotelId);
  if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  if (outlet.type !== "ODA_SERVISI") throw new DomainError("NOT_FOUND", "Oda servisi outleti bulunamadı");

  const now = new Date();
  const day = parsed.data.day ?? businessDate(now);
  const room = parsed.data.room ?? "";
  const where: Prisma.OrderWhereInput = {
    outletId,
    hotelId: outlet.hotelId,
    kind: "ODA_SERVISI",
    status: "TESLIM_EDILDI",
    deliveredAt: { gte: businessDateStart(day), lt: businessDateStart(nextDay(day)) },
    ...(room ? { room: { number: { startsWith: room, mode: "insensitive" } } } : {}),
  };

  const [total, slaMinutes] = await Promise.all([
    prisma.order.count({ where }),
    getSetting("rs.slaMinutes", outlet.hotelId),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / DELIVERED_PAGE_SIZE));
  // A page past the end (a stale link after the filter narrowed) shows the last one.
  const page = Math.min(parsed.data.page, pageCount);
  const found = await prisma.order.findMany({
    where,
    orderBy: [{ deliveredAt: "desc" }, { orderNo: "desc" }, { id: "desc" }],
    skip: (page - 1) * DELIVERED_PAGE_SIZE,
    take: DELIVERED_PAGE_SIZE,
    select: ROW_SELECT,
  });

  const rows = found.flatMap((row): DeliveredRow[] => {
    if (!row.deliveredAt) return [];
    return [
      {
        id: row.id,
        orderNo: row.orderNo,
        roomNumber: row.room?.number ?? "—",
        createdAt: row.createdAt,
        deliveredAt: row.deliveredAt,
        durationMin: Math.max(0, Math.floor((row.deliveredAt.getTime() - slaStart(row).getTime()) / 60_000)),
        onTime: slaStateOf(row, now, slaMinutes) === "DONE_ON_TIME",
        ...(row.deliveredBy ? { deliveredBy: row.deliveredBy.fullName } : {}),
        ...(row.pricesShown && row.subtotal !== null ? { subtotal: row.subtotal.toFixed(2), currency: row.currency } : {}),
        ...(row.note ? { note: row.note } : {}),
        items: row.items.map((i) => ({ name: i.nameSnapshot, qty: i.qty, ...(i.note ? { note: i.note } : {}) })),
      },
    ];
  });

  return { day, room, page, pageSize: DELIVERED_PAGE_SIZE, pageCount, total, slaMinutes, rows };
}

export const delivered = { list };
