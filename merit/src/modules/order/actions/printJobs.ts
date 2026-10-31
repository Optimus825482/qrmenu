"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { businessDate } from "@/lib/time";
import { printJobs, type QueueJob } from "../server/printJobs";

const id = z.string().min(1);

export async function enqueueTestPrintAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ printerId: id }), async (input) => {
    await printJobs.enqueueTest(await requireUser(), input.printerId);
    return null;
  })(raw);
}

export async function reprintAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ orderId: id }), async (input) => {
    await printJobs.reprint(await requireUser(), input.orderId);
    return null;
  })(raw);
}

/** Today's (Nicosia business day) queue of the session hotel, newest first. */
export async function listTodayQueueAction(): Promise<Result<QueueJob[]>> {
  return safeAction(z.undefined(), async () => {
    const ctx = await requireUser();
    return printJobs.listQueue(ctx, ctx.session.hotelId, { day: businessDate() });
  })(undefined);
}
