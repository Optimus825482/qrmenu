// The NDJSON line stream of a day replay: the state at the window start, then every event of the window in
// (at, SOURCE_RANK, id) order, ended by `end`; a day larger than the cap ends with `more` + `end` instead.
import type { Ctx } from "@/lib/auth";
import type { RadarEvent, RadarLayer, RadarSnapshot } from "../../types";
import { radarSnapshot } from "../snapshot";
import { MAX_EVENTS, formatCursor, type ReplayQuery } from "./limits";
import { mergeSources } from "./merge";
import { mybarSource } from "./sources/mybar";
import { ordersSource } from "./sources/orders";
import type { ReplaySource } from "./sources/paging";
import { printSource } from "./sources/print";
import { roomsSource } from "./sources/rooms";
import { staffSource } from "./sources/staff";
import { stockSource } from "./sources/stock";
import { tablesSource } from "./sources/tables";

export type ReplayLine =
  | { kind: "snapshot"; at: string; state: RadarSnapshot }
  | { kind: "event"; e: RadarEvent }
  | { kind: "more"; nextFrom: string; cursor: string }
  | { kind: "end"; count: number };

export const REPLAY_SOURCES: readonly ReplaySource[] = [
  ordersSource,
  tablesSource,
  printSource,
  roomsSource,
  mybarSource,
  stockSource,
  staffSource,
];

export type ReplayOptions = {
  /** Event cap per response (default `MAX_EVENTS`); tests lower it. */
  maxEvents?: number;
  /** Source page size (default `PAGE`); tests lower it. */
  page?: number;
};

/**
 * First line: `radarSnapshot` at the window start (not sent on a continuation: the client keeps its state).
 * Then the merged events; the response stops after `maxEvents` and, when more follow, says where to resume.
 */
export async function* replayLines(
  ctx: Ctx,
  q: ReplayQuery,
  layers: RadarLayer[],
  opts: ReplayOptions = {},
): AsyncGenerator<ReplayLine> {
  const max = opts.maxEvents ?? MAX_EVENTS;
  if (!q.cursor) {
    const state = await radarSnapshot(ctx, q.hotelId, { asOf: q.from });
    yield { kind: "snapshot", at: q.from.toISOString(), state };
  }

  const merged = mergeSources(
    REPLAY_SOURCES.map((source) => source({ ...q, ctx, layers, ...(opts.page ? { page: opts.page } : {}) })),
  );
  const cursor = q.cursor;
  const cursorMs = cursor?.at.getTime() ?? 0;
  let skipping = cursor !== undefined;
  let held: RadarEvent[] = [];
  let count = 0;
  let last: RadarEvent | undefined;

  const emit = (e: RadarEvent): ReplayLine | undefined => {
    if (!layers.includes(e.layer)) return undefined; // defence in depth; the sources already filter
    return { kind: "event", e };
  };

  try {
    for await (const e of merged) {
      const pending: RadarEvent[] = [];
      if (skipping && cursor) {
        const t = Date.parse(e.at);
        if (t < cursorMs) continue;
        if (t === cursorMs) {
          // Skip the events of the cursor instant up to and including the cursor event itself.
          if (e.id === cursor.id) {
            skipping = false;
            held = [];
          } else held.push(e);
          continue;
        }
        // The cursor event vanished (deleted row): keep the same-instant events that sort after its id.
        skipping = false;
        pending.push(...held.filter((h) => h.id > cursor.id));
        held = [];
      }
      pending.push(e);
      for (const p of pending) {
        if (count >= max) {
          const at = last!.at;
          yield { kind: "more", nextFrom: at, cursor: formatCursor(at, last!.id) };
          yield { kind: "end", count };
          return;
        }
        const line = emit(p);
        if (!line) continue;
        yield line;
        count++;
        last = p;
      }
    }
    // The cursor event vanished and nothing came after its instant: still hand out the later same-instant events.
    if (skipping && cursor) {
      for (const h of held.filter((x) => x.id > cursor.id)) {
        if (count >= max) break;
        const line = emit(h);
        if (!line) continue;
        yield line;
        count++;
      }
    }
  } finally {
    await merged.return(undefined);
  }
  yield { kind: "end", count };
}
