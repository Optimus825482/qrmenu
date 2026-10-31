import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { publish } from "@/lib/realtime";

export type AuditEntry = {
  userId?: string;
  hotelId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
};

/**
 * Writes an audit_logs row and announces `audit.created` to SISTEM sessions.
 * Pass the transaction client so the NOTIFY commits with the row and disappears on rollback.
 */
export async function audit(
  tx: Pick<PrismaClient, "auditLog"> | Prisma.TransactionClient,
  entry: AuditEntry,
): Promise<void> {
  const row = await tx.auditLog.create({
    data: {
      userId: entry.userId,
      hotelId: entry.hotelId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: entry.before as Prisma.InputJsonValue | undefined,
      after: entry.after as Prisma.InputJsonValue | undefined,
      ip: entry.ip,
    },
    select: { id: true, action: true, entity: true, entityId: true, hotelId: true },
  });
  await publish(
    {
      type: "audit.created",
      roleKinds: ["SISTEM"],
      ...(row.hotelId ? { hotelId: row.hotelId } : {}),
      payload: {
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        hotelId: row.hotelId,
      },
    },
    tx as Prisma.TransactionClient,
  );
}
