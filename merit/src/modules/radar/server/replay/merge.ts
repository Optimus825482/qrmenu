// k-way merge of the replay sources by the same total order as the live buffer: (at, SOURCE_RANK, id).
import { compareRadarEvents } from "../../events";
import type { RadarEvent } from "../../types";

/** Every input must already be ordered by `compareRadarEvents`; ties keep the order of `iters`. */
export async function* mergeSources(iters: AsyncIterable<RadarEvent>[]): AsyncGenerator<RadarEvent> {
  const its = iters.map((i) => i[Symbol.asyncIterator]());
  const heads: (RadarEvent | undefined)[] = [];
  try {
    for (const it of its) {
      const r = await it.next();
      heads.push(r.done ? undefined : r.value);
    }
    for (;;) {
      let best = -1;
      for (let i = 0; i < heads.length; i++) {
        const h = heads[i];
        if (h === undefined) continue;
        if (best < 0 || compareRadarEvents(h, heads[best]!) < 0) best = i;
      }
      if (best < 0) return;
      const out = heads[best]!;
      const r = await its[best]!.next();
      heads[best] = r.done ? undefined : r.value;
      yield out;
    }
  } finally {
    // Early exit (cap reached, client gone): close every still-open source.
    await Promise.all(its.map((it) => it.return?.(undefined)));
  }
}
