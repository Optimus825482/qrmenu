import { ZodError, z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError, type FieldErrors } from "@/lib/result";
import { formatDayTr } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { PDF_ROW_LIMIT, SCREEN_ROW_LIMIT, XLSX_ROW_LIMIT } from "@/modules/reporting/constants";
import { getReport } from "@/modules/reporting/server/registry";
import { renderPdf } from "@/modules/reporting/server/render/pdf";
import { renderXlsx } from "@/modules/reporting/server/render/xlsx";
import { resolveScope } from "@/modules/reporting/server/scope";
import type { ReportDef, ReportResult, ReportScope } from "@/modules/reporting/server/types";

export type ExportFormat = "xlsx" | "pdf";
export type ExportFile = { filename: string; contentType: string; data: Buffer };

const CONTENT_TYPE: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};
const EXPORT_LIMIT: Record<ExportFormat, number> = { xlsx: XLSX_ROW_LIMIT, pdf: PDF_ROW_LIMIT };

function findReport(key: string): ReportDef {
  const def = getReport(key);
  if (!def) throw new DomainError("NOT_FOUND", "Rapor bulunamadı");
  return def;
}

function parseParams(def: ReportDef, scope: ReportScope, raw: unknown): unknown {
  const schema = def.paramsSchema ?? z.object({});
  const input = { ...((raw ?? {}) as Record<string, unknown>) };
  // Self-service: whatever user the request names, the report runs for the caller only.
  if (scope.selfUserId && "userId" in input) input.userId = scope.selfUserId;
  try {
    return schema.parse(input);
  } catch (err) {
    if (!(err instanceof ZodError)) throw err;
    const fieldErrors: FieldErrors = {};
    for (const issue of err.issues) (fieldErrors[["params", ...issue.path].join(".")] ??= []).push(issue.message);
    throw new DomainError("VALIDATION", "Rapor süzgeçleri geçersiz", { fieldErrors });
  }
}

async function echo(def: ReportDef, scope: ReportScope, params: unknown, hotels: { name: string }[]): Promise<string[]> {
  const lines = [`Otel: ${hotels.map((h) => h.name).join(", ")}`];
  if (def.dateMode === "range") {
    lines.push(
      scope.from === scope.to
        ? `Tarih: ${formatDayTr(scope.from)}`
        : `Tarih: ${formatDayTr(scope.from)} – ${formatDayTr(scope.to)}`,
    );
  } else if (def.dateMode === "asOf") {
    lines.push(`Tarih: ${formatDayTr(scope.to)}`);
  }
  if (scope.outletId) {
    const outlet = await prisma.outlet.findUnique({ where: { id: scope.outletId }, select: { name: true } });
    if (outlet) lines.push(`Outlet: ${outlet.name}`);
  }
  if (scope.selfUserId) lines.push("Kapsam: yalnız kendi kayıtlarınız");
  const values = (params ?? {}) as Record<string, unknown>;
  for (const field of def.paramFields) {
    const value = values[field.name];
    if (value === undefined || value === null || value === "" || field.name === "userId") continue;
    const shown =
      field.type === "boolean"
        ? value ? "Evet" : "Hayır"
        : (field.options?.find((o) => o.value === String(value))?.label ?? String(value));
    lines.push(`${field.label}: ${shown}`);
  }
  return lines;
}

/**
 * Runs an already-authorised scope. Internal path WITHOUT permission checks: only scheduled
 * e-mail jobs call it directly; interactive callers go through `runReport`/`exportReport`.
 */
export async function executeReport(def: ReportDef, scope: ReportScope, rawParams: unknown): Promise<ReportResult> {
  const params = parseParams(def, scope, rawParams);
  const body = await def.run(scope, params);
  const truncated = body.truncated || body.rows.length > scope.limit;
  const rows = body.rows.length > scope.limit ? body.rows.slice(0, scope.limit) : body.rows;
  const hotels = await prisma.hotel.findMany({
    where: { id: { in: scope.hotelIds } },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
  return {
    ...body,
    rows,
    truncated,
    key: def.key,
    title: def.title,
    generatedAt: new Date(),
    hotels,
    from: scope.from,
    to: scope.to,
    paramsEcho: await echo(def, scope, params, hotels),
  };
}

/** Interactive run: unknown key → NOT_FOUND "Rapor bulunamadı"; scope via `resolveScope`. */
export async function runReport(
  ctx: Ctx,
  key: string,
  input: unknown,
  opts: { limit?: number } = {},
): Promise<ReportResult> {
  const def = findReport(key);
  const scope = await resolveScope(ctx, def, input, opts.limit ?? SCREEN_ROW_LIMIT);
  return executeReport(def, scope, (input as { params?: unknown } | null)?.params);
}

const safeName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");

/** `rapor-<key>-<from>_<to>.<ext>`, ASCII `[a-z0-9_-]` only. */
export function exportFilename(result: Pick<ReportResult, "key" | "from" | "to">, format: ExportFormat): string {
  return `rapor-${safeName(result.key)}-${safeName(result.from)}_${safeName(result.to)}.${format}`;
}

/** Excel/PDF export with the format's row limit; every export is audited (`REPORT_EXPORT`). */
export async function exportReport(ctx: Ctx, key: string, input: unknown, format: ExportFormat): Promise<ExportFile> {
  const result = await runReport(ctx, key, input, { limit: EXPORT_LIMIT[format] });
  const data = format === "xlsx" ? await renderXlsx(result) : await renderPdf(result);
  await audit(prisma, {
    userId: ctx.user.id,
    hotelId: ctx.session.hotelId,
    action: "REPORT_EXPORT",
    entity: "Report",
    entityId: result.key,
    after: {
      format,
      hotelIds: result.hotels.map((h) => h.id),
      from: result.from,
      to: result.to,
      rows: result.rows.length,
      truncated: result.truncated,
    },
  });
  return { filename: exportFilename(result, format), contentType: CONTENT_TYPE[format], data };
}
