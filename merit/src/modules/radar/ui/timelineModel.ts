import type { RadarEvent, RadarLayer } from "../types";

export type Gap = { from: string; to: string };

export type TimelineMark = { x: number; layer: RadarLayer };
export type TimelineBucket = { x: number; n: number };
export type TimelineGapBand = { x: number; w: number; label: string };

export type TimelineModel = {
  marks: TimelineMark[];
  /** 1-minute histogram buckets. */
  histogram: TimelineBucket[];
  /** Striped disconnect bands ("Kesinti 14:02–14:03"). */
  gapBands: TimelineGapBand[];
};

const MIN_MS = 60_000;

const fmtHm = (ms: number): string =>
  new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Nicosia",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));

/** Maps an x offset in `[0, width]` to a timestamp in `[range.fromMs, range.toMs]`. */
export function xToTime(x: number, width: number, range: { fromMs: number; toMs: number }): number {
  if (width <= 0 || range.toMs <= range.fromMs) return range.fromMs;
  const clamped = Math.max(0, Math.min(width, x));
  const ratio = clamped / width;
  return Math.round(range.fromMs + ratio * (range.toMs - range.fromMs));
}

/** Maps a timestamp in `[range.fromMs, range.toMs]` to an x offset in `[0, width]`. */
export function timeToX(ms: number, width: number, range: { fromMs: number; toMs: number }): number {
  if (width <= 0 || range.toMs <= range.fromMs) return 0;
  const clamped = Math.max(range.fromMs, Math.min(range.toMs, ms));
  return ((clamped - range.fromMs) / (range.toMs - range.fromMs)) * width;
}

/**
 * Pure timeline geometry builder for the live 30-min axis or 24-hour day replay axis.
 */
export function buildTimeline(
  buffer: RadarEvent[],
  gaps: Gap[],
  range: { fromMs: number; toMs: number },
  width: number,
): TimelineModel {
  if (width <= 0 || range.toMs <= range.fromMs || (buffer.length === 0 && gaps.length === 0)) {
    return { marks: [], histogram: [], gapBands: [] };
  }

  const span = range.toMs - range.fromMs;
  const marks: TimelineMark[] = [];
  const bucketCounts = new Map<number, number>();

  for (const e of buffer) {
    const t = Date.parse(e.at);
    if (Number.isNaN(t) || t < range.fromMs || t > range.toMs) continue;
    const x = ((t - range.fromMs) / span) * width;
    marks.push({ x, layer: e.layer });

    const bucketIdx = Math.floor((t - range.fromMs) / MIN_MS);
    bucketCounts.set(bucketIdx, (bucketCounts.get(bucketIdx) ?? 0) + 1);
  }

  const histogram: TimelineBucket[] = [];
  for (const [bucketIdx, n] of [...bucketCounts.entries()].sort((a, b) => a[0] - b[0])) {
    const bucketStartMs = range.fromMs + bucketIdx * MIN_MS;
    const x = ((bucketStartMs - range.fromMs) / span) * width;
    histogram.push({ x, n });
  }

  const gapBands: TimelineGapBand[] = [];
  for (const g of gaps) {
    const f = Date.parse(g.from);
    const t = Date.parse(g.to);
    if (Number.isNaN(f) || Number.isNaN(t)) continue;
    const start = Math.max(range.fromMs, Math.min(f, t));
    const end = Math.min(range.toMs, Math.max(f, t));
    if (end < range.fromMs || start > range.toMs) continue;
    const x1 = ((start - range.fromMs) / span) * width;
    const x2 = ((end - range.fromMs) / span) * width;
    const w = Math.max(2, x2 - x1);
    gapBands.push({
      x: x1,
      w,
      label: `Kesinti ${fmtHm(f)}–${fmtHm(t)}`,
    });
  }

  return { marks, histogram, gapBands };
}
