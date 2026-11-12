import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CorrectionRequestStatus } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { notify } from "@/modules/core/server/notifications";
import { lockRow } from "./minibarCommon";
import { STOCK_MANAGER_ROLES, isStockManager } from "./pool";
import { withProductOrder } from "./productOrder";
import { addedToday, capacityByProduct, loadRoomChecklist } from "./roomChecklist";
import { bookReplacementTx } from "./roomCheckService";

/*
 * Manuel kayıt talebi: when the QR code of a room cannot be read, the floor attendant cannot open the room check.
 * Instead they pick the floor and the room, enter what they replaced, explain why, and send it to the minibar
 * system manager (Minibar Yönetimi / system administrator). Nothing touches the room or the hotel stock until a
 * manager approves; the approval books the same record a scanned room check would (`bookReplacementTx`), owned
 * by the attendant and dated when the request was sent (not when it was approved). Every request is notified to the managers and stays reportable whatever its outcome.
 */

const SCREEN = "MB-TUK";
const id = z.string().min(1).max(64);
const REASON_MSG = "Açıklama en az 10 karakter olmalıdır (QR kodu neden okutulamadı?)";

const createSchema = z
  .strictObject({
    roomId: id,
    reason: z.string().trim().min(10, REASON_MSG).max(500, "Açıklama en fazla 500 karakter olabilir"),
    items: z
      .array(z.strictObject({ productId: id, qty: z.number().int().min(1, "Adet en az 1 olmalı").max(999) }))
      .min(1, "En az bir ürün için tüketim girin")
      .max(50),
  })
  .superRefine((value, c) => {
    const seen = new Set<string>();
    for (const [index, item] of value.items.entries()) {
      if (seen.has(item.productId)) {
        c.addIssue({ code: "custom", path: ["items", index, "productId"], message: "Aynı ürün birden fazla satırda olamaz" });
      }
      seen.add(item.productId);
    }
  });

const decisionSchema = z.strictObject({
  requestId: id,
  approved: z.boolean(),
  rejectReason: z.string().trim().max(500).optional(),
});

type StoredItem = { productId: string; setupId: string; qty: number };

export type ManualEntryRow = {
  id: string;
  hotelName: string;
  roomNumber: string;
  floorName: string;
  reason: string;
  status: CorrectionRequestStatus;
  requestedById: string;
  requestedByName: string;
  decidedByName: string | null;
  rejectReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
  totalQty: number;
  items: { productId: string; productName: string; qty: number }[];
  /** Closed by its own sender (not a manager's rejection). */
  cancelled: boolean;
  /** The viewer may still cancel it: their own, waiting, sent today. */
  canCancel: boolean;
};

/** A request closed by its sender is stored as REDDEDILDI decided by the sender, with this reason. */
export const CANCEL_REASON = "Talebi gönderen iptal etti";

export type ManualEntryLine = { productId: string; name: string; groupName: string; unit: string; max: number };

function storedItems(value: unknown): StoredItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is StoredItem =>
      !!item &&
      typeof (item as StoredItem).productId === "string" &&
      typeof (item as StoredItem).setupId === "string" &&
      Number.isInteger((item as StoredItem).qty),
  );
}

/** Floors and rooms of the session hotel the attendant may ask a manual record for. */
export async function manualEntryRooms(
  ctx: Ctx,
): Promise<{ hotelId: string; floors: { id: string; name: string; rooms: { id: string; number: string }[] }[] }> {
  const hotelId = ctx.session.hotelId;
  await assertCan(ctx, SCREEN, "O", hotelId);
  const floors = await prisma.floor.findMany({
    where: { hotelId, isActive: true },
    orderBy: { number: "asc" },
    select: {
      id: true,
      name: true,
      rooms: { where: { isActive: true }, orderBy: { number: "asc" }, select: { id: true, number: true } },
    },
  });
  return { hotelId, floors: floors.filter((floor) => floor.rooms.length > 0) };
}

async function roomOf(ctx: Ctx, roomId: string) {
  const room = await prisma.room.findFirst({
    where: { id: roomId, hotelId: { in: ctx.hotelIds } },
    select: { id: true, hotelId: true, number: true, floorId: true },
  });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  return room;
}

