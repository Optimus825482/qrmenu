import type { ParamField, ReportCatalogItem } from "@/modules/reporting/server/types";

export type ParamValue = string | boolean;
export type Filters = {
  hotelIds: string[];
  from: string;
  to: string;
  outletId: string;
  params: Record<string, ParamValue>;
};
export type ExportFormat = "xlsx" | "pdf";

/** Fields the user can fill: a self-service run is pinned to the caller, so `userId` is hidden. */
export function visibleParamFields(item: ReportCatalogItem): readonly ParamField[] {
  return item.mode === "SELF" ? item.paramFields.filter((f) => f.name !== "userId") : item.paramFields;
}

export function defaultParams(item: ReportCatalogItem): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const f of item.paramFields) {
    if (f.default !== undefined) out[f.name] = f.default;
    else if (f.type === "boolean") out[f.name] = false;
  }
  return out;
}

/** Request body of `runReportAction`; empty text params are left out, date fields only for `range`. */
export function buildRequest(item: ReportCatalogItem, f: Filters) {
  const params: Record<string, string | boolean> = {};
  for (const field of visibleParamFields(item)) {
    const v = f.params[field.name];
    if (v === undefined || v === "") continue;
    params[field.name] = v;
  }
  return {
    hotelIds: f.hotelIds,
    ...(item.dateMode === "range" ? { from: f.from, to: f.to } : {}),
    ...(item.outletScoped && f.outletId ? { outletId: f.outletId } : {}),
    params,
  };
}

/** `/api/reports/<key>/export?format=…&hotelIds=a,b&from&to[&outletId][&p.<param>=…]`. */
export function buildExportUrl(item: ReportCatalogItem, f: Filters, format: ExportFormat): string {
  const req = buildRequest(item, f);
  const q = new URLSearchParams({ format, hotelIds: req.hotelIds.join(",") });
  if (req.from) q.set("from", req.from);
  if (req.to) q.set("to", req.to);
  if (req.outletId) q.set("outletId", req.outletId);
  for (const [k, v] of Object.entries(req.params)) q.set(`p.${k}`, String(v));
  // URLSearchParams encodes "," as %2C; the route decodes it either way, keep the readable form.
  return `/api/reports/${encodeURIComponent(item.key)}/export?${q.toString().replace(/%2C/g, ",")}`;
}

/** File name from a Content-Disposition header (RFC 5987 form preferred). */
export function filenameFrom(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fall through to the plain form */
    }
  }
  return /filename="?([^";]+)"?/i.exec(header)?.[1] ?? fallback;
}
