"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction, type Result } from "@/lib/result";
import { waiterCalls } from "../server/waiterCalls";

const id = z.string().min(1);
export async function resolveCallAction(callId: string, status: "YANITLANDI" | "KAPANDI"): Promise<Result<null>> {
  return safeAction(z.object({ callId: id, status: z.enum(["YANITLANDI", "KAPANDI"]) }), async (input) => {
    await waiterCalls.resolve(await requireUser(), input.callId, input.status);
    return null;
  })({ callId, status });
}
export async function listOpenCallsAction(outletId: string): Promise<Result<Awaited<ReturnType<typeof waiterCalls.listOpen>>>> {
  return safeAction(id, async (input) => waiterCalls.listOpen(await requireUser(), input))(outletId);
}
