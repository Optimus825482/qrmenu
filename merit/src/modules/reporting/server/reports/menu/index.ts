import type { ReportDef } from "@/modules/reporting/server/types";
import { menuDurum } from "./menuDurum";
import { oturum } from "./oturum";
import { qrTarama } from "./qrTarama";
import { rsSla } from "./rsSla";
import { siparisOzet } from "./siparisOzet";
import { siparisSure } from "./siparisSure";
import { siparisUrun } from "./siparisUrun";

/** T5 reports in catalogue order; `reports/index.ts` spreads this into `BUILTIN_REPORTS`. */
export const MENU_REPORTS: ReportDef[] = [qrTarama, menuDurum, siparisOzet, siparisUrun, siparisSure, rsSla, oturum];
