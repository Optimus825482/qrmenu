import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDateStart, businessDay } from "@/lib/time";
import { outletAllowed } from "../approvals";
import { coveredMode, coveredModes } from "./coverageAccess";
import { slaStart, slaStateOf } from "./slaConstants";
import { staffNote } from "@/modules/order/server/noteTranslation";

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

/** Hotel codes are short labels ("ROYAL"); the page checks the value against the hotels it may list. */
const hotelCodeSchema = z.string().trim().regex(/^[\p{L}\p{N}_-]{1,32}$/u);

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * Filter of the page address (`?tarih=&oda=&sayfa=&otel=`). A shared or hand-edited link never breaks the page:
 * a value that does not validate falls back to its default (today, no room, first page, the session hotel).
 * `hotel` is only a well-formed code here: whether it may be listed is decided by `pickDeliveredTarget`.
 */
export function parseDeliveredQuery(
  query: { tarih?: string | string[]; oda?: string | string[]; sayfa?: string | string[]; otel?: string | string[] },
  now: Date = new Date(),
): { day: string; room: string; page: number; hotel: string } {
  const day = daySchema.safeParse(first(query.tarih));
  const room = roomSchema.safeParse(first(query.oda) ?? "");
  const page = z.coerce.number().int().min(1).max(10_000).safeParse(first(query.sayfa) ?? "1");
  const hotel = hotelCodeSchema.safeParse(first(query.otel));
  return {
    day: day.success ? day.data : businessDate(now),
    room: room.success ? room.data : "",
    page: page.success ? page.data : 1,
    hotel: hotel.success ? hotel.data : "",
  };
}

/** A hotel whose delivered orders the session may list, with its room-service outlet. */
export type DeliveredTarget = {
  hotelId: string;
  hotelCode: string;
  hotelName: string;
  outletId: string;
  /** Reached through cross-hotel coverage (not the session hotel). */
  covered: boolean;
};

/**
 * Hotels the delivered list can be opened for: the session hotel (`home`, null when it has no room-service
 * outlet) and the hotels the caller covers right now, by name. The covered ones follow the covered board
 * (board.covered): RO-TAL view in the session hotel and an active grant of either mode (coveredModes).
 */
async function targets(ctx: Ctx, now: Date = new Date()): Promise<{ home: DeliveredTarget | null; covered: DeliveredTarget[] }> {
  const select = { id: true, hotelId: true, hotel: { select: { name: true, code: true } } } as const;
  const toTarget = (
    o: { id: string; hotelId: string; hotel: { name: string; code: string } },
    covered: boolean,
  ): DeliveredTarget => ({ hotelId: o.hotelId, hotelCode: o.hotel.code, hotelName: o.hotel.name, outletId: o.id, covered });

  const homeOutlet = ctx.session.hotelId
    ? await prisma.outlet.findFirst({ where: { hotelId: ctx.session.hotelId, type: "ODA_SERVISI" }, select })
    : null;
  const home = homeOutlet ? toTarget(homeOutlet, false) : null;

  if (!(await can(ctx, "RO-TAL", "V", ctx.session.hotelId))) return { home, covered: [] };
  const modes = await coveredModes(ctx, now);
  if (modes.size === 0) return { home, covered: [] };
  const outlets = await prisma.outlet.findMany({
    where: { hotelId: { in: [...modes.keys()] }, type: "ODA_SERVISI", hotel: { isActive: true } },
    orderBy: [{ hotel: { name: "asc" } }, { createdAt: "asc" }, { id: "asc" }],
    select,
  });
  // One room-service outlet per hotel is the rule; should two exist, the first one stands for the hotel.
  const seen = new Set<string>();
  const covered = outlets.filter((o) => !seen.has(o.hotelId) && seen.add(o.hotelId)).map((o) => toTarget(o, true));
  return { home, covered };
}

/** The target `?otel=` names among the allowed ones; anything else (unknown, not covered, empty) is the session hotel. */
export function pickDeliveredTarget(
  allowed: { home: DeliveredTarget | null; covered: DeliveredTarget[] },
  hotelCode: string,
): DeliveredTarget | null {
  return allowed.covered.find((t) => t.hotelCode === hotelCode) ?? allowed.home;
}

const nextDay = (day: string): string => new Date(businessDay(day).getTime() + 86_400_000).toISOString().slice(0, 10);

const ROW_SELECT = {
  id: true,
  orderNo: true,
  status: true,
  createdAt: true,
  deliveredAt: true,
  note: true,
  noteTr: true,
  noteSrcLang: true,
  pricesShown: true,
  subtotal: true,
  currency: true,
  room: { select: { number: true } },
  deliveredBy: { select: { fullName: true } },
  items: { orderBy: { createdAt: "asc" as const }, select: { nameSnapshot: true, qty: true, note: true, noteTr: true } },
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
  noteOriginal?: string;
  noteLang?: string;
  items: { name: string; qty: number; note?: string; noteOriginal?: string }[];
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
 * listed on the second day.
 *
 * A hotel of the session scope: RO-TES view there; outlet roles are bound to their session outlet.
 * A hotel outside it: only through cross-hotel coverage, with what the covered board asks of the grantee
 * (board.covered): RO-TAL view in the session hotel and a grant that works now (coveredMode: not revoked,
 * started, not ended, home desk open to the session). Either mode will do: the list is read-only.
 */
async function list(ctx: Ctx, outletId: string, raw: DeliveredFilter = {}): Promise<DeliveredList> {
  const parsed = filterSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("VALIDATION", "Geçersiz filtre");
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, hotelId: true, type: true },
  });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  const now = new Date();
  if (ctx.hotelIds.includes(outlet.hotelId)) {
    await assertCan(ctx, DELIVERED_SCREEN, "V", outlet.hotelId);
    if (!outletAllowed(ctx, outletId)) throw new DomainError("FORBIDDEN", "Bu outlete erişiminiz yok");
  } else {
    const allowed = (await can(ctx, "RO-TAL", "V", ctx.session.hotelId)) && (await coveredMode(ctx, outlet.hotelId, now)) !== null;
    // Fails for a hotel outside the scope: the denied attempt is audited like any other.
    if (!allowed) await assertCan(ctx, DELIVERED_SCREEN, "V", outlet.hotelId);
  }
  if (outlet.type !== "ODA_SERVISI") throw new DomainError("NOT_FOUND", "Oda servisi outleti bulunamadı");

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
        ...staffNote(row),
        items: row.items.map((i) => ({ name: i.nameSnapshot, qty: i.qty, ...staffNote(i) })),
      },
    ];
  });

  return { day, room, page, pageSize: DELIVERED_PAGE_SIZE, pageCount, total, slaMinutes, rows };
}

export const delivered = { list, targets };
