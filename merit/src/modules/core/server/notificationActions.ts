"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { listMyNotifications, markAllRead, markNotificationRead } from "./notifications";

/** Wire shape of a notification (dates as ISO strings, safe for the client). */
export type NotificationDto = {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  hotelId: string | null;
  refType: string | null;
  refId: string | null;
};

const limitSchema = z.number().int().min(1).max(50).optional();
const idSchema = z.string().min(1).max(100);
const noInput = z.undefined();

/** The caller's latest notifications (own rows only), newest first. */
export async function listMyNotificationsAction(limit?: number): Promise<Result<NotificationDto[]>> {
  return safeAction(limitSchema, async (n) => {
    const rows = await listMyNotifications(await requireUser(), n ?? 20);
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  })(limit);
}

export async function markNotificationReadAction(id: string): Promise<Result<null>> {
  return safeAction(idSchema, async (nid) => {
    await markNotificationRead(await requireUser(), nid);
    return null;
  })(id);
}

export async function markAllReadAction(): Promise<Result<number>> {
  return safeAction(noInput, async () => markAllRead(await requireUser()))(undefined);
}
