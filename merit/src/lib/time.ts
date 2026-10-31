import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Hotel business-day timezone (design spec §10). */
export const TZ = "Europe/Nicosia";

/** Business day ('yyyy-MM-dd') that the instant `d` falls on in Europe/Nicosia. */
export function businessDate(d: Date = new Date()): string {
  return formatInTimeZone(d, TZ, "yyyy-MM-dd");
}

/**
 * UTC instant of 00:00 Nicosia time on the given business day ('yyyy-MM-dd').
 * Use for range queries on timestamptz columns. Do NOT write it into a @db.Date column:
 * Prisma stores the instant's UTC date, which is the previous day (use businessDay for that).
 */
export function businessDateStart(day: string): Date {
  return fromZonedTime(`${day}T00:00:00`, TZ);
}

/**
 * Value to pass to any @db.Date field (Order.businessDate, RoomDnd.date, DailyTask.date, ...):
 * UTC midnight of the given business day ('yyyy-MM-dd'). businessDateStart = instant for
 * range queries on timestamptz columns; businessDay = value for @db.Date columns.
 */
export function businessDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** The current instant. Dates are absolute; render with `TZ` where wall-clock time is needed. */
export function nowNicosia(): Date {
  return new Date();
}