/** Products of the room's minibar with what may still be added today (setup quantity minus today's additions). */
export async function manualEntryLines(ctx: Ctx, roomId: string, now: Date = new Date()): Promise<ManualEntryLine[]> {
  const room = await roomOf(ctx, roomId);
  await assertCan(ctx, SCREEN, "O", room.hotelId);
  const checklist = await withProductOrder(ctx.user.id, await loadRoomChecklist(prisma, room.id));
  const caps = capacityByProduct(checklist);
  const done = await addedToday(prisma, room.id, businessDate(now));
  const lines = new Map<string, ManualEntryLine>();
  for (const setup of checklist.setups) {
    for (const item of setup.items) {
      if (lines.has(item.productId)) continue;
      const max = Math.max(0, (caps.get(item.productId) ?? 0) - (done.get(item.productId) ?? 0));
      lines.set(item.productId, { productId: item.productId, name: item.name, groupName: item.groupName, unit: item.unit, max });
    }
  }
  return [...lines.values()];
}

/** The attendant sends the consumption of a room whose QR could not be read to the managers for approval. */
export async function createManualEntryRequest(ctx: Ctx, input: unknown, now: Date = new Date()): Promise<{ id: string; message: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const { roomId, reason, items } = parsed.data;
  const room = await roomOf(ctx, roomId);
  await assertCan(ctx, SCREEN, "O", room.hotelId);

  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "rooms", room.id);
    const pending = await tx.minibarManualEntryRequest.findFirst({
      where: { roomId: room.id, status: "BEKLIYOR" },
      select: { id: true },
    });
    if (pending) throw new DomainError("CONFLICT", `Oda ${room.number} için onay bekleyen bir manuel kayıt talebi zaten var`);

    const checklist = await loadRoomChecklist(tx, room.id);
    const caps = capacityByProduct(checklist);
    const done = await addedToday(tx, room.id, businessDate(now));
    const stored: StoredItem[] = items.map((item) => {
      const setup = checklist.setups.find((s) => s.items.some((i) => i.productId === item.productId));
      if (!setup) {
        throw new DomainError("VALIDATION", "Ürün bu odanın minibarında bulunmuyor", { fieldErrors: { productId: [item.productId] } });
      }
      const capacity = caps.get(item.productId) ?? 0;
      const added = done.get(item.productId) ?? 0;
      if (added + item.qty > capacity) {
        const name = setup.items.find((i) => i.productId === item.productId)?.name ?? "Ürün";
        throw new DomainError("DAILY_LIMIT", `${name}: en fazla ${Math.max(0, capacity - added)} adet girilebilir (setup ${capacity}, bugün eklenen ${added})`);
      }
      return { productId: item.productId, setupId: setup.setupId, qty: item.qty };
    });

    const request = await tx.minibarManualEntryRequest.create({
      // `createdAt` is the moment of the consumption: the approval books the record on this day.
      data: { hotelId: room.hotelId, roomId: room.id, requestedById: ctx.user.id, reason, items: stored, createdAt: now },
      select: { id: true },
    });
    const totalQty = stored.reduce((sum, item) => sum + item.qty, 0);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: room.hotelId,
      action: "MINIBAR_MANUAL_REQUEST_CREATE",
      entity: "MinibarManualEntryRequest",
      entityId: request.id,
      after: { roomNumber: room.number, reason, items: stored },
    });
    await notify(
      {
        recipients: { hotelId: room.hotelId, roleCodes: [...STOCK_MANAGER_ROLES] },
        fallbackHotelId: room.hotelId,
        type: "minibar.manual.created",
        title: `Manuel kayıt talebi · Oda ${room.number}`,
        body: `${ctx.user.fullName}: ${totalQty} adet tüketim onayınızı bekliyor. ${reason}`.slice(0, 300),
        refType: "MinibarManualEntryRequest",
        refId: request.id,
      },
      tx,
    );
    return { id: request.id, message: `Oda ${room.number} için manuel kayıt talebi onaya gönderildi.` };
  });
}

/**
 * Managers see the requests of their hotels (waiting ones first); everybody else sees their own.
 * `take` newest rows.
 */
