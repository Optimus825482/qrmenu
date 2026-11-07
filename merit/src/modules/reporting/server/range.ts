import { DomainError } from "@/lib/result";
import { businessDate, businessDateStart, businessDay } from "@/lib/time";
import { MAX_RANGE_DAYS } from "@/modules/reporting/constants";

export type DayRange = { start: Date; end: Date; dayFrom: Date; dayTo: Date };

const DAY_MS = 86_400_000;

function nextDay(day: string): string {
  return new Date(businessDay(day).getTime() + DAY_MS).toISOString().slice(0, 10);
}

function checkDay(day: string, field: "from" | "to"): void {
  try {
    businessDay(day);
  } catch {
    throw new DomainError("VALIDATION", "Geçersiz tarih: yyyy-MM-dd biçiminde bir gün gerekli", {
      fieldErrors: { [field]: ["Geçersiz tarih"] },
    });
  }
}

/**
 * Closed business-day interval [from, to] in Europe/Nicosia: `start`/`end` for timestamptz
 * columns (`gte`/`lt`), `dayFrom`/`dayTo` for `@db.Date` columns (`gte`/`lte`).
 */
export function dayRange(from: string, to: string): DayRange {
  checkDay(from, "from");
  checkDay(to, "to");
  const dayFrom = businessDay(from);
  const dayTo = businessDay(to);
  if (dayFrom > dayTo) {
    throw new DomainError("VALIDATION", "Başlangıç tarihi bitişten sonra olamaz", {
      fieldErrors: { from: ["Başlangıç tarihi bitişten sonra olamaz"] },
    });
  }
  if ((dayTo.getTime() - dayFrom.getTime()) / DAY_MS + 1 > MAX_RANGE_DAYS) {
    const message = `Tarih aralığı en çok ${MAX_RANGE_DAYS} gün olabilir`;
    throw new DomainError("VALIDATION", message, { fieldErrors: { to: [message] } });
  }
  return { start: businessDateStart(from), end: businessDateStart(nextDay(to)), dayFrom, dayTo };
}

/** Today's business day (Europe/Nicosia), 'yyyy-MM-dd'. */
export const today = (): string => businessDate();
