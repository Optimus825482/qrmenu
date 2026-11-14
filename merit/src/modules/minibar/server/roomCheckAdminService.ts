import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { businessDate } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { addDays, dayRange } from "./dates";
import { deleteTransactionTx, updateTransactionTx } from "./roomCheckService";

/*
 * "Oda Kontrol İşlemleri" (MB-OKI): the manager's list of the room check records of ALL staff, with edit and delete
 * of any day. V lists, D edits and deletes. Records are changed by the same transaction functions as the floor
 * attendant's own list (roomCheckService), with the manager-bypass actor: the products return to / leave the otel
 * deposu exactly as there, a past day needs no correction request. MyBar fulfilment records are read-only here.
 *
 * Every function checks MB-OKI on the hotel of the record itself, never on the hotel the window shows.
 */

const SCREEN = "MB-OKI";
const NOT_FOUND = "İşlem bulunamadı";
/** Longest range one list covers, in days (a month and a bit). */
const MAX_DAYS = 62;
const DEFAULT_LIMIT = 500;
const id = z.string().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd olmalı");

export type AdminCheckItem = { productId: string; productName: string; added: number };

export type AdminCheckRow = {
  id: string;
  hotelId: string;
  hotelName: string;
  roomId: string;
  roomNumber: string;
  floorNumber: number;
  floorName: string;
  userId: string;
  userName: string;
  type: string;
  typeLabel: string;
  typeBadgeColor: "emerald" | "slate" | "amber";
  note: string | null;
  occurredAt: string;
  dateStr: string;
  items: AdminCheckItem[];
  totalItemsCount: number;
  canEdit: boolean;
  canDelete: boolean;
};

export type AdminCheckList = {
  /** Range actually listed (inclusive business days). */
  from: string;
  to: string;
  rows: AdminCheckRow[];
  /** More records exist than were returned (newest first). */
  truncated: boolean;
  /** Hotels the list covers (the user's scope where MB-OKI may be viewed). */
  hotels: { id: string; name: string }[];
  /** Staff with records in the range and hotels, regardless of the staff filter. */
  staff: { id: string; fullName: string }[];
};

const listSchema = z
  .strictObject({
    hotelId: id.optional(),
    day: day.optional(),
    from: day.optional(),
    to: day.optional(),
    userId: id.optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  })
  .optional();

const LABELS: Record<string, { label: string; color: AdminCheckRow["typeBadgeColor"] }> = {
  SETUP_KONTROL: { label: "Ürün İkamesi", color: "emerald" },
  SARFIYAT_YOK: { label: "Sarfiyat Yok", color: "slate" },
  MYBAR_KARSILAMA: { label: "MyBar Karşılama", color: "amber" },
};

/** Hotels of the user's scope where MB-OKI may be viewed (a named hotel is checked and returned alone). */
async function viewableHotels(ctx: Ctx, requested?: string): Promise<string[]> {
  if (requested) {
    await assertCan(ctx, SCREEN, "V", requested);
    return [requested];
  }
  const checks = await Promise.all(ctx.hotelIds.map(async (h) => ((await can(ctx, SCREEN, "V", h)) ? h : null)));
  const hotelIds = checks.filter((h): h is string => h !== null);
  if (hotelIds.length === 0) await assertCan(ctx, SCREEN, "V", ctx.session.hotelId);
  return hotelIds;
}

/**
 * Room check records of all staff in the hotels the user may view (every such hotel when none is named), for a
 * business day (default today) or a from-to range, newest first. `staff` lists who has records in that range so
 * the staff filter always shows the whole choice.
 */
