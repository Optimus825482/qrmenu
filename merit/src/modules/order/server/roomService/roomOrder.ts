import { z } from "zod";
import { Prisma, type OrderStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { createRateLimiter, scaledMax } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate, businessDay } from "@/lib/time";
import { notify } from "@/modules/core/server/notifications";
import {
  type GuestMeta,
  resolveGuestTokenLimited,
} from "@/modules/menu/server/guestToken";
import { approvals } from "../approvals";
import { orderNo } from "../orderNo";
import { toGuestOrderView, type GuestOrderView } from "../guestOrder";
import { validateCartItems } from "../cart";
import { CLOSED_STATUSES } from "../transitions";
import { roomServiceState } from "./roomState";

const LOCALES = ["tr", "en", "de", "ru", "ar", "fr", "el", "it", "pt"] as const;
const roomOrderLimiter = createRateLimiter({ max: () => scaledMax(10), windowMs: 60_000 });

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

const roomInputSchema = z.object({
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

export type RoomOrderInput = z.input<typeof roomInputSchema>;

const VIEW_INCLUDE = {
  items: { orderBy: { createdAt: "asc" } },
  room: { select: { number: true } },
  table: { select: { label: true } },
} as const satisfies Prisma.OrderInclude;

async function resolveRoom(token: string, meta: GuestMeta) {
  const target = await resolveGuestTokenLimited(token, meta, undefined, undefined, { log: false });
  if (target.kind === "ROOM") {
    const room = await prisma.room.findUnique({
      where: { id: target.roomId },
      select: { id: true, number: true },
    });
    if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
    return { ...target, room };
  }
  if (target.kind === "NONE" && target.reason === "RATE_LIMITED") {
    throw new DomainError("RATE_LIMITED", "Çok fazla deneme, biraz sonra tekrar deneyin");
  }
  throw new DomainError("NOT_FOUND", "Oda bulunamadı");
}

/** An order staff cancelled or rejected does not start the wait before the room's next order. */
const WAIT_EXEMPT_STATUSES = ["IPTAL", "REDDEDILDI"] as const satisfies readonly OrderStatus[];

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

async function create(input: RoomOrderInput): Promise<GuestOrderView> {
  if (!(await roomOrderLimiter.hit(input.ip)).allowed) {
    throw new DomainError("RATE_LIMITED", "Çok fazla sipariş denemesi, biraz sonra tekrar deneyin");
  }

  const parsed = roomInputSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const data = parsed.data;
  const locale = (LOCALES as readonly string[]).includes(data.locale) ? data.locale : "tr";

  const target = await resolveRoom(data.token, { ip: data.ip, userAgent: data.userAgent });

  // Replay check
  const replay = await prisma.order.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    include: VIEW_INCLUDE,
  });
  if (replay) {
    if (replay.roomId !== target.room.id) {
      throw new DomainError("VALIDATION", "Geçersiz istek anahtarı", {
        fieldErrors: { idempotencyKey: ["Geçersiz istek anahtarı"] },
      });
    }
    const state = await roomServiceState(target.room.id);
    return toGuestOrderView(replay, {
      kind: "ODA_SERVISI",
      roomNumber: target.room.number,
      roomService: { slaMinutes: state.slaMinutes },
    });
  }

  const state = await roomServiceState(target.room.id);
  if (!state.orderingOpen || !state.rsOutletId) {
    throw new DomainError("CONFLICT", "Şu an oda servisi siparişi alınmıyor");
  }
  const limits = await getSettings(["rs.maxOpenPerRoom", "rs.minMinutesBetweenOrders"], state.hotelId);
  const maxOpen = limits["rs.maxOpenPerRoom"];
  const waitMinutes = limits["rs.minMinutesBetweenOrders"];

  try {
    return await prisma.$transaction(async (tx) => {
      // Row lock on room to serialize order creation per room
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${target.room.id} FOR UPDATE`;

      // Check max open orders per room
      const openCount = await tx.order.count({
        where: {
          roomId: target.room.id,
          status: { notIn: [...CLOSED_STATUSES] },
        },
      });

      if (openCount >= maxOpen) {
        // `limit` tells the guest page this is the open-order limit, not "ordering is closed".
        const message = `Odanız için en fazla ${maxOpen} açık sipariş olabilir`;
        throw new DomainError("CONFLICT", message, { fieldErrors: { limit: [message] } });
      }

      // Wait between two orders of the room (0 = off), counted from the latest order staff did not cancel or
      // reject. Same room lock as the check above, so two requests cannot both pass.
      if (waitMinutes > 0) {
        const latest = await tx.order.findFirst({
          where: {
            roomId: target.room.id,
            kind: "ODA_SERVISI",
            status: { notIn: [...WAIT_EXEMPT_STATUSES] },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        const remainingMs = latest ? latest.createdAt.getTime() + waitMinutes * 60_000 - Date.now() : 0;
        if (remainingMs > 0) {
          const remainingSeconds = Math.ceil(remainingMs / 1000);
          const message = `Yeni sipariş için ${Math.ceil(remainingSeconds / 60)} dakika sonra tekrar deneyebilirsiniz`;
          // `cooldown` (seconds left) tells the guest page this is the wait between orders.
          throw new DomainError("CONFLICT", message, { fieldErrors: { cooldown: [String(remainingSeconds)] } });
        }
      }

      // Validate selected items
      const lines = await validateCartItems(tx, state.rsOutletId!, data.items, state.pricesShown);
      const subtotal = state.pricesShown
        ? lines.reduce(
            (sum, l) => (l.unitPrice ? sum.plus(l.unitPrice.mul(l.item.qty)) : sum),
            new Prisma.Decimal(0),
          )
        : null;

      const day = businessDate();
      const no = await orderNo.next(tx, state.hotelId, day);

      const created = await tx.order.create({
        data: {
          hotelId: state.hotelId,
          outletId: state.rsOutletId!,
          kind: "ODA_SERVISI",
          roomId: target.room.id,
          tableId: null,
          businessDate: businessDay(day),
          orderNo: no,
          status: "GONDERILDI",
          guestLanguage: locale,
          pricesShown: state.pricesShown,
          currency: state.currency,
          subtotal: subtotal?.toDecimalPlaces(2) ?? null,
          note: data.note || null,
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
          recipients: await approvals.recipientsFor(tx, created),
          type: "order.created",
          title: `Yeni oda servisi · Oda ${target.room.number}`,
          body: `#${created.orderNo} · ${created.items.length} kalem`,
          refType: "Order",
          refId: created.id,
          // Nobody signed in at the outlet (night shift): the hotel manager and system administrator still hear of it.
          fallbackHotelId: state.hotelId,
        },
        tx,
      );

      await publish(
        {
          type: "order.created",
          hotelId: state.hotelId,
          outletId: state.rsOutletId!,
          payload: {
            orderId: created.id,
            orderNo: created.orderNo,
            roomId: target.room.id,
            roomNumber: target.room.number,
            status: created.status,
            from: null,
            kind: "ODA_SERVISI",
            byUserId: null,
          },
        },
        tx,
      );

      return toGuestOrderView(
        created,
        {
          kind: "ODA_SERVISI",
          roomNumber: target.room.number,
          roomService: { slaMinutes: state.slaMinutes },
        },
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await prisma.order.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: VIEW_INCLUDE,
      });
      if (winner && winner.roomId === target.room.id) {
        return toGuestOrderView(winner, {
          kind: "ODA_SERVISI",
          roomNumber: target.room.number,
          roomService: { slaMinutes: state.slaMinutes },
        });
      }
    }
    throw error;
  }
}

async function get(
  token: string,
  orderId: string,
  meta: GuestMeta = { ip: "unknown", userAgent: "" },
): Promise<GuestOrderView> {
  const target = await resolveRoom(token, meta);
  const order = await prisma.order.findFirst({
    where: { id: orderId, roomId: target.room.id },
    include: VIEW_INCLUDE,
  });
  if (!order) throw new DomainError("NOT_FOUND", "Sipariş bulunamadı");
  const state = await roomServiceState(target.room.id);
  return toGuestOrderView(order, {
    kind: "ODA_SERVISI",
    roomNumber: target.room.number,
    roomService: { slaMinutes: state.slaMinutes },
  });
}

// A guest cannot cancel a room order: they are asked to call Room Service from the room phone, and staff
// cancel it with a written reason (orders.transition -> IPTAL).
export const roomOrder = { create, get };
