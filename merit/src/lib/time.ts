import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { DomainError } from "@/lib/result";

/** Hotel business-day timezone (design spec §10). */
export const TZ = "Europe/Nicosia";

/** Business day ('yyyy-MM-dd') that the instant `d` falls on in Europe/Nicosia. */
export function businessDate(d: Date = new Date()): string {
  return formatInTimeZone(d, TZ, "yyyy-MM-dd");
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Throws VALIDATION unless `day` is a real calendar date written 'yyyy-MM-dd'. */
function assertDay(day: string): void {
  const m = DAY_RE.exec(day);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d) {
      return;
    }
  }
  throw new DomainError("VALIDATION", "Geçersiz tarih: yyyy-MM-dd biçiminde bir gün gerekli");
}

/**
 * UTC instant of 00:00 Nicosia time on the given business day ('yyyy-MM-dd').
 * Use for range queries on timestamptz columns. Do NOT write it into a @db.Date column:
 * Prisma stores the instant's UTC date, which is the previous day (use businessDay for that).
 */
export function businessDateStart(day: string): Date {
  assertDay(day);
  return fromZonedTime(`${day}T00:00:00`, TZ);
}

/**
 * Value to pass to any @db.Date field (Order.businessDate, RoomDnd.date, DailyTask.date, ...):
 * UTC midnight of the given business day ('yyyy-MM-dd'). businessDateStart = instant for
 * range queries on timestamptz columns; businessDay = value for @db.Date columns.
 */
export function businessDay(day: string): Date {
  assertDay(day);
  return new Date(`${day}T00:00:00.000Z`);
}

/** The current instant. Dates are absolute; render with `TZ` where wall-clock time is needed. */
export function nowNicosia(): Date {
  return new Date();
}

/**
 * Business day ('yyyy-MM-dd', or the ISO instant of its UTC-midnight `@db.Date` value) as the
 * Turkish 'dd.MM.yyyy' label. Instants that are not a day stamp are read in Europe/Nicosia.
 */
export function formatDayTr(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/.exec(value);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatInTimeZone(parsed, TZ, "dd.MM.yyyy");
}
