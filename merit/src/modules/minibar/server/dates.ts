import { fromZonedTime } from "date-fns-tz";
import { businessDate, businessDateStart, businessDay, TZ } from "@/lib/time";

/** 'yyyy-MM-dd' + n calendar days (pure date arithmetic, no timezone involved). */
export function addDays(day: string, n: number): string {
  const d = businessDay(day); // validates the format
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** [start, end) UTC instants of one Europe/Nicosia business day, for timestamptz range queries. */
export function dayRange(day: string): { gte: Date; lt: Date } {
  return { gte: businessDateStart(day), lt: businessDateStart(addDays(day, 1)) };
}

/** UTC instant of `HH:mm` Nicosia wall-clock time on a business day; null when the time is malformed. */
export function nicosiaInstant(day: string, hhmm: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return fromZonedTime(`${day}T${String(h).padStart(2, "0")}:${m[2]}:00`, TZ);
}

/** Nicosia business day ('yyyy-MM-dd') of a Date. */
export const dayOf = (d: Date = new Date()): string => businessDate(d);
