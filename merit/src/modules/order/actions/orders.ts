"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction, type Result } from "@/lib/result";
import { approvals } from "../server/approvals";
import { orders } from "../server/orders";

const id = z.string().min(1);
const reason = z.string().trim().min(1).max(500);

export async function approveOrderAction(orderId: string): Promise<Result<null>> {
  return safeAction(id, async (input) => { await orders.transition(await requireUser(), input, "ONAYLANDI"); return null; })(orderId);
}
export async function rejectOrderAction(orderId: string, value: string): Promise<Result<null>> {
  return safeAction(z.object({ orderId: id, reason }), async (input) => { await orders.transition(await requireUser(), input.orderId, "REDDEDILDI", { reason: input.reason }); return null; })({ orderId, reason: value });
}
export async function markServedAction(orderId: string): Promise<Result<null>> {
  return safeAction(id, async (input) => { await orders.transition(await requireUser(), input, "SERVIS_EDILDI"); return null; })(orderId);
}
export async function cancelOrderAction(orderId: string, value: string): Promise<Result<null>> {
  return safeAction(z.object({ orderId: id, reason }), async (input) => { await orders.transition(await requireUser(), input.orderId, "IPTAL", { reason: input.reason }); return null; })({ orderId, reason: value });
}
export async function startPrepAction(orderId: string): Promise<Result<null>> {
  return safeAction(id, async (input) => { await orders.startPrep(await requireUser(), input); return null; })(orderId);
}
export async function markReadyAction(orderId: string): Promise<Result<null>> {
  return safeAction(id, async (input) => { await orders.transition(await requireUser(), input, "HAZIR"); return null; })(orderId);
}
export async function listQueueAction(outletId: string) {
  return safeAction(id, async (input) => {
    const ctx = await requireUser();
    const queue = await approvals.visibleQueue(ctx, input);
    return Promise.all(queue.map(async (order) => ({ ...order, canApprove: await approvals.canApproveOrder(ctx, order) })));
  })(outletId);
}
