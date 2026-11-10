import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate, businessDateStart, businessDay } from "@/lib/time";
import { type Page, pageArgs } from "@/modules/core/server/admin/listQuery";
import { audit } from "@/modules/core/server/audit";
import { restoreStock } from "@/modules/minibar/server/pool";
import { isValidExplanation } from "../constants";
import { publishMybar } from "../events";

export type MybarItemView = {
  productId: string;
  name: string;
  requestedQty: number;
  deliveredQty: number;
  remainingQty: number;
  poolRemaining: number | null;
};

export type MybarRow = {
  id: string;
  hotelId: string;
  roomId: string;
  roomNumber: string;
  floorName: string;
  status: "BEKLEMEDE" | "TAMAMLANDI" | "IPTAL";
  createdAt: Date;
  language: string;
  note: string | null;
  noteTr: string | null;
  noteSrcLang: string | null;
  seenAt: Date | null;
  seenByName: string | null;
  completedAt: Date | null;
  completedByName: string | null;
  closeNote: string | null;
  closedWithMissing: boolean;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancelNote: string | null;
  items: MybarItemView[];
};

export const mybarFilterSchema = z.object({
  hotelId: z.string().min(1).max(64).optional(),
  status: z.enum(["BEKLEMEDE", "TAMAMLANDI", "IPTAL"]).optional(),
  unseenOnly: z.boolean().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  q: z.string().trim().max(20).optional(),
});

const MAX_PAGE_SIZE = 100;
const MAX_SKIP = 2_147_483_647; // Prisma skip is a signed 32-bit integer.
export const mybarListSchema = mybarFilterSchema.extend({
  view: z.enum(["floor", "management"]).default("floor"),
  page: z.int().min(1).max(Math.floor(MAX_SKIP / MAX_PAGE_SIZE) + 1).default(1),
  pageSize: z.literal([50, MAX_PAGE_SIZE]).default(MAX_PAGE_SIZE),
});

export type MybarListInput = z.input<typeof mybarListSchema>;

export const CLOSE_MISSING_EXPLANATION_MSG =
  "Eksik ürünlerle kapatmak için en az 3 kelimelik bir açıklama yazmalısınız. Bir ya da iki kelimelik açıklamalar kabul edilmez.";
export const CANCEL_EXPLANATION_MSG =
  "İptal edilen MyBar talepleri için en az 3 kelimelik geçerli bir açıklama girmek zorunludur. Bir ya da iki kelimelik açıklamalar kabul edilmez.";
export const DEFAULT_CLOSE_NOTE = "Tüm ürünler eksiksiz eklendi ve karşılandı.";

const rowInclude = {
  room: { select: { id: true, number: true, floor: { select: { name: true } } } },
  seenBy: { select: { fullName: true } },
  completedBy: { select: { fullName: true } },
  cancelledBy: { select: { fullName: true } },
  items: {
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.MybarRequestInclude;

type LoadedRequest = Prisma.MybarRequestGetPayload<{ include: typeof rowInclude }>;

function toMybarRow(row: LoadedRequest, poolMap?: Map<string, number>): MybarRow {
  return {
    id: row.id,
    hotelId: row.hotelId,
    roomId: row.roomId,
    roomNumber: row.room.number,
    floorName: row.room.floor.name,
    status: row.status,
    createdAt: row.createdAt,
    language: row.language,
    note: row.note,
    noteTr: row.noteTr,
    noteSrcLang: row.noteSrcLang,
    seenAt: row.seenAt,
    seenByName: row.seenBy?.fullName ?? null,
    completedAt: row.completedAt,
    completedByName: row.completedBy?.fullName ?? null,
    closeNote: row.closeNote,
    closedWithMissing: row.closedWithMissing,
    cancelledAt: row.cancelledAt,
    cancelledByName: row.cancelledBy?.fullName ?? null,
    cancelNote: row.cancelNote,
    items: row.items.map((it) => ({
      productId: it.productId,
      name: it.product.name,
      requestedQty: it.requestedQty,
      deliveredQty: it.deliveredQty,
      remainingQty: Math.max(0, it.requestedQty - it.deliveredQty),
      poolRemaining: poolMap ? (poolMap.get(it.productId) ?? 0) : null,
    })),
  };
}

async function loadPoolMap(hotelId: string, productIds: string[]): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length === 0) return new Map();
  const stocks = await prisma.hotelStock.findMany({
    where: { hotelId, productId: { in: uniqueIds } },
    select: { productId: true, remainingQty: true },
  });
  return new Map(stocks.map((s) => [s.productId, s.remainingQty]));
}

