import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { createRateLimiter, scaledMax } from "@/lib/rate-limit";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate, businessDay } from "@/lib/time";
import { notify } from "@/modules/core/server/notifications";
import {
  type GuestMeta,
  resolveGuestTokenLimited,
} from "@/modules/menu/server/guestToken";
import { approvals } from "./approvals";
import { orderNo } from "./orderNo";
import { validateCartItems } from "./cart";

/** Guest orders: 10 per minute per IP. */
export const orderLimiter = createRateLimiter({ max: () => scaledMax(10), windowMs: 60_000 });

const LOCALES = ["tr", "en", "de", "ru", "ar", "fr", "el", "it", "pt"] as const;
const GUEST_REJECT_TEXT = "Siparişiniz işleme alınamadı. Ayrıntı için lütfen görevlimize danışın.";

/** Strips HTML tags and control characters (line breaks become spaces), then trims. */
function sanitize(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

const noteOf = (max: number) =>
  z
    .string()
    .transform(sanitize)
    .pipe(z.string().max(max, `En fazla ${max} karakter`))
    .optional();

const inputSchema = z.object({
  token: z.string().min(1).max(64),
  idempotencyKey: z.uuid("Geçersiz istek anahtarı"),
  locale: z.string().max(8).default("tr"),
  items: z
    .array(
      z.object({
        menuNodeId: z.string().min(1).max(64),
        qty: z.number().int("Adet tam sayı olmalı").min(1, "Adet en az 1").max(20, "Adet en fazla 20"),
        note: noteOf(200),
      }),
    )
    .min(1, "Hiç öğe seçilmedi")
    .max(50, "En fazla 50 kalem seçilebilir"),
  note: noteOf(500),
  ip: z.string().min(1),
  userAgent: z.string().default(""),
});

export type GuestOrderInput = z.input<typeof inputSchema>;

export type GuestOrderView = {
  orderId: string;
  orderNo: number;
  status: string;
  createdAt: Date;
  items: { name: string; qty: number; note?: string; unitPrice?: string; lineTotal?: string }[];
  subtotal?: string;
  currency: string;
  pricesShown: boolean;
  rejectReason?: string;
  tableLabel?: string;
  kind: "MASA" | "ODA_SERVISI";
  roomNumber?: string;
  roomService?: { slaMinutes: number; confirmRequired: boolean };
};

const VIEW_INCLUDE = {
  items: { orderBy: { createdAt: "asc" } },
  table: { select: { label: true } },
  room: { select: { number: true } },
} as const satisfies Prisma.OrderInclude;

type ViewOrder = Prisma.OrderGetPayload<{ include: typeof VIEW_INCLUDE }>;

const money = (d: Prisma.Decimal) => d.toDecimalPlaces(2).toFixed(2);

export function toGuestOrderView(order: ViewOrder, extra: Partial<GuestOrderView> = {}): GuestOrderView {
  return {
    orderId: order.id,
    orderNo: order.orderNo,
    status: order.status,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      name: item.nameSnapshot,
      qty: item.qty,
      ...(item.note ? { note: item.note } : {}),
      ...(order.pricesShown && item.unitPrice
        ? { unitPrice: money(item.unitPrice), lineTotal: money(item.unitPrice.mul(item.qty)) }
        : {}),
    })),
    ...(order.subtotal ? { subtotal: money(order.subtotal) } : {}),
    currency: order.currency,
    pricesShown: order.pricesShown,
    // The staff-entered reason is internal; guests only get a generic notice.
    ...(order.rejectReason ? { rejectReason: GUEST_REJECT_TEXT } : {}),
    tableLabel: order.table?.label ?? undefined,
    kind: (order.kind as "MASA" | "ODA_SERVISI") ?? "MASA",
    roomNumber: order.room?.number ?? undefined,
    ...extra,
  };
}

type NodeRow = {
  id: string;
  name: string;
  price: Prisma.Decimal | string | number | null;
  kind: string;
  is_active: boolean;
  is_available: boolean;
  outlet_id: string;
};

