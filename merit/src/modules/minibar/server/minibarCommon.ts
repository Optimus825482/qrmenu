import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { businessDate, businessDay } from "@/lib/time";
import { dayRange } from "./dates";

export type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Europe/Nicosia business day as the UTC-midnight Date that @db.Date columns expect
 * (never the UTC calendar day: between 00:00 and 03:00 local the two differ).
 */
export function getBusinessDate(dateObj: Date = new Date()): Date {
  return businessDay(businessDate(dateObj));
}

/** A double tap on the DND button: a second mark within this window is rejected. */
export const DND_DOUBLE_TAP_MS = 30_000;

/** Products of a room's setup catalogue (setups assigned to its room type) with their per-day cap. */
export type RoomCatalogue = {
  setups: Awaited<ReturnType<typeof loadSetups>>;
  /** productId -> summed setup quantity (the daily per-room cap) */
  caps: Map<string, number>;
  /** productId -> first setup holding it */
  setupOf: Map<string, string>;
};

async function loadSetups(db: Db, setupIds: string[]) {
  return db.setup.findMany({
    where: { id: { in: setupIds }, isActive: true },
    include: { items: { include: { product: { include: { group: { select: { name: true } } } } } } },
  });
}

/** The setup catalogue of a room: only the setups assigned to its room type (no catalogue = empty). */
export async function roomCatalogue(
  db: Db,
  hotelId: string,
  roomTypeId: string | null,
): Promise<RoomCatalogue> {
  const caps = new Map<string, number>();
  const setupOf = new Map<string, string>();
  if (!roomTypeId) return { setups: [], caps, setupOf };
  const assigned = await db.roomTypeSetup.findMany({
    where: { hotelId, roomTypeId },
    select: { setupId: true },
  });
  if (assigned.length === 0) return { setups: [], caps, setupOf };
  const setups = await loadSetups(db, assigned.map((a) => a.setupId));
  for (const s of setups) {
    for (const it of s.items) {
      caps.set(it.productId, (caps.get(it.productId) ?? 0) + it.qty);
      if (!setupOf.has(it.productId)) setupOf.set(it.productId, s.id);
    }
  }
  return { setups, caps, setupOf };
}

/** Quantities already replenished in a room on one business day (optionally ignoring one transaction). */
export async function consumedToday(
  db: Db,
  hotelId: string,
  roomId: string,
  day: string,
  excludeTxId?: string,
): Promise<Map<string, number>> {
  const rows = await db.minibarTransactionItem.findMany({
    where: {
      transaction: {
        hotelId,
        roomId,
        type: "SETUP_KONTROL",
        occurredAt: dayRange(day),
        ...(excludeTxId ? { id: { not: excludeTxId } } : {}),
      },
    },
    select: { productId: true, consumed: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.productId, (m.get(r.productId) ?? 0) + r.consumed);
  return m;
}

export function normalizeItems(items: { productId: string; qty: number; setupId?: string }[]) {
  const merged = new Map<string, number>();
  for (const it of items) {
    if (!Number.isInteger(it.qty) || it.qty < 0) {
      throw new DomainError("VALIDATION", "Adet 0 veya pozitif tam sayı olmalı");
    }
    if (it.qty === 0) continue;
    merged.set(it.productId, (merged.get(it.productId) ?? 0) + it.qty);
  }
  return [...merged.entries()].map(([productId, qty]) => ({ productId, qty }));
}

export function assertWithinCatalogue(
  lines: { productId: string; qty: number }[],
  cat: RoomCatalogue,
  already: Map<string, number>,
) {
  for (const line of lines) {
    const cap = cat.caps.get(line.productId);
    if (cap === undefined) {
      throw new DomainError("VALIDATION", "Ürün bu odanın setup tanımında bulunmuyor", {
        fieldErrors: { productId: [line.productId] },
      });
    }
    const total = (already.get(line.productId) ?? 0) + line.qty;
    if (total > cap) {
      throw new DomainError(
        "DAILY_LIMIT",
        `Günlük setup sınırı aşıldı (sınır ${cap}, bugün ${already.get(line.productId) ?? 0} + ${line.qty})`,
      );
    }
  }
}

export async function lockRow(tx: Prisma.TransactionClient, table: "rooms" | "minibar_transactions" | "mybar_requests" | "minibar_correction_requests", id: string) {
  // Table names come from the closed union above, never from input.
  await tx.$queryRawUnsafe(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, id);
}

export async function notifyChange(tx: Prisma.TransactionClient, hotelId: string, kind: string, roomId?: string) {
  await publish({ type: "minibar.changed", hotelId, ...(roomId ? { roomId } : {}), payload: { kind } }, tx);
}