export async function loadRequestForUpdate(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM mybar_requests WHERE id = ${id} FOR UPDATE`;
  const req = await tx.mybarRequest.findUnique({
    where: { id },
    include: {
      room: { select: { id: true, number: true } },
      items: {
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!req) throw new DomainError("NOT_FOUND", "MyBar talebi bulunamadı");
  return req;
}

export function mybarFilterWhere(hotelId: string, input: z.output<typeof mybarFilterSchema>): Prisma.MybarRequestWhereInput {
  const where: Prisma.MybarRequestWhereInput = { hotelId };
  if (input.status) where.status = input.status;
  if (input.unseenOnly) where.seenAt = null;
  if (input.q) where.room = { number: { startsWith: input.q, mode: "insensitive" } };
  if (input.from || input.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (input.from) createdAt.gte = businessDateStart(input.from);
    if (input.to) {
      const nextDay = businessDay(input.to);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      createdAt.lt = businessDateStart(nextDay.toISOString().slice(0, 10));
    }
    where.createdAt = createdAt;
  }
  return where;
}

const newestFirst = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.MybarRequestOrderByWithRelationInput[];

export async function list(ctx: Ctx, rawInput: MybarListInput = {}): Promise<Page<MybarRow>> {
  const parsed = mybarListSchema.safeParse(rawInput);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;
  const management = input.view === "management";
  const hotelId = (management ? input.hotelId : undefined) ?? ctx.session.hotelId;
  await assertCan(ctx, "MB-PERS", "V", hotelId);
  const { skip, take } = pageArgs(input);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const { page, pageSize } = input;

  if (management) {
    const where = mybarFilterWhere(hotelId, input);
    if (!(await can(ctx, "MB-PERS", "A", hotelId))) {
      where.OR = [{ status: "BEKLEMEDE" }, { createdAt: { gte: sevenDaysAgo } }];
    }
    const [rows, total] = await Promise.all([
      prisma.mybarRequest.findMany({ where, include: rowInclude, orderBy: newestFirst, skip, take }),
      prisma.mybarRequest.count({ where }),
    ]);
    return { items: rows.map((row) => toMybarRow(row)), total, page, pageSize };
  }

  // The floor view always shows pending requests first, then recently closed requests.
  const pending: Prisma.MybarRequestWhereInput = { hotelId, status: "BEKLEMEDE" };
  const recentClosed: Prisma.MybarRequestWhereInput = {
    hotelId,
    status: { not: "BEKLEMEDE" },
    createdAt: { gte: sevenDaysAgo },
  };
  return prisma.$transaction(async (tx) => {
    const pendingCount = await tx.mybarRequest.count({ where: pending });
    const closedCount = await tx.mybarRequest.count({ where: recentClosed });
    const pendingTake = Math.min(take, Math.max(0, pendingCount - skip));
    const closedTake = take - pendingTake;
    const closedSkip = Math.max(0, skip - pendingCount);
    const rows = pendingTake > 0
      ? await tx.mybarRequest.findMany({ where: pending, include: rowInclude, orderBy: newestFirst, skip, take: pendingTake })
      : [];
    if (closedTake > 0 && closedSkip < closedCount) {
      rows.push(...await tx.mybarRequest.findMany({
        where: recentClosed, include: rowInclude, orderBy: newestFirst, skip: closedSkip, take: closedTake,
      }));
    }
    return { items: rows.map((row) => toMybarRow(row)), total: pendingCount + closedCount, page, pageSize };
  }, { isolationLevel: "RepeatableRead" });
}

export async function kpis(
  ctx: Ctx,
  hotelId?: string,
): Promise<{ pending: number; unseen: number; completedToday: number; cancelledToday: number }> {
  const effectiveHotelId = hotelId ?? ctx.session.hotelId;
  await assertCan(ctx, "MB-PERS", "V", effectiveHotelId);

  const todayStr = businessDate();
  const todayStart = businessDateStart(todayStr);

  const [pending, unseen, completedToday, cancelledToday] = await Promise.all([
    prisma.mybarRequest.count({ where: { hotelId: effectiveHotelId, status: "BEKLEMEDE" } }),
    prisma.mybarRequest.count({
      where: { hotelId: effectiveHotelId, status: "BEKLEMEDE", seenAt: null },
    }),
    prisma.mybarRequest.count({
      where: {
        hotelId: effectiveHotelId,
        status: "TAMAMLANDI",
        completedAt: { gte: todayStart },
      },
    }),
    prisma.mybarRequest.count({
      where: {
        hotelId: effectiveHotelId,
        status: "IPTAL",
        cancelledAt: { gte: todayStart },
      },
    }),
  ]);

  return { pending, unseen, completedToday, cancelledToday };
}

export async function get(ctx: Ctx, id: string): Promise<MybarRow> {
  const row = await prisma.mybarRequest.findUnique({
    where: { id },
    include: rowInclude,
  });
  if (!row) throw new DomainError("NOT_FOUND", "MyBar talebi bulunamadı");
  await assertCan(ctx, "MB-PERS", "V", row.hotelId);

  const poolMap = await loadPoolMap(
    row.hotelId,
    row.items.map((i) => i.productId),
  );
  return toMybarRow(row, poolMap);
}

export async function listUnseen(ctx: Ctx): Promise<MybarRow[]> {
  await assertCan(ctx, "MB-PERS", "V", ctx.session.hotelId);
  const rows = await prisma.mybarRequest.findMany({
    where: {
      hotelId: ctx.session.hotelId,
      status: "BEKLEMEDE",
      seenAt: null,
    },
    include: rowInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => toMybarRow(r));
}

export async function listForRoom(ctx: Ctx, roomId: string): Promise<MybarRow[]> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, hotelId: true },
  });
  if (!room) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  await assertCan(ctx, "MB-PERS", "V", room.hotelId);

  const rows = await prisma.mybarRequest.findMany({
    where: {
      hotelId: room.hotelId,
      roomId: room.id,
      status: "BEKLEMEDE",
    },
    include: rowInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const poolMap = await loadPoolMap(
    room.hotelId,
    rows.flatMap((r) => r.items.map((i) => i.productId)),
  );
  return rows.map((r) => toMybarRow(r, poolMap));
}

export async function acknowledge(
  ctx: Ctx,
  id: string,
): Promise<{ firstSeen: boolean; seenAt: Date }> {
  const target = await prisma.mybarRequest.findUnique({
    where: { id },
    select: { id: true, hotelId: true, roomId: true, status: true, seenAt: true, room: { select: { number: true } } },
  });
  if (!target) throw new DomainError("NOT_FOUND", "MyBar talebi bulunamadı");
  await assertCan(ctx, "MB-PERS", "D", target.hotelId);

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const { count } = await tx.mybarRequest.updateMany({
      where: { id, status: "BEKLEMEDE", seenAt: null },
      data: { seenById: ctx.user.id, seenAt: now },
    });

    if (count === 0) {
      const current = await tx.mybarRequest.findUniqueOrThrow({
        where: { id },
        select: { seenAt: true, createdAt: true },
      });
      return { firstSeen: false, seenAt: current.seenAt ?? current.createdAt };
    }

    await tx.notification.updateMany({
      where: {
        type: "mybar.created",
        refId: id,
        isRead: false,
      },
      data: { isRead: true, readAt: now },
    });

    await audit(tx, {
      userId: ctx.user.id,
      hotelId: target.hotelId,
      action: "MYBAR_SEEN",
      entity: "MybarRequest",
      entityId: id,
      after: { roomId: target.roomId, roomNumber: target.room.number, seenAt: now.toISOString() },
    });

    await publishMybar(tx, "mybar.seen", {
      id,
      hotelId: target.hotelId,
      roomId: target.roomId,
      roomNumber: target.room.number,
      status: "BEKLEMEDE",
      byUserId: ctx.user.id,
    });

    return { firstSeen: true, seenAt: now };
  });
}

const completeInputSchema = z.object({
  confirmMissing: z.boolean().optional(),
  closeNote: z.string().optional(),
});

export async function complete(
  ctx: Ctx,
  id: string,
  rawInput: { confirmMissing?: boolean; closeNote?: string } = {},
): Promise<{ closedWithMissing: boolean }> {
  const parsed = completeInputSchema.safeParse(rawInput);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;

  const target = await prisma.mybarRequest.findUnique({
    where: { id },
    select: { id: true, hotelId: true },
  });
  if (!target) throw new DomainError("NOT_FOUND", "MyBar talebi bulunamadı");
  await assertCan(ctx, "MB-PERS", "D", target.hotelId);

  return prisma.$transaction(async (tx) => {
    const req = await loadRequestForUpdate(tx, id);
    if (req.status !== "BEKLEMEDE") {
      throw new DomainError("CONFLICT", "Bu talep zaten işlenmiş");
    }

    const missingItems = req.items
      .map((it) => ({
        name: it.product.name,
        missingQty: it.requestedQty - it.deliveredQty,
      }))
      .filter((m) => m.missingQty > 0);

    const hasMissing = missingItems.length > 0;
    const missingFormatted = missingItems.map((m) => `${m.name} (${m.missingQty})`);

    if (hasMissing && !input.confirmMissing) {
      throw new DomainError(
        "VALIDATION",
        "Talep edilen ürünlerden bazıları henüz odaya eklenmemiş.",
        { fieldErrors: { missing: missingFormatted } },
      );
    }

    let finalNote: string;
    if (hasMissing) {
      const note = (input.closeNote ?? "").trim();
      if (!isValidExplanation(note)) {
        throw new DomainError("VALIDATION", CLOSE_MISSING_EXPLANATION_MSG, {
          fieldErrors: { closeNote: [CLOSE_MISSING_EXPLANATION_MSG] },
        });
      }
      finalNote = note;
    } else {
      const trimmed = (input.closeNote ?? "").trim();
      finalNote = trimmed.length > 0 ? trimmed : DEFAULT_CLOSE_NOTE;
    }

    const now = new Date();
    const seenData = req.seenAt ? {} : { seenById: ctx.user.id, seenAt: now };

    await tx.mybarRequest.update({
      where: { id },
      data: {
        status: "TAMAMLANDI",
        completedById: ctx.user.id,
        completedAt: now,
        closedWithMissing: hasMissing,
        closeNote: finalNote,
        ...seenData,
      },
    });

    await tx.notification.updateMany({
      where: { type: "mybar.created", refId: id, isRead: false },
      data: { isRead: true, readAt: now },
    });

    await audit(tx, {
      userId: ctx.user.id,
      hotelId: req.hotelId,
      action: "MYBAR_COMPLETE",
      entity: "MybarRequest",
      entityId: id,
      after: {
        closedWithMissing: hasMissing,
        missing: missingFormatted,
        closeNote: finalNote,
      },
    });

    const waitSec = Math.max(0, Math.round((now.getTime() - req.createdAt.getTime()) / 1000));
    await publishMybar(tx, "mybar.completed", {
      id,
      hotelId: req.hotelId,
      roomId: req.roomId,
      roomNumber: req.room.number,
      status: "TAMAMLANDI",
      closedWithMissing: hasMissing,
      waitSec,
      byUserId: ctx.user.id,
    });

    return { closedWithMissing: hasMissing };
  });
}

const cancelInputSchema = z.object({
  reason: z.string(),
});

export async function cancel(
  ctx: Ctx,
  id: string,
  rawInput: { reason: string },
): Promise<void> {
  const parsed = cancelInputSchema.safeParse(rawInput);
  if (!parsed.success) throw fromZod(parsed.error);
  const reason = parsed.data.reason.trim();

  const target = await prisma.mybarRequest.findUnique({
    where: { id },
    select: { id: true, hotelId: true },
  });
  if (!target) throw new DomainError("NOT_FOUND", "MyBar talebi bulunamadı");
  await assertCan(ctx, "MB-PERS", "A", target.hotelId);

  if (!isValidExplanation(reason)) {
    throw new DomainError("VALIDATION", CANCEL_EXPLANATION_MSG, {
      fieldErrors: { reason: [CANCEL_EXPLANATION_MSG] },
    });
  }

  await prisma.$transaction(async (tx) => {
    const req = await loadRequestForUpdate(tx, id);
    if (req.status !== "BEKLEMEDE") {
      throw new DomainError("CONFLICT", "Bu talep zaten işlenmiş");
    }
    await applyCancel(tx, req, { actorId: ctx.user.id, reason, now: new Date() });
  });
}

type LockedRequest = Awaited<ReturnType<typeof loadRequestForUpdate>>;

/**
 * The one cancellation rule (staff `cancel` and the system checkout cancel): the request turns IPTAL, its open
 * notifications are marked read, what was already delivered from the hotel pool goes back (IADE), an audit row
 * and the `mybar.cancelled` event follow. `req` must be BEKLEMEDE and row-locked by the caller.
 *
 * `actorId: null` is the system: no seen/cancelled-by user, the IADE movement is booked on the user who delivered
 * the line (a stock movement needs a user), and the audit row has no user.
 */
export async function applyCancel(
  tx: Prisma.TransactionClient,
  req: LockedRequest,
  opts: {
    actorId: string | null;
    reason: string;
    now: Date;
    auditAction?: string;
    auditAfter?: Record<string, unknown>;
    notificationTypes?: string[];
  },
): Promise<void> {
  const { actorId, reason, now } = opts;
  const id = req.id;
  const seenData = req.seenAt || !actorId ? {} : { seenById: actorId, seenAt: now };
  const deliveredBefore = req.items
    .filter((it) => it.deliveredQty > 0)
    .map((it) => ({ productId: it.productId, deliveredQty: it.deliveredQty }));

  await tx.mybarRequest.update({
    where: { id },
    data: {
      status: "IPTAL",
      cancelledById: actorId,
      cancelledAt: now,
      cancelNote: reason,
      ...seenData,
    },
  });

  await tx.notification.updateMany({
    where: { type: { in: opts.notificationTypes ?? ["mybar.created"] }, refId: id, isRead: false },
    data: { isRead: true, readAt: now },
  });

  // What was already taken from the hotel pool for this request goes back (IADE), in product-id order like fulfill.
  for (const line of [...deliveredBefore].sort((a, b) => a.productId.localeCompare(b.productId))) {
    const userId = actorId ?? (await delivererOf(tx, id, line.productId));
    await restoreStock(tx, {
      hotelId: req.hotelId,
      productId: line.productId,
      qty: line.deliveredQty,
      userId,
      refType: "MybarRequest",
      refId: id,
      note: "MyBar talebi iptal edildi",
    });
  }

  await audit(tx, {
    ...(actorId ? { userId: actorId } : {}),
    hotelId: req.hotelId,
    action: opts.auditAction ?? "MYBAR_CANCEL",
    entity: "MybarRequest",
    entityId: id,
    after: {
      cancelNote: reason,
      deliveredBefore,
      ...opts.auditAfter,
    },
  });

  await publishMybar(tx, "mybar.cancelled", {
    id,
    hotelId: req.hotelId,
    roomId: req.roomId,
    roomNumber: req.room.number,
    status: "IPTAL",
    ...(actorId ? { byUserId: actorId } : {}),
  });
}

/** The user whose pool take delivered `productId` for the request (latest first). */
async function delivererOf(tx: Prisma.TransactionClient, requestId: string, productId: string): Promise<string> {
  const move = await tx.hotelStockMovement.findFirst({
    where: { refType: "MybarRequest", refId: requestId, qty: { lt: 0 }, productId },
    orderBy: { createdAt: "desc" },
    select: { userId: true },
  });
  if (!move) throw new DomainError("INTERNAL", "Teslim edilen ürünün stok hareketi bulunamadı");
  return move.userId;
}
