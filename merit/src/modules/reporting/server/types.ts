import { z, type ZodType } from "zod";
import type { ModuleKey } from "@/generated/prisma/client";

/**
 * The 15 catalogue reports of the plan (T3–T5 implement them). The engine accepts any registered
 * kebab-case key, so reference reports (`merkez-ozet`) and test reports live beside these.
 */
export const REPORT_KEYS = [
  "tuketim", "gun-sonu", "zimmet-durum", "zimmet-hareket", "gorev-performans", "dnd", "mybar", "doluluk",
  "qr-tarama", "menu-durum", "siparis-ozet", "siparis-urun", "siparis-sure", "rs-sla", "oturum",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export type ReportGroup = "MINIBAR" | "QR_MENU" | "QR_ORDER" | "ROOM_SERVICE" | "SISTEM";
/** `percent` values are fractions (0.125 = %12,5); `date` = business day; `datetime` = instant. */
export type ColumnType = "text" | "int" | "money" | "percent" | "date" | "datetime" | "minutes";

export type ReportColumn = {
  key: string;
  title: string;
  type: ColumnType;
  /** Relative width (Excel characters; PDF uses it proportionally). Default: from content. */
  width?: number;
  total?: "sum" | "none";
};

/** `date` cells: `yyyy-MM-dd` string or the UTC-midnight `@db.Date` value. */
export type Cell = string | number | Date | null;
export type ReportRow = Record<string, Cell>;

export type ParamField = {
  name: string;
  label: string;
  type: "select" | "text" | "boolean";
  options?: { value: string; label: string }[];
  default?: string | boolean;
};

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tarih yyyy-MM-dd biçiminde olmalı");
const ID = z.string().min(1).max(64);

export const reportRequestSchema = z.object({
  hotelIds: z
    .array(ID)
    .min(1, "En az bir otel seçin")
    .max(10, "En çok 10 otel seçilebilir")
    .transform((ids) => [...new Set(ids)]),
  /** Required for `dateMode: 'range'`; `asOf` reads `to` (or `from`); `none` ignores both. */
  from: DAY.optional(),
  to: DAY.optional(),
  outletId: ID.optional(),
  params: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean()])).default({}),
});
export type ReportRequest = z.input<typeof reportRequestSchema>;
export type ParsedReportRequest = z.output<typeof reportRequestSchema>;

/** Everything a report query may read; resolved and authorised by `resolveScope`. */
export type ReportScope = {
  hotelIds: string[];
  /** Business days 'yyyy-MM-dd', closed interval (asOf/none: from = to). */
  from: string;
  to: string;
  /** timestamptz columns: `gte: start, lt: end`. */
  start: Date;
  end: Date;
  /** `@db.Date` columns: `gte: dayFrom, lte: dayTo`. */
  dayFrom: Date;
  dayTo: Date;
  outletId?: string;
  /** Set for self-service runs: the report must only return this user's records. */
  selfUserId?: string;
  /** Rows the caller shows; fetch at most `fetchCap(scope)` (= limit + 1) so truncation is detectable. */
  limit: number;
};

export type ReportBody = {
  columns: ReportColumn[];
  rows: ReportRow[];
  summary?: { label: string; value: string | number }[];
  truncated: boolean;
};

export interface ReportDef<P = unknown> {
  /** kebab-case, `[a-z0-9-]`; used in URLs and file names. */
  key: string;
  group: ReportGroup;
  title: string;
  description: string;
  moduleKey: ModuleKey;
  /** Screen whose `R` (or `V` for selfService) is required in every selected hotel. */
  screenCode: string;
  dateMode: "range" | "asOf" | "none";
  /** OUTLET/MUTFAK sessions see only outletScoped reports, forced to the session outlet. */
  outletScoped?: boolean;
  /** Runs with `V` alone; then `scope.selfUserId` (and `params.userId`) = the caller. */
  selfService?: boolean;
  paramFields: readonly ParamField[];
  /** Parses `ReportRequest.params`; default `z.object({})` (unknown keys stripped). */
  paramsSchema?: ZodType<P>;
  run(scope: ReportScope, params: P): Promise<ReportBody>;
}

export type ReportResult = ReportBody & {
  key: string;
  title: string;
  generatedAt: Date;
  hotels: { id: string; code: string; name: string }[];
  from: string;
  to: string;
  /** Human-readable filter lines ("Otel: …", "Tarih: …") printed in Excel/PDF headers. */
  paramsEcho: string[];
};

export type ReportCatalogItem = {
  key: string;
  group: ReportGroup;
  title: string;
  description: string;
  mode: "FULL" | "SELF";
  dateMode: ReportDef["dateMode"];
  outletScoped: boolean;
  paramFields: readonly ParamField[];
  /** Hotels (within the request/session scope) the caller may run this report for. */
  hotelIds: string[];
};

export const fetchCap = (scope: Pick<ReportScope, "limit">): number => scope.limit + 1;

/** Erases the params type so typed definitions fit the registry. */
export function defineReport<P>(def: ReportDef<P>): ReportDef {
  return def as unknown as ReportDef;
}
