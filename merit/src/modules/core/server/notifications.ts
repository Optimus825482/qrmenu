import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { usersEntitledTo } from "@/modules/core/server/entitlements";

const RECIPIENTS_PER_EVENT = 100;

export type NotifyInput = {
  recipients: string[] | { hotelId: string; roleCodes: string[] };
  type: string;
  title: string;
  body: string;
  refType?: string;
  refId?: string;
  /** Users left out of a role-addressed list (the person whose own action the notification reports). */
  excludeUserIds?: string[];
  /**
   * Hotel to fall back to when the recipient list resolves empty: the notification then goes to the
   * hotel's managers (`FALLBACK_ROLE_CODES`) instead of being dropped silently. Opt-in: without it an
   * empty list still writes nothing (but is logged).
   */
  fallbackHotelId?: string;
};

/** Hotel manager and system administrator: who hears about an alert nobody else was assigned to. */
export const FALLBACK_ROLE_CODES = ["R-OTM", "R-SYS"];

async function resolveRecipients(
  recipients: NotifyInput["recipients"],
  db: Prisma.TransactionClient,
): Promise<string[]> {
  if (Array.isArray(recipients)) return [...new Set(recipients)];
  return usersEntitledTo(recipients.hotelId, recipients.roleCodes, db);
}

/**
 * Writes one Notification row per recipient and broadcasts `notification.created` to them.
 * Recipients are explicit user ids, or every active user whose effective role for `hotelId` is
 * one of `roleCodes` (usersEntitledTo: base role in their hotel scope, or an outlet membership's
 * role in one of the hotel's outlets). Returns the number of rows written.
 * With `tx` everything joins that transaction (rows and the NOTIFY commit or roll back together);
 * without it, rows and NOTIFY share a transaction of their own.
 */
export async function notify(input: NotifyInput, tx?: Prisma.TransactionClient): Promise<number> {
  if (!tx) return prisma.$transaction((inner) => notify(input, inner));

  let userIds = await resolveRecipients(input.recipients, tx);
  if (input.excludeUserIds?.length) {
    const excluded = new Set(input.excludeUserIds);
    userIds = userIds.filter((id) => !excluded.has(id));
    // Nobody else to tell is not an error: the actor was the only recipient.
    if (userIds.length === 0 && !input.fallbackHotelId) return 0;
  }
  const fallbackHotel = input.fallbackHotelId;
  if (userIds.length === 0 && fallbackHotel) {
    userIds = await usersEntitledTo(fallbackHotel, FALLBACK_ROLE_CODES, tx);
    console.warn(
      `[notify] ${input.type}: alıcı bulunamadı, yedek alıcıya (${FALLBACK_ROLE_CODES.join(", ")}) düşüldü: ${userIds.length} kişi`,
    );
  }
  if (userIds.length === 0) {
    console.error(`[notify] ${input.type}: alıcı ve yedek alıcı yok, bildirim yazılmadı (${input.refType ?? "-"} ${input.refId ?? "-"})`);
    return 0;
  }

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
  const payload = {
    type: input.type,
    title: input.title,
    body: input.body,
    refType: input.refType,
    refId: input.refId,
  };
  // pg_notify is limited to 8000 bytes, so large fan-outs are announced in several events.
  for (let i = 0; i < userIds.length; i += RECIPIENTS_PER_EVENT) {
    await publish(
      {
        type: "notification.created",
        userIds: userIds.slice(i, i + RECIPIENTS_PER_EVENT),
        hotelId,
        payload,
      },
      tx,
    );
  }
  return count;
}

export type MyNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  /** The hotel and record the notification is about (opens the related screen on click). */
  hotelId: string | null;
  refType: string | null;
  refId: string | null;
};

const MAX_LIST = 100;

/** The caller's own notifications, newest first (`limit` is clamped to 1..100). */
export async function listMyNotifications(ctx: Ctx, limit = 20, opts: { unreadOnly?: boolean } = {}): Promise<MyNotification[]> {
  const take = Math.min(MAX_LIST, Math.max(1, Math.trunc(limit) || 1));
  return prisma.notification.findMany({
    where: { userId: ctx.user.id, ...(opts.unreadOnly ? { isRead: false } : {}) },
    select: { id: true, type: true, title: true, body: true, isRead: true, createdAt: true, hotelId: true, refType: true, refId: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
}

/** Marks one of the caller's own notifications read. Someone else's (or no such row) -> NOT_FOUND. */
export async function markNotificationRead(ctx: Ctx, id: string): Promise<void> {
  const row = await prisma.notification.findFirst({
    where: { id, userId: ctx.user.id },
    select: { isRead: true },
  });
  if (!row) throw new DomainError("NOT_FOUND", "Bildirim bulunamadı");
  if (row.isRead) return;
  await prisma.notification.updateMany({
    where: { id, userId: ctx.user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

/** Marks every unread notification of the caller read; returns how many changed. */
export async function markAllRead(ctx: Ctx): Promise<number> {
  const { count } = await prisma.notification.updateMany({
    where: { userId: ctx.user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return count;
}
