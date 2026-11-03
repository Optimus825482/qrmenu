import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate, businessDateStart } from "@/lib/time";
import { type Page, pageArgs } from "@/modules/core/server/admin/listQuery";
import { audit } from "@/modules/core/server/audit";
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

export const mybarListSchema = z.object({
  hotelId: z.string().optional(),
  status: z.enum(["BEKLEMEDE", "TAMAMLANDI", "IPTAL"]).optional(),
  unseenOnly: z.boolean().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  q: z.string().trim().max(20).optional(),
  page: z.int().min(1).default(1),
  pageSize: z.literal([50, 100, 200]).default(100),
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

export async function list(ctx: Ctx, rawInput: MybarListInput = {}): Promise<Page<MybarRow>> {
  const parsed = mybarListSchema.safeParse(rawInput);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data;

  const effectiveHotelId = input.hotelId ?? ctx.session.hotelId;
  await assertCan(ctx, "MB-PERS", "V", effectiveHotelId);
  const isAdminScope = await can(ctx, "MB-PERS", "A", effectiveHotelId);

  if (isAdminScope) {
    const where: Prisma.MybarRequestWhereInput = { hotelId: effectiveHotelId };
    if (input.status) where.status = input.status;
    if (input.unseenOnly) where.seenAt = null;
    if (input.q) where.room = { number: { startsWith: input.q, mode: "insensitive" } };
    if (input.from || input.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (input.from) createdAt.gte = businessDateStart(input.from);
      if (input.to) {
        const nextDay = new Date(businessDateStart(input.to).getTime() + 86_400_000);
        createdAt.lt = nextDay;
      }
      where.createdAt = createdAt;
    }

    const { skip, take } = pageArgs({ page: input.page, pageSize: input.pageSize as never });
    const [rows, total] = await Promise.all([
      prisma.mybarRequest.findMany({
        where,
        include: rowInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
      prisma.mybarRequest.count({ where }),
    ]);

    return {
      items: rows.map((r) => toMybarRow(r)),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  // Kat scope (V/D without A): session hotel only, BEKLEMEDE or createdAt >= now - 7 days,
  // filters ignored, BEKLEMEDE first then createdAt desc.
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const where: Prisma.MybarRequestWhereInput = {
    hotelId: ctx.session.hotelId,
    OR: [{ status: "BEKLEMEDE" }, { createdAt: { gte: sevenDaysAgo } }],
  };

  const allMatching = await prisma.mybarRequest.findMany({
    where,
    include: rowInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  allMatching.sort((a, b) => {
    const aPending = a.status === "BEKLEMEDE" ? 0 : 1;
    const bPending = b.status === "BEKLEMEDE" ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const { skip, take } = pageArgs({ page: input.page, pageSize: input.pageSize as never });
  const paged = allMatching.slice(skip, skip + take);

  return {
    items: paged.map((r) => toMybarRow(r)),
    total: allMatching.length,
    page: input.page,
    pageSize: input.pageSize,
  };
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

    const now = new Date();
    const seenData = req.seenAt ? {} : { seenById: ctx.user.id, seenAt: now };
    const deliveredBefore = req.items
      .filter((it) => it.deliveredQty > 0)
      .map((it) => ({ productId: it.productId, deliveredQty: it.deliveredQty }));

    await tx.mybarRequest.update({
      where: { id },
      data: {
        status: "IPTAL",
        cancelledById: ctx.user.id,
        cancelledAt: now,
        cancelNote: reason,
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
      action: "MYBAR_CANCEL",
      entity: "MybarRequest",
      entityId: id,
      after: {
        cancelNote: reason,
        deliveredBefore,
      },
    });

    await publishMybar(tx, "mybar.cancelled", {
      id,
      hotelId: req.hotelId,
      roomId: req.roomId,
      roomNumber: req.room.number,
      status: "IPTAL",
      byUserId: ctx.user.id,
    });
  });
}
