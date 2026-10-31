"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { type Result, safeAction } from "@/lib/result";
import { auditListSchema, type AuditDetail, type AuditRow, exportCsv, get, list } from "../auditLog";
import type { Page } from "../listQuery";

export async function auditLogListAction(raw: unknown): Promise<Result<Page<AuditRow>>> {
  return safeAction(auditListSchema, async (input) => list(await requireUser(), input))(raw);
}

export async function auditLogGetAction(id: string): Promise<Result<AuditDetail>> {
  return safeAction(z.string().min(1).max(100), async (auditId) => get(await requireUser(), auditId))(id);
}

export async function auditLogExportAction(raw: unknown): Promise<Result<{ csv: string }>> {
  return safeAction(auditListSchema, async (input) => ({ csv: await exportCsv(await requireUser(), input) }))(raw);
}
