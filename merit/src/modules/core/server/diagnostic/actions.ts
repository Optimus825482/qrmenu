"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { ok, safeAction, type ResultError } from "@/lib/result";
import {
  clearResolvedIncidents,
  listDiagnosticIncidents,
  resolveDiagnosticIncident,
  runSelfDiagnostics,
  sendDeveloperAlertMail,
} from "./diagnosticService";
import { readServerResources, type ServerResources } from "./serverResources";
import type {
  DiagnosticIncidentData,
  DiagnosticIncidentRow,
  DiagnosticModule,
  DiagnosticSeverity,
  SystemHealthReport,
} from "./types";

const SCREEN = "CR-SYS";

const querySchema = z.object({
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  module: z
    .enum(["CORE", "DATABASE", "AUTH", "MINIBAR", "QR_ORDER", "QR_MENU", "ROOM_SERVICE", "MAIL", "DRIVE", "NETWORK"])
    .optional(),
  resolved: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const resolveSchema = z.object({
  id: z.string().min(1),
  note: z.string().max(500).optional(),
});

const testAlertSchema = z.object({
  email: z.string().email("Geçerli bir e-posta adresi girin").optional(),
});

/**
 * Runs live system self-diagnostics and returns a comprehensive health report.
 */
export async function getSystemHealthAction(): Promise<{ ok: true; data: SystemHealthReport } | { ok: false; error: ResultError }> {
  return safeAction(z.undefined(), async () => {
    const ctx = await requireUser();
    await assertCan(ctx, SCREEN, "V");
    return runSelfDiagnostics();
  })(undefined);
}

/**
 * Lists diagnostic incidents and system errors recorded in database.
 */
export async function listDiagnosticIncidentsAction(
  raw: unknown,
): Promise<{ ok: true; data: DiagnosticIncidentRow[] } | { ok: false; error: ResultError }> {
  return safeAction(querySchema, async (query) => {
    const ctx = await requireUser();
    await assertCan(ctx, SCREEN, "V");
    return listDiagnosticIncidents({
      severity: query.severity as DiagnosticSeverity,
      module: query.module as DiagnosticModule,
      resolved: query.resolved,
      limit: query.limit,
    });
  })(raw);
}

/**
 * Marks a diagnostic incident as resolved.
 */
export async function resolveDiagnosticIncidentAction(
  raw: unknown,
): Promise<{ ok: true; data: boolean } | { ok: false; error: ResultError }> {
  return safeAction(resolveSchema, async (input) => {
    const ctx = await requireUser();
    await assertCan(ctx, SCREEN, "D");
    return resolveDiagnosticIncident(input.id, input.note, ctx.user.fullName);
  })(raw);
}

/**
 * Clears old resolved diagnostic logs from database.
 */
export async function clearResolvedIncidentsAction(): Promise<{ ok: true; data: number } | { ok: false; error: ResultError }> {
  return safeAction(z.undefined(), async () => {
    const ctx = await requireUser();
    await assertCan(ctx, SCREEN, "D");
    return clearResolvedIncidents();
  })(undefined);
}

/**
 * Manually runs comprehensive diagnostic probe suite on demand.
 */
export async function triggerManualDiagnosticAction(): Promise<{ ok: true; data: SystemHealthReport } | { ok: false; error: ResultError }> {
  return safeAction(z.undefined(), async () => {
    const ctx = await requireUser();
    await assertCan(ctx, SCREEN, "V");
    return runSelfDiagnostics();
  })(undefined);
}

/**
 * Sends a sample test diagnostic alert email to developer to verify delivery channel.
 */
export async function sendTestDiagnosticAlertAction(
  raw: unknown,
): Promise<{ ok: true; data: { sent: boolean; recipient?: string; error?: string } } | { ok: false; error: ResultError }> {
  return safeAction(testAlertSchema, async (input) => {
    const ctx = await requireUser();
    await assertCan(ctx, SCREEN, "O");

    const sampleIncident: DiagnosticIncidentData = {
      errorId: "TEST-" + Math.random().toString(36).substring(2, 6).toUpperCase(),
      module: "CORE",
      severity: "HIGH",
      errorName: "DiagnosticChannelVerification",
      errorMessage: "Sistem Teşhis & Bildirim Kanalı Test Doğrulaması",
      stackTrace: `Error: DiagnosticChannelVerification\n    at sendTestDiagnosticAlertAction (actions.ts:88)\n    at Object.test (diagnosticService.ts)`,
      rootCause: "Sistem Yöneticisi tarafından manuel olarak tetiklenen self-diagnostic test bildirimi.",
      recommendation: "Bu bir doğrulama mesajıdır; e-posta bildirim boru hattının ve SMTP servisinin hatasız çalıştığını gösterir.",
      context: {
        action: "TEST_ALERT",
        userId: ctx.user.id,
        screenCode: SCREEN,
      },
      metrics: {
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uptimeSeconds: Math.round(process.uptime()),
      },
      mailSent: false,
      resolved: true,
    };

    const res = await sendDeveloperAlertMail(sampleIncident);
    return {
      sent: res.ok,
      recipient: input.email,
      error: res.error,
    };
  })(raw);
}

/** Live CPU, memory, disk and database figures (cheap constant-time reads, cached for a few seconds). */
export async function getServerResourcesAction(): Promise<{ ok: true; data: ServerResources } | { ok: false; error: ResultError }> {
  return safeAction(z.undefined(), async () => {
    const ctx = await requireUser();
    await assertCan(ctx, SCREEN, "V");
    return readServerResources();
  })(undefined);
}
