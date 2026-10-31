import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";

export type NotifyInput = {
  recipients: string[] | { hotelId: string; roleCodes: string[] };
  type: string;
  title: string;
  body: string;
  refType?: string;
  refId?: string;
};

async function resolveRecipients(
  recipients: NotifyInput["recipients"],
  db: Prisma.TransactionClient,
): Promise<string[]> {
  if (Array.isArray(recipients)) return [...new Set(recipients)];
  if (recipients.roleCodes.length === 0) return [];
  const { hotelId, roleCodes } = recipients;
  const users = await db.user.findMany({
    where: {
      isActive: true,
      role: { code: { in: roleCodes } },
      OR: [{ hotelId }, { userHotels: { some: { hotelId } } }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Writes one Notification row per recipient and broadcasts `notification.created` to them.
 * Recipients are explicit user ids, or every active user holding one of `roleCodes` who works in
 * `hotelId` (assigned to it or entitled through UserHotel). Returns the number of rows written.
 * With `tx` everything joins that transaction (rows and the NOTIFY commit or roll back together);
 * without it, rows and NOTIFY share a transaction of their own.
 */
export async function notify(input: NotifyInput, tx?: Prisma.TransactionClient): Promise<number> {
  if (!tx) return prisma.$transaction((inner) => notify(input, inner));

  const userIds = await resolveRecipients(input.recipients, tx);
  if (userIds.length === 0) return 0;

  const hotelId = Array.isArray(input.recipients) ? undefined : input.recipients.hotelId;
  const { count } = await tx.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      hotelId,
      type: input.type,
      title: input.title,
      body: input.body,
      refType: input.refType,
      refId: input.refId,
    })),
  });
  await publish(
    {
      type: "notification.created",
      userIds,
      hotelId,
      payload: {
        type: input.type,
        title: input.title,
        body: input.body,
        refType: input.refType,
        refId: input.refId,
      },
    },
    tx,
  );
  return count;
}
