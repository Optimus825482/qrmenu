"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction, type Result } from "@/lib/result";
import { tableAssignments } from "../server/tableAssignments";
import { orders } from "../server/orders";

const id = z.string().min(1);
const pair = z.object({ tableId: id, userId: id });
export async function assignTableAction(tableId: string, userId: string): Promise<Result<null>> {
  return safeAction(pair, async (input) => { await tableAssignments.assign(await requireUser(), input); return null; })({ tableId, userId });
}
export async function unassignTableAction(tableId: string): Promise<Result<null>> {
  return safeAction(id, async (input) => { await tableAssignments.unassign(await requireUser(), input); return null; })(tableId);
}
export async function bulkAssignAction(outletId: string, pairs: { tableId: string; userId: string }[]): Promise<Result<null>> {
  return safeAction(z.object({ outletId: id, pairs: z.array(pair).min(1) }), async (input) => { await tableAssignments.bulkAssign(await requireUser(), input.outletId, input.pairs); return null; })({ outletId, pairs });
}
/** Task 12 replaces this compatible outlet-scoped data source with the KPI table-board projection. */
export async function listTableBoardAction(outletId: string): Promise<Result<Awaited<ReturnType<typeof orders.listForOutlet>>>> {
  return safeAction(id, async (input) => orders.listForOutlet(await requireUser(), input))(outletId);
}
export async function listMyTablesAction(): Promise<Result<Awaited<ReturnType<typeof tableAssignments.myTables>>>> {
  return safeAction(z.unknown(), async () => tableAssignments.myTables(await requireUser()))(undefined);
}
export async function listMyOpenOrdersAction(outletId: string): Promise<Result<Awaited<ReturnType<typeof orders.listForOutlet>>>> {
  return safeAction(id, async (input) => orders.listForOutlet(await requireUser(), input, { statuses: ["ONAYLANDI", "HAZIR"] }))(outletId);
}
