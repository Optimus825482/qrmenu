import type { ReportDef } from "@/modules/reporting/server/types";
import { MENU_REPORTS } from "./menu";
import { dnd } from "./minibar/dnd";
import { doluluk } from "./minibar/doluluk";
import { gorevPerformans } from "./minibar/gorevPerformans";
import { gunSonu } from "./minibar/gunSonu";
import { merkezOzet } from "./merkezOzet";
import { mybar } from "./minibar/mybar";
import { mybarDegisim } from "./minibar/mybarDegisim";
import { tuketim } from "./minibar/tuketim";
import { zimmetDurum } from "./minibar/zimmetDurum";
import { manuelKayit } from "./minibar/manuelKayit";
import { ilaveTalep } from "./minibar/ilaveTalep";
import { mmd } from "./minibar/mmd";
import { zimmetHareket } from "./minibar/zimmetHareket";

/**
 * Every built-in report, in catalogue order. T3–T5 add their definitions here (one file per
 * report under `reports/`, built with `defineReport`); the registry loads this list on first use.
 */
export const BUILTIN_REPORTS: ReportDef[] = [merkezOzet, tuketim, gunSonu, zimmetDurum, zimmetHareket, gorevPerformans, dnd, mybar, mybarDegisim, doluluk, manuelKayit, ilaveTalep, mmd, ...MENU_REPORTS];
