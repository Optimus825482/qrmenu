import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { getSetting } from "@/lib/settings";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate, businessDay } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { notify } from "@/modules/core/server/notifications";
import {
  type GuestMeta,
  resolveGuestTokenLimited,
} from "@/modules/menu/server/guestToken";
import { approvals } from "../approvals";
import { orderNo } from "../orderNo";
import { orderLimiter, toGuestOrderView, type GuestOrderView } from "../guestOrder";
import { validateCartItems } from "../cart";
import { CLOSED_STATUSES } from "../transitions";
import { roomServiceState } from "./roomState";

const LOCALES = ["tr", "en", "de", "ru", "ar", "fr", "el", "it"] as const;

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

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

async function create(input: RoomOrderInput): Promise<GuestOrderView> {
  if (!orderLimiter.hit(input.ip).allowed) {
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
      roomService: { slaMinutes: state.slaMinutes, confirmRequired: state.confirmRequired },
    });
  }

  const state = await roomServiceState(target.room.id);
  if (!state.orderingOpen || !state.rsOutletId) {
    throw new DomainError("CONFLICT", "Şu an oda servisi siparişi alınmıyor");
  }

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

      let maxOpen = 3;
      try {
        const settingVal = await getSetting("rs.maxOpenPerRoom", state.hotelId);
        if (typeof settingVal === "number") maxOpen = settingVal;
      } catch {}

      if (openCount >= maxOpen) {
        throw new DomainError("CONFLICT", `Odanız için en fazla ${maxOpen} açık sipariş olabilir`);
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

      let finalStatus: string = created.status;
      if (state.confirmRequired) {
        await tx.order.update({
          where: { id: created.id },
          data: { status: "TEYIT_BEKLIYOR" },
        });
        await tx.orderEvent.create({
          data: {
            orderId: created.id,
            userId: null,
            from: "GONDERILDI",
            to: "TEYIT_BEKLIYOR",
            note: "TEYIT_GEREKLI",
            at: new Date(),
          },
        });
        await audit(tx, {
          hotelId: state.hotelId,
          action: "ORDER_TEYIT_BEKLIYOR",
          entity: "Order",
          entityId: created.id,
          before: { status: "GONDERILDI" },
          after: { status: "TEYIT_BEKLIYOR" },
        });
        finalStatus = "TEYIT_BEKLIYOR";
      }

      const orderForRecipients = {
        ...created,
        status: finalStatus as any,
      };

      await notify(
        {
          recipients: await approvals.recipientsFor(tx, orderForRecipients),
          type: "order.created",
          title: `Yeni oda servisi · Oda ${target.room.number}`,
          body: `#${created.orderNo} · ${created.items.length} kalem${state.confirmRequired ? " · teyit bekliyor" : ""}`,
          refType: "Order",
          refId: created.id,
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
            status: finalStatus,
          },
        },
        tx,
      );

      return toGuestOrderView(
        { ...created, status: finalStatus as any },
        {
          kind: "ODA_SERVISI",
          roomNumber: target.room.number,
          roomService: { slaMinutes: state.slaMinutes, confirmRequired: state.confirmRequired },
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
          roomService: { slaMinutes: state.slaMinutes, confirmRequired: state.confirmRequired },
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
    roomService: { slaMinutes: state.slaMinutes, confirmRequired: state.confirmRequired },
  });
}

async function guestCancel(
  token: string,
  orderId: string,
  meta: GuestMeta = { ip: "unknown", userAgent: "" },
): Promise<{ ok: true }> {
  if (!orderLimiter.hit(meta.ip).allowed) {
    throw new DomainError("RATE_LIMITED", "Çok fazla deneme, biraz sonra tekrar deneyin");
  }
  const target = await resolveRoom(token, meta);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
    if (rows.length === 0) throw new DomainError("NOT_FOUND", "Sipariş bulunamadı");

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        orderNo: true,
        roomId: true,
        hotelId: true,
        outletId: true,
        status: true,
      },
    });

    if (order.roomId !== target.room.id) {
      throw new DomainError("NOT_FOUND", "Sipariş bulunamadı");
    }

    if (order.status !== "GONDERILDI" && order.status !== "TEYIT_BEKLIYOR") {
      throw new DomainError("CONFLICT", "Sipariş zaten işlendi");
    }

    const now = new Date();
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "IPTAL",
        cancelledAt: now,
        rejectReason: "Misafir vazgeçti",
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        userId: null,
        from: order.status,
        to: "IPTAL",
        note: "Misafir vazgeçti",
        at: now,
      },
    });

    await audit(tx, {
      hotelId: order.hotelId,
      action: "ROOM_ORDER_GUEST_CANCEL",
      entity: "Order",
      entityId: order.id,
      before: { status: order.status },
      after: { status: "IPTAL", reason: "Misafir vazgeçti" },
    });

    await publish(
      {
        type: "order.cancelled",
        hotelId: order.hotelId,
        outletId: order.outletId,
        payload: {
          orderId: order.id,
          orderNo: order.orderNo,
          status: "IPTAL",
          cancelReason: "Misafir vazgeçti",
        },
      },
      tx,
    );

    return { ok: true as const };
  });
}

export const roomOrder = { create, get, guestCancel };
