import type { ReportDef } from "@/modules/reporting/server/types";
import { MENU_REPORTS } from "./menu";
import { gunSonu } from "./minibar/gunSonu";
import { merkezOzet } from "./merkezOzet";
import { tuketim } from "./minibar/tuketim";
import { zimmetDurum } from "./minibar/zimmetDurum";
import { zimmetHareket } from "./minibar/zimmetHareket";

/**
 * Every built-in report, in catalogue order. T3–T5 add their definitions here (one file per
 * report under `reports/`, built with `defineReport`); the registry loads this list on first use.
 */
export const BUILTIN_REPORTS: ReportDef[] = [merkezOzet, tuketim, gunSonu, zimmetDurum, zimmetHareket, ...MENU_REPORTS];
