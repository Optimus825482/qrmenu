// Shared plumbing of the replay sources: the source contract and keyset paging that always ends a page on a
// complete millisecond, so the events of one instant are sorted together and never split over two pages.
import type { Ctx } from "@/lib/auth";
import { compareRadarEvents } from "../../../events";
import type { RadarEvent, RadarLayer } from "../../../types";
import { PAGE, type ReplayQuery } from "../limits";

export type ReplaySourceArgs = ReplayQuery & {
  ctx: Ctx;
  layers: RadarLayer[];
  /** Page size; tests lower it to cross page boundaries cheaply. */
  page?: number;
};

export type ReplaySource = (q: ReplaySourceArgs) => AsyncIterable<RadarEvent>;

/** Time range of one fetch: exactly one of `gt` / `gte`, always `lte`. Doubles as a Prisma DateTime filter. */
export type TimeRange = { gt?: Date; gte?: Date; lte: Date };

export function rangeOf(q: ReplayQuery): TimeRange {
  return q.cursor ? { gte: q.cursor.at, lte: q.to } : { gt: q.from, lte: q.to };
}

export const hasLayer = (q: ReplaySourceArgs, layer: RadarLayer): boolean => q.layers.includes(layer);

/**
 * Pages `fetch` (rows ordered by `at`, then id) with a keyset on `at`. A page that filled up drops its trailing
 * instant and refetches it with the next page, so every emitted instant is complete and `compareRadarEvents`
 * order holds across pages. An instant larger than a page is fetched whole.
 */
export async function* pagedEvents<R extends { at: Date }>(
  q: ReplaySourceArgs,
  fetch: (range: TimeRange, take: number | undefined) => Promise<R[]>,
  map: (row: R) => RadarEvent[],
): AsyncGenerator<RadarEvent> {
  const page = Math.max(2, q.page ?? PAGE);
  let range = rangeOf(q);
  for (;;) {
    const rows = await fetch(range, page);
    if (rows.length < page) {
      for (const e of rows.flatMap(map).sort(compareRadarEvents)) yield e;
      return;
    }
    const lastAt = rows[rows.length - 1]!.at;
    const complete = rows.filter((r) => r.at.getTime() < lastAt.getTime());
    if (complete.length === 0) {
      // One instant fills a whole page: take all of it at once, then move on.
      const same = await fetch({ gte: lastAt, lte: lastAt }, undefined);
      for (const e of same.flatMap(map).sort(compareRadarEvents)) yield e;
      range = { gt: lastAt, lte: q.to };
    } else {
      for (const e of complete.flatMap(map).sort(compareRadarEvents)) yield e;
      range = { gte: lastAt, lte: q.to };
    }
  }
}

/** Prisma time filter without the `undefined` keys of an unused bound. */
export function timeFilter(r: TimeRange): { gt?: Date; gte?: Date; lte: Date } {
  return {
    ...(r.gt ? { gt: r.gt } : {}),
    ...(r.gte ? { gte: r.gte } : {}),
    lte: r.lte,
  };
}

export const iso = (d: Date): string => d.toISOString();
