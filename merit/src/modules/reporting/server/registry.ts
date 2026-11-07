import { BUILTIN_REPORTS } from "@/modules/reporting/server/reports";
import type { ReportDef } from "@/modules/reporting/server/types";

const KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reports = new Map<string, ReportDef>();
let builtinsLoaded = false;

function loadBuiltins(): void {
  if (builtinsLoaded) return;
  builtinsLoaded = true;
  for (const def of BUILTIN_REPORTS) if (!reports.has(def.key)) reports.set(def.key, def);
}

/** Adds (or, in tests, replaces) a report definition. */
export function registerReport(def: ReportDef): void {
  if (!KEY_RE.test(def.key) || def.key.length > 40) throw new Error(`Geçersiz rapor anahtarı: ${def.key}`);
  loadBuiltins();
  reports.set(def.key, def);
}

export function getReport(key: string): ReportDef | undefined {
  loadBuiltins();
  return reports.get(key);
}

/** Registration order (built-ins first). */
export function allReports(): ReportDef[] {
  loadBuiltins();
  return [...reports.values()];
}

/** Tests only: drops a report added with `registerReport`. */
export function unregisterReport(key: string): void {
  reports.delete(key);
}
