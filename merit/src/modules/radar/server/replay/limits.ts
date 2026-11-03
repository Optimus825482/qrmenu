// Query parsing and hard limits of the day replay (spec 3.6): one hotel, one business day inside the retention
// window, a window of at most 24 hours, wall-clock times in Europe/Nicosia.
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { DomainError } from "@/lib/result";
import { TZ, businessDate } from "@/lib/time";

export const MAX_EVENTS = 50_000;
export const PAGE = 2000;

export type ReplayQuery = {
  hotelId: string;
  /** Exclusive start of the window: the first line of the stream is the state at this instant. */
  from: Date;
  /** Inclusive end of the window. */
  to: Date;
  /** Resume after this event (the last event of the previous response). */
  cursor?: { at: Date; id: string };
  /** Business day as asked (yyyy-MM-dd) and the wall-clock texts; kept for the audit record. */
  day: string;
  fromTime: string;
  toTime: string;
};

const DAY_MS = 86_400_000;
const MAX_WINDOW_MS = DAY_MS;
const HOTEL_ID_MAX = 64;
const CURSOR_ID_MAX = 200;

const timeText = z
  .string()
  .regex(/^\d{1,2}:\d{2}(:\d{2})?$/, "Saat HH:mm veya HH:mm:ss biçiminde olmalı");

const rawQuery = z.object({
  hotelId: z.string().min(1, "Otel belirtilmedi").max(HOTEL_ID_MAX, "Otel kimliği geçersiz"),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Gün yyyy-MM-dd biçiminde olmalı"),
  from: timeText,
  to: timeText,
  cursor: z.string().max(CURSOR_ID_MAX + 40, "Geçersiz imleç").optional(),
});

function fail(message: string, field?: string): never {
  throw new DomainError("VALIDATION", message, field ? { fieldErrors: { [field]: [message] } } : {});
}

function dayMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d);
  const probe = new Date(t);
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return fail("Geçersiz gün", "day");
  }
  return t;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Wall-clock `hh:mm[:ss]` of the business day `day` (hours may run past 24 into the next day) as an instant. */
function instantOf(day: string, text: string, field: string): Date {
  const [h, m, s] = text.split(":").map(Number) as [number, number, number | undefined];
  const sec = s ?? 0;
  if (h > 48 || m > 59 || sec > 59 || (h === 48 && (m > 0 || sec > 0))) {
    return fail("Saat geçersiz", field);
  }
  const extraDays = Math.floor(h / 24);
  const date = new Date(dayMs(day) + extraDays * DAY_MS).toISOString().slice(0, 10);
  return fromZonedTime(`${date}T${pad(h % 24)}:${pad(m)}:${pad(sec)}`, TZ);
}

function parseCursor(text: string): { at: Date; id: string } {
  const cut = text.indexOf("|");
  const at = new Date(cut > 0 ? text.slice(0, cut) : "");
  const id = cut > 0 ? text.slice(cut + 1) : "";
  if (Number.isNaN(at.getTime()) || id === "" || id.length > CURSOR_ID_MAX) return fail("Geçersiz imleç", "cursor");
  return { at, id };
}

/**
 * Validates the replay request. Throws `DomainError("VALIDATION")` with a Turkish message; the route answers 400.
 * `from` hours stay below 24 so a window never starts on another day; `to` may reach `24:00` (end of the day)
 * or further (`24:30` is 00:30 the next morning) as long as the window is at most 24 hours.
 */
export function parseReplayQuery(sp: URLSearchParams, now: Date, retentionDays: number): ReplayQuery {
  const parsed = rawQuery.safeParse({
    hotelId: sp.get("hotelId") ?? "",
    day: sp.get("day") ?? "",
    from: sp.get("from") ?? "00:00",
    to: sp.get("to") ?? "24:00",
    cursor: sp.get("cursor") ?? undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    return fail(issue.message, String(issue.path[0] ?? "_"));
  }
  const { hotelId, day, from: fromText, to: toText, cursor } = parsed.data;

  const dayAt = dayMs(day);
  const today = dayMs(businessDate(now));
  if (dayAt > today) return fail("Gelecekteki bir gün oynatılamaz", "day");
  if (dayAt < today - retentionDays * DAY_MS) return fail("Gün saklama süresi dışında", "day");

  if (Number(fromText.split(":")[0]) > 23) return fail("Başlangıç saati 00:00 ile 23:59 arasında olmalı", "from");
  const from = instantOf(day, fromText, "from");
  const to = instantOf(day, toText, "to");
  if (from.getTime() >= to.getTime()) return fail("Başlangıç saati bitişten önce olmalı", "from");
  if (to.getTime() - from.getTime() > MAX_WINDOW_MS) return fail("Pencere en çok 24 saat olabilir", "to");

  const cur = cursor === undefined ? undefined : parseCursor(cursor);
  if (cur && (cur.at.getTime() < from.getTime() || cur.at.getTime() > to.getTime())) {
    return fail("İmleç pencerenin dışında", "cursor");
  }
  return { hotelId, from, to, ...(cur ? { cursor: cur } : {}), day, fromTime: fromText, toTime: toText };
}

/** `<isoAt>|<eventId>`, the form `parseReplayQuery` reads back. */
export function formatCursor(at: string, id: string): string {
  return `${at}|${id}`;
}
