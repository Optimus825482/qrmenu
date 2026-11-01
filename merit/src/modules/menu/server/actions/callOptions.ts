"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import * as callOptions from "../callOptions";

const id = z.string().min(1);

export async function listCallOptionsAction(
  raw: unknown,
): Promise<Result<{ options: callOptions.CallOptionRow[]; canWrite: boolean }>> {
  return safeAction(z.object({ outletId: id }), async ({ outletId }) => {
    const ctx = await requireUser();
    const options = await callOptions.list(ctx, outletId);
    return { options, canWrite: await callOptions.canWrite(ctx, outletId) };
  })(raw);
}

export async function saveCallOptionAction(raw: unknown): Promise<Result<callOptions.CallOptionRow>> {
  return safeAction(
    z.object({
      outletId: id,
      option: z.object({
        id: z.string().optional(),
        label: z.string(),
        translations: z.record(z.string(), z.string()).optional(),
        callType: z.enum(["GARSON", "HESAP", "DIGER"] as const),
        isActive: z.boolean().optional(),
      }),
    }),
    async ({ outletId, option }) => {
      const ctx = await requireUser();
      return await callOptions.save(ctx, outletId, option);
    },
  )(raw);
}

export async function reorderCallOptionsAction(raw: unknown): Promise<Result<null>> {
  return safeAction(
    z.object({
      outletId: id,
      orderedIds: z.array(z.string().min(1)),
    }),
    async ({ outletId, orderedIds }) => {
      const ctx = await requireUser();
      await callOptions.reorder(ctx, outletId, orderedIds);
      return null;
    },
  )(raw);
}

export async function removeCallOptionAction(raw: unknown): Promise<Result<null>> {
  return safeAction(z.object({ id }), async ({ id: optionId }) => {
    const ctx = await requireUser();
    await callOptions.remove(ctx, optionId);
    return null;
  })(raw);
}
