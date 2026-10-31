import type { Prisma, PrismaClient } from "@/generated/prisma/client";

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

/** Writes an audit_logs row. Pass the transaction client to make it atomic with the change. */
export async function audit(
  tx: Pick<PrismaClient, "auditLog"> | Prisma.TransactionClient,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
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
  });
}
