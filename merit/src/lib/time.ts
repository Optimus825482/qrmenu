import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Hotel business-day timezone (design spec §10). */
export const TZ = "Europe/Nicosia";

/** Business day ('yyyy-MM-dd') that the instant `d` falls on in Europe/Nicosia. */
export function businessDate(d: Date = new Date()): string {
  return formatInTimeZone(d, TZ, "yyyy-MM-dd");
}

/** UTC instant of 00:00 Nicosia time on the given business day ('yyyy-MM-dd'). */
export function businessDateStart(day: string): Date {
  return fromZonedTime(`${day}T00:00:00`, TZ);
}

/** The current instant. Dates are absolute; render with `TZ` where wall-clock time is needed. */
export function nowNicosia(): Date {
  return new Date();
}