export async function listManualEntryRequests(ctx: Ctx, take = 60, now: Date = new Date()): Promise<ManualEntryRow[]> {
  const manager = isStockManager(ctx);
  const today = businessDate(now);
  const rows = await prisma.minibarManualEntryRequest.findMany({
    where: manager ? { hotelId: { in: ctx.hotelIds } } : { requestedById: ctx.user.id },
    orderBy: [{ createdAt: "desc" }],
    take,
    include: {
      hotel: { select: { name: true } },
      room: { select: { number: true, floor: { select: { name: true } } } },
      requestedBy: { select: { fullName: true } },
      decidedBy: { select: { fullName: true } },
    },
  });
  const productIds = [...new Set(rows.flatMap((row) => storedItems(row.items).map((item) => item.productId)))];
  const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
  const nameOf = new Map(products.map((product) => [product.id, product.name]));
  const mapped = rows.map((row): ManualEntryRow => {
    const items = storedItems(row.items).map((item) => ({
      productId: item.productId,
      productName: nameOf.get(item.productId) ?? "Ürün",
      qty: item.qty,
    }));
    return {
      id: row.id,
      hotelName: row.hotel.name,
      roomNumber: row.room.number,
      floorName: row.room.floor?.name ?? "-",
      reason: row.reason,
      status: row.status,
      requestedById: row.requestedById,
      requestedByName: row.requestedBy.fullName,
      decidedByName: row.decidedBy?.fullName ?? null,
      rejectReason: row.rejectReason,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      totalQty: items.reduce((sum, item) => sum + item.qty, 0),
      items,
      cancelled: row.status === "REDDEDILDI" && row.decidedById === row.requestedById,
      canCancel: row.status === "BEKLIYOR" && row.requestedById === ctx.user.id && businessDate(row.createdAt) === today,
    };
  });
  return [...mapped.filter((row) => row.status === "BEKLIYOR"), ...mapped.filter((row) => row.status !== "BEKLIYOR")];
}

/**
 * A minibar system manager approves or rejects a request of one of their hotels (never their own). Approval
 * books the consumption to the room in the same transaction; when it cannot be booked (setup limit, stock),
 * the error is shown and the request stays waiting.
 */
export async function resolveManualEntryRequest(ctx: Ctx, input: unknown, now: Date = new Date()): Promise<{ message: string }> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const { requestId, approved, rejectReason } = parsed.data;
  if (!isStockManager(ctx)) {
    throw new DomainError("FORBIDDEN", "Manuel kayıt taleplerini yalnızca minibar operasyonları sistem sorumlusu karara bağlayabilir");
  }
  const known = await prisma.minibarManualEntryRequest.findFirst({
    where: { id: requestId, hotelId: { in: ctx.hotelIds } },
    select: { hotelId: true, roomId: true },
  });
  if (!known) throw new DomainError("NOT_FOUND", "Manuel kayıt talebi bulunamadı");
  await assertCan(ctx, SCREEN, "V", known.hotelId);

  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "rooms", known.roomId);
    await lockRow(tx, "minibar_manual_entry_requests", requestId);
    const request = await tx.minibarManualEntryRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { room: { select: { id: true, hotelId: true, number: true, floorId: true } } },
    });
    if (request.status !== "BEKLIYOR") throw new DomainError("CONFLICT", "Bu talep daha önce karara bağlanmış");
    if (request.requestedById === ctx.user.id) {
      throw new DomainError("FORBIDDEN", "Kendi oluşturduğunuz talebi karara bağlayamazsınız");
    }
    const room = request.room;

    if (!approved) {
      const reason = rejectReason || "Yönetici tarafından onaylanmadı.";
      await tx.minibarManualEntryRequest.update({
        where: { id: request.id },
        data: { status: "REDDEDILDI", decidedById: ctx.user.id, rejectReason: reason, resolvedAt: now },
      });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId: request.hotelId,
        action: "MINIBAR_MANUAL_REQUEST_REJECT",
        entity: "MinibarManualEntryRequest",
        entityId: request.id,
        before: { status: "BEKLIYOR" },
        after: { status: "REDDEDILDI", roomNumber: room.number, rejectReason: reason },
      });
      await notify(
        {
          recipients: [request.requestedById],
          type: "minibar.manual.resolved",
          title: `Manuel kayıt talebi reddedildi · Oda ${room.number}`,
          body: reason.slice(0, 300),
          refType: "MinibarManualEntryRequest",
          refId: request.id,
        },
        tx,
      );
      return { message: `Oda ${room.number} için manuel kayıt talebi reddedildi.` };
    }

    const booked = await bookReplacementTx(tx, {
      room,
      userId: request.requestedById,
      items: storedItems(request.items),
      clientRequestId: randomUUID(),
      note: `Manuel kayıt (QR okutulamadı), onaylayan ${ctx.user.fullName}: ${request.reason}`.slice(0, 300),
      now,
      // The consumption belongs to the day the attendant sent it, whenever the manager gets to approve it.
      occurredAt: request.createdAt,
      manualRequestId: request.id,
    });
    await tx.minibarManualEntryRequest.update({
      where: { id: request.id },
      data: { status: "ONAYLANDI", decidedById: ctx.user.id, resolvedAt: now, transactionId: booked.transactionId },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: request.hotelId,
      action: "MINIBAR_MANUAL_REQUEST_APPROVE",
      entity: "MinibarManualEntryRequest",
      entityId: request.id,
      before: { status: "BEKLIYOR" },
      after: { status: "ONAYLANDI", roomNumber: room.number, transactionId: booked.transactionId, added: booked.added },
    });
    await notify(
      {
        recipients: [request.requestedById],
        type: "minibar.manual.resolved",
        title: `Manuel kayıt talebi onaylandı · Oda ${room.number}`,
        body: `${booked.added} adet tüketim odaya işlendi.`,
        refType: "MinibarManualEntryRequest",
        refId: request.id,
      },
      tx,
    );
    return { message: `Oda ${room.number} için ${booked.added} adet tüketim odaya işlendi.` };
  });
}

