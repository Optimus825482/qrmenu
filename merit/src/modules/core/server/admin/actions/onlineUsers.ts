"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import * as onlineUsers from "../onlineUsers";

const hotelId = z.string().min(1);
const status = z.enum(["ONLINE", "UYARI"]);

export async function onlineUsersListAction(raw: unknown): Promise<Result<onlineUsers.OnlineList>> {
  return safeAction(
    z.object({
      hotelId,
      outletId: z.string().min(1).optional(),
      status: status.optional(),
    }),
    async (input) => onlineUsers.list(await requireUser(), input.hotelId, input),
  )(raw);
}

export async function onlineUsersForceLogoutAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ sessionId: z.string().min(1) }), async (input) => {
    await onlineUsers.forceLogout(await requireUser(), input.sessionId);
    return null;
  })(raw);
}

export async function onlineUsersEndIdleAction(raw: unknown): Promise<Result<{ closed: number }>> {
  return safeAction(z.object({ hotelId }), async (input) => ({
    closed: await onlineUsers.endIdle(await requireUser(), input.hotelId),
  }))(raw);
}
