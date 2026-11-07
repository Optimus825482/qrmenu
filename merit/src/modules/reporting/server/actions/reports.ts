"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { safeAction, type Result } from "@/lib/result";
import { runReport } from "@/modules/reporting/server/run";
import { listReports } from "@/modules/reporting/server/scope";
import type { ReportCatalogItem, ReportResult } from "@/modules/reporting/server/types";

const listSchema = z.object({ hotelId: z.string().min(1).max(64).optional() });
const runSchema = z.object({ key: z.string().min(1).max(40), input: z.unknown() });

/** Reports the caller may run (optionally for one hotel). */
export async function listReportsAction(hotelId?: string): Promise<Result<ReportCatalogItem[]>> {
  return safeAction(listSchema, async (i) => listReports(await requireUser(), i.hotelId))({ hotelId });
}

/** On-screen run (SCREEN_ROW_LIMIT rows); `input` is a `ReportRequest`. */
export async function runReportAction(key: string, input: unknown): Promise<Result<ReportResult>> {
  return safeAction(runSchema, async (i) => runReport(await requireUser(), i.key, i.input))({ key, input });
}
