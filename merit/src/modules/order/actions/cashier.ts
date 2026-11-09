"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction, type Result } from "@/lib/result";
import { cashier } from "../server/cashier";

const outletId = z.string().min(1);
const recentInput = z.object({ outletId, statuses: z.array(z.string()).optional(), limit: z.number().int().min(1).max(100).optional() });

export async function tableBoardAction(value: string): Promise<Result<Awaited<ReturnType<typeof cashier.tableBoard>>>> {
  return safeAction(outletId, async (id) => cashier.tableBoard(await requireUser(), id))(value);
}

export async function recentOrdersAction(value: z.input<typeof recentInput>): Promise<Result<Awaited<ReturnType<typeof cashier.recentOrders>>>> {
  return safeAction(recentInput, async (input) => cashier.recentOrders(await requireUser(), input.outletId, input))(value);
}

const tableIdSchema = z.string().min(1);

export async function clearTableAction(value: string): Promise<Result<void>> {
  return safeAction(tableIdSchema, async (id) => cashier.clearTable(await requireUser(), id))(value);
}