async function resolveTable(token: string, meta: GuestMeta) {
  const target = await resolveGuestTokenLimited(token, meta, undefined, undefined, { log: false });
  if (target.kind === "TABLE") return target;
  if (target.kind === "NONE" && target.reason === "RATE_LIMITED") {
    throw new DomainError("RATE_LIMITED", "Çok fazla deneme, biraz sonra tekrar deneyin");
  }
  throw new DomainError("NOT_FOUND", "Masa bulunamadı");
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

async function create(input: GuestOrderInput): Promise<GuestOrderView> {
  if (!(await orderLimiter.hit(input.ip)).allowed) {
    throw new DomainError("RATE_LIMITED", "Çok fazla sipariş denemesi, biraz sonra tekrar deneyin");
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const data = parsed.data;
  const locale = (LOCALES as readonly string[]).includes(data.locale) ? data.locale : "en";

  const target = await resolveTable(data.token, { ip: data.ip, userAgent: data.userAgent });

  const replay = await prisma.order.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    include: VIEW_INCLUDE,
  });
    if (replay) {
    if (replay.tableId !== target.table.id) {
      throw new DomainError("VALIDATION", "Geçersiz istek anahtarı", {
        fieldErrors: { idempotencyKey: ["Geçersiz istek anahtarı"] },
      });
    }
    return toGuestOrderView(replay);
  }
  const { state, table } = target;
  if (!state.orderingOpen) throw new DomainError("CONFLICT", "Şu an sipariş alınmıyor");

  try {
    return await prisma.$transaction(async (tx) => {
      const lines = await validateCartItems(tx, state.outletId, data.items, state.pricesShown);
      const subtotal = state.pricesShown
        ? lines.reduce(
            (sum, l) => (l.unitPrice ? sum.plus(l.unitPrice.mul(l.item.qty)) : sum),
            new Prisma.Decimal(0),
          )
        : null;

      const assignment = await tx.tableAssignment.findFirst({
        where: { tableId: table.id, isActive: true, user: { isActive: true } },
        orderBy: { createdAt: "desc" },
        select: { userId: true },
      });

      const day = businessDate();
      const no = await orderNo.next(tx, state.hotelId, day);
      const order = await tx.order.create({
        data: {
          hotelId: state.hotelId,
          outletId: state.outletId,
          kind: "MASA",
          tableId: table.id,
          businessDate: businessDay(day),
          orderNo: no,
          status: "GONDERILDI",
          guestLanguage: locale,
          pricesShown: state.pricesShown,
          currency: state.currency,
          subtotal: subtotal?.toDecimalPlaces(2) ?? null,
          note: data.note || null,
          assignedWaiterId: assignment?.userId ?? null,
          idempotencyKey: data.idempotencyKey,
          clientIp: data.ip,
          items: {
            create: lines.map((l) => ({
              menuNodeId: l.item.menuNodeId,
              nameSnapshot: l.row.name,
              qty: l.item.qty,
              unitPrice: l.unitPrice,
              note: l.item.note || null,
            })),
          },
          events: { create: [{ userId: null, from: null, to: "GONDERILDI" }] },
        },
        include: VIEW_INCLUDE,
      });

      await notify(
        {
          recipients: await approvals.recipientsFor(tx, order),
          type: "order.created",
          title: `Yeni sipariş · ${state.outletName} ${table.label}`,
          body: `#${order.orderNo} · ${order.items.length} kalem`,
          refType: "Order",
          refId: order.id,
        },
        tx,
      );
      await publish(
        {
          type: "order.created",
          hotelId: state.hotelId,
          outletId: state.outletId,
          payload: {
            orderId: order.id,
            orderNo: order.orderNo,
            tableId: table.id,
            tableLabel: table.label,
            status: order.status,
            from: null,
            kind: "MASA",
            assignedWaiterId: order.assignedWaiterId,
            byUserId: null,
          },
        },
        tx,
      );
      return toGuestOrderView(order);
    });
  } catch (error) {
    // Two requests with one idempotency key raced: the loser returns the winner's order.
    if (isUniqueViolation(error)) {
      const winner = await prisma.order.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: VIEW_INCLUDE,
      });
      if (winner && winner.tableId === table.id) return toGuestOrderView(winner);
    }
    throw error;
  }
}

/** The guest's order status page: only orders of the token's own table. */
async function get(token: string, orderId: string, meta: GuestMeta = { ip: "unknown", userAgent: "" }) {
  const { table } = await resolveTable(token, meta);
  const order = await prisma.order.findFirst({
    where: { id: orderId, tableId: table.id },
    include: VIEW_INCLUDE,
  });
  if (!order) throw new DomainError("NOT_FOUND", "Sipariş bulunamadı");
  return toGuestOrderView(order);
}

export const guestOrder = { create, get };
