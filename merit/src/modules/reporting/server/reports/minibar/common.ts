import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { ReportScope } from "@/modules/reporting/server/types";

/** Currency amounts are stored with 2 decimals; float sums are rounded back. */
export const money = (n: number): number => Math.round(n * 100) / 100;

/** One decimal (minutes, averages). */
export const oneDecimal = (n: number): number => Math.round(n * 10) / 10;

/** `yyyy-MM-dd` of a `@db.Date` value. */
export const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/** Empty form values count as "not given". */
export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

/** Optional id / free text parameter. */
export const optId = optional(z.string().max(64));

/** Boolean parameter that also accepts the "true"/"1" strings of an export URL. */
export const boolParam = z.preprocess(
  (v) => (typeof v === "string" ? v === "true" || v === "1" : v),
  z.boolean().optional().default(false),
);

/** Escapes `%`, `_` and `\` so user text is matched literally inside ILIKE. */
export const likePattern = (q: string): string => `%${q.replace(/[\\%_]/g, (ch) => "\\" + ch)}%`;

/** Truncates the fetched `limit+1` rows to `limit` and flags the overflow. */
export function capRows<T>(rows: T[], scope: Pick<ReportScope, "limit">): { rows: T[]; truncated: boolean } {
  return { rows: rows.slice(0, scope.limit), truncated: rows.length > scope.limit };
}

export const inList = (ids: string[]): Prisma.Sql => Prisma.join(ids);

export const NICOSIA_DAY = Prisma.sql`to_char((t.occurred_at AT TIME ZONE 'Europe/Nicosia')::date, 'YYYY-MM-DD')`;

/** Days 'yyyy-MM-dd' of the closed interval [from, to]. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