/**
 * The sender takes back a request that is still waiting, on the day they sent it (afterwards only a manager
 * closes it). Nothing was booked, so nothing is undone; the managers who were asked are told.
 */
export async function cancelManualEntryRequest(ctx: Ctx, requestId: string, now: Date = new Date()): Promise<{ message: string }> {
  const known = await prisma.minibarManualEntryRequest.findFirst({
    where: { id: requestId, requestedById: ctx.user.id },
    select: { id: true },
  });
  if (!known) throw new DomainError("NOT_FOUND", "Manuel kayıt talebi bulunamadı");

  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "minibar_manual_entry_requests", requestId);
    const request = await tx.minibarManualEntryRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { room: { select: { number: true } } },
    });
    if (request.status !== "BEKLIYOR") throw new DomainError("CONFLICT", "Bu talep karara bağlanmış; iptal edilemez");
    if (businessDate(request.createdAt) !== businessDate(now)) {
      throw new DomainError("CONFLICT", "Talep yalnızca gönderildiği gün iptal edilebilir");
    }
    await tx.minibarManualEntryRequest.update({
      where: { id: request.id },
      data: { status: "REDDEDILDI", decidedById: ctx.user.id, rejectReason: CANCEL_REASON, resolvedAt: now },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: request.hotelId,
      action: "MINIBAR_MANUAL_REQUEST_CANCEL",
      entity: "MinibarManualEntryRequest",
      entityId: request.id,
      before: { status: "BEKLIYOR" },
      after: { status: "REDDEDILDI", roomNumber: request.room.number, rejectReason: CANCEL_REASON },
    });
    await notify(
      {
        recipients: { hotelId: request.hotelId, roleCodes: [...STOCK_MANAGER_ROLES] },
        fallbackHotelId: request.hotelId,
        type: "minibar.manual.resolved",
        title: `Manuel kayıt talebi iptal edildi · Oda ${request.room.number}`,
        body: `${ctx.user.fullName} talebini geri aldı; onayınız gerekmiyor.`,
        refType: "MinibarManualEntryRequest",
        refId: request.id,
      },
      tx,
    );
    return { message: `Oda ${request.room.number} için manuel kayıt talebi iptal edildi.` };
  });
}