export async function listRoomChecks(ctx: Ctx, q: z.input<typeof listSchema> = {}, now: Date = new Date()): Promise<AdminCheckList> {
  const parsed = listSchema.safeParse(q);
  if (!parsed.success) throw fromZod(parsed.error);
  const input = parsed.data ?? {};
  const hotelIds = await viewableHotels(ctx, input.hotelId);

  const today = businessDate(now);
  const from = input.from ?? input.day ?? today;
  const to = input.to ?? input.day ?? from;
  if (to < from) throw new DomainError("VALIDATION", "Bitiş tarihi başlangıçtan önce olamaz");
  if (addDays(from, MAX_DAYS) <= to) throw new DomainError("VALIDATION", `En fazla ${MAX_DAYS} günlük aralık listelenebilir`);
  const range = { gte: dayRange(from).gte, lt: dayRange(to).lt };
  const limit = input.limit ?? DEFAULT_LIMIT;

  const base = { hotelId: { in: hotelIds }, occurredAt: range };
  const [txs, staffGroups, hotels] = await Promise.all([
    prisma.minibarTransaction.findMany({
      where: { ...base, ...(input.userId ? { userId: input.userId } : {}) },
      include: {
        hotel: { select: { name: true } },
        user: { select: { fullName: true } },
        room: { select: { id: true, number: true, floor: { select: { number: true, name: true } } } },
        items: { include: { product: { select: { name: true } } }, orderBy: { id: "asc" } },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    }),
    prisma.minibarTransaction.groupBy({ by: ["userId"], where: base }),
    prisma.hotel.findMany({ where: { id: { in: hotelIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const staff = await prisma.user.findMany({
    where: { id: { in: staffGroups.map((g) => g.userId) } },
    select: { id: true, fullName: true },
  });
  staff.sort((a, b) => a.fullName.localeCompare(b.fullName, "tr"));

  const canEditHotel = new Map<string, boolean>();
  for (const h of hotelIds) canEditHotel.set(h, await can(ctx, SCREEN, "D", h));

  const truncated = txs.length > limit;
  const rows: AdminCheckRow[] = txs.slice(0, limit).map((t) => {
    const label = LABELS[t.type] ?? { label: "Kayıt", color: "slate" as const };
    const items = t.items.filter((i) => i.added > 0).map((i) => ({ productId: i.productId, productName: i.product.name, added: i.added }));
    const writable = canEditHotel.get(t.hotelId) === true;
    return {
      id: t.id,
      hotelId: t.hotelId,
      hotelName: t.hotel.name,
      roomId: t.room.id,
      roomNumber: t.room.number,
      floorNumber: t.room.floor.number,
      floorName: t.room.floor.name,
      userId: t.userId,
      userName: t.user.fullName,
      type: t.type,
      typeLabel: label.label,
      typeBadgeColor: label.color,
      note: t.note,
      occurredAt: t.occurredAt.toISOString(),
      dateStr: businessDate(t.occurredAt),
      items,
      totalItemsCount: items.reduce((a, i) => a + i.added, 0),
      canEdit: writable && (t.type === "SETUP_KONTROL" || t.type === "SARFIYAT_YOK"),
      canDelete: writable && (t.type === "SETUP_KONTROL" || t.type === "SARFIYAT_YOK"),
    };
  });
  return { from, to, rows, truncated, hotels, staff };
}

/** The record must be in a hotel of the user's scope, and the user must hold MB-OKI 'D' there. */
async function authorise(ctx: Ctx, transactionId: string): Promise<string> {
  const known = await prisma.minibarTransaction.findFirst({
    where: { id: transactionId, hotelId: { in: ctx.hotelIds } },
    select: { hotelId: true, type: true },
  });
  if (!known) throw new DomainError("NOT_FOUND", NOT_FOUND);
  await assertCan(ctx, SCREEN, "D", known.hotelId);
  if (known.type === "LEGACY") throw new DomainError("VALIDATION", "Eski sistemden gelen kayıt buradan değiştirilemez");
  return known.hotelId;
}

const updateSchema = z.strictObject({
  transactionId: id,
  updatedItems: z.array(z.strictObject({ productId: id, qty: z.number().int().min(0).max(999) })).max(50),
  note: z.string().trim().max(300).optional(),
  reason: z.string().trim().max(500).optional(),
});

/** Changes the quantities / note of any room check record (manager bypass: any day; stock difference moves through the pool). */
export async function updateRoomCheck(ctx: Ctx, input: unknown, now: Date = new Date()) {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const { reason, ...update } = parsed.data;
  const seen = new Set<string>();
  for (const u of update.updatedItems) {
    if (seen.has(u.productId)) throw new DomainError("VALIDATION", "Aynı ürün birden fazla satırda olamaz");
    seen.add(u.productId);
  }
  const hotelId = await authorise(ctx, update.transactionId);
  return prisma.$transaction(async (tx) => {
    const out = await updateTransactionTx(tx, { userId: ctx.user.id, hotelId, canApprove: true, isManagerBypass: true }, update, now);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "MINIBAR_ROOM_CHECK_ADMIN",
      entity: "MinibarTransaction",
      entityId: update.transactionId,
      after: { op: "DUZELT", screen: SCREEN, reason: reason || null },
    });
    return out;
  });
}

const deleteSchema = z.strictObject({
  transactionId: id,
  reason: z.string().trim().min(3, "Lütfen silme gerekçesini yazın").max(500),
});

/** Deletes any room check record (manager bypass: any day); its products return to the otel deposu. The reason is audited. */
export async function deleteRoomCheck(ctx: Ctx, input: unknown, now: Date = new Date()) {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) throw fromZod(parsed.error);
  const hotelId = await authorise(ctx, parsed.data.transactionId);
  return prisma.$transaction(async (tx) => {
    const out = await deleteTransactionTx(
      tx,
      { userId: ctx.user.id, hotelId, canApprove: true, isManagerBypass: true },
      parsed.data.transactionId,
      now,
    );
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "MINIBAR_ROOM_CHECK_ADMIN",
      entity: "MinibarTransaction",
      entityId: parsed.data.transactionId,
      after: { op: "SIL", screen: SCREEN, reason: parsed.data.reason },
    });
    return out;
  });
}
