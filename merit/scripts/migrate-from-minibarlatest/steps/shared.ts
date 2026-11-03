import type { StepContext } from "../types";

export type Row = Record<string, unknown>;

export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const idOf = (v: unknown): string => String(v);

export function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

export const req = (name: string) => ({ name, required: true });
export const opt = (name: string) => ({ name });

export interface ReadSpec {
  cols: { name: string; required?: boolean }[];
  key: string[];
  where?: string;
}

/** Reads a whole (small) legacy table; a missing table is a warning and an empty result. */
export async function readAll(ctx: StepContext, table: string, spec: ReadSpec): Promise<Row[]> {
  const out: Row[] = [];
  if (!(await ctx.legacy.tableExists(table))) {
    ctx.report.warn("TABLO_YOK", `Legacy tabloda ${table} yok, boş varsayıldı`, table);
    return out;
  }
  for await (const rows of ctx.legacy.rows<Row>(table, spec)) out.push(...rows);
  return out;
}

/** Streams a large legacy table in keyset batches (never holds the whole table). */
export async function* streamRows(ctx: StepContext, table: string, spec: ReadSpec): AsyncGenerator<Row[]> {
  if (!(await ctx.legacy.tableExists(table))) {
    ctx.report.warn("TABLO_YOK", `Legacy tabloda ${table} yok, boş varsayıldı`, table);
    return;
  }
  yield* ctx.legacy.rows<Row>(table, spec);
}
