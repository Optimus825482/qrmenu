"use server";

import { requireUser } from "@/lib/auth";
import { safeAction, type Result } from "@/lib/result";
import { kpiRequestSchema, kpis, type KpiResponse } from "../radar/kpi";

/** Server Action behind the KPI chips: `{ scope: 'total' | 'hotel' | 'outlet', hotelId?, outletId? }`. */
export async function radarAction(raw: unknown): Promise<Result<KpiResponse>> {
  return safeAction(kpiRequestSchema, async (input) => kpis(await requireUser(), input))(raw);
}
