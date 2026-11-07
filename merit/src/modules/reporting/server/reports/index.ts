import type { ReportDef } from "@/modules/reporting/server/types";
import { merkezOzet } from "./merkezOzet";

/**
 * Every built-in report, in catalogue order. T3–T5 add their definitions here (one file per
 * report under `reports/`, built with `defineReport`); the registry loads this list on first use.
 */
export const BUILTIN_REPORTS: ReportDef[] = [merkezOzet];
