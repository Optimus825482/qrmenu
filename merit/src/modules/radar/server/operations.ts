// OperationEvent: the narrow projection of the four operational signals that leave no timestamped trace in
// any business table (printer health, table assignment history, staff idle, missing occupancy upload).
// Written inside the business transaction (rollback leaves no row), read only by the day replay (Task 6).
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type OperationType = "printer.health" | "table.assigned" | "presence.idle" | "upload.missing";

const DAY_MS = 86_400_000;

export async function recordOperation(
  tx: Prisma.TransactionClient,
  p: {
    hotelId: string;
    outletId?: string;
    type: OperationType;
    refId?: string;
    data?: Prisma.InputJsonValue;
    at?: Date;
  },
): Promise<void> {
  await tx.operationEvent.create({
    data: {
      hotelId: p.hotelId,
      outletId: p.outletId ?? null,
      type: p.type,
      refId: p.refId ?? null,
      data: p.data ?? {},
      ...(p.at ? { at: p.at } : {}),
    },
  });
}

/** Deletes rows older than the retention window (the `radar.purge` job). Returns how many were removed. */
export async function purgeOperations(now: Date, retentionDays: number): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const res = await prisma.operationEvent.deleteMany({ where: { at: { lt: cutoff } } });
  return res.count;
}
