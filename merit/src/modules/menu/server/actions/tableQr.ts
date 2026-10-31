"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import * as tableQr from "../tableQr";

const id = z.string().min(1);

export async function listTableQrAction(raw: unknown): Promise<Result<tableQr.TableQrRow[]>> {
  return safeAction(z.object({ outletId: id }), async ({ outletId }) =>
    tableQr.list(await requireUser(), outletId),
  )(raw);
}

export async function regenerateTableQrAction(raw: unknown): Promise<Result<tableQr.TableQrRow>> {
  return safeAction(z.object({ tableId: id }), async ({ tableId }) =>
    tableQr.regenerate(await requireUser(), tableId),
  )(raw);
}

export async function regenerateAllTableQrAction(raw: unknown): Promise<Result<{ count: number }>> {
  return safeAction(z.object({ outletId: id, onlyUnsigned: z.boolean().optional() }), async (input) =>
    tableQr.regenerateAll(await requireUser(), input.outletId, { onlyUnsigned: input.onlyUnsigned }),
  )(raw);
}
