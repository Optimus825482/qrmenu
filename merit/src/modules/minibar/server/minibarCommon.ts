import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { businessDate, businessDay } from "@/lib/time";

export type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Europe/Nicosia business day as the UTC-midnight Date that @db.Date columns expect
 * (never the UTC calendar day: between 00:00 and 03:00 local the two differ).
 */
export function getBusinessDate(dateObj: Date = new Date()): Date {
  return businessDay(businessDate(dateObj));
}

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

export async function lockRow(tx: Prisma.TransactionClient, table: "rooms" | "minibar_transactions" | "mybar_requests" | "minibar_correction_requests", id: string) {
  // Table names come from the closed union above, never from input.
  await tx.$queryRawUnsafe(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, id);
}

export async function notifyChange(tx: Prisma.TransactionClient, hotelId: string, kind: string, roomId?: string) {
  await publish({ type: "minibar.changed", hotelId, ...(roomId ? { roomId } : {}), payload: { kind } }, tx);
}

