import { build } from "hdr-histogram-js";
export class Histogram {
  private readonly h = build({ lowestDiscernibleValue: 1, highestTrackableValue: 3_600_000, numberOfSignificantValueDigits: 3 });
  record(ms: number) { this.h.recordValue(Math.max(1, Math.ceil(ms))); }
  percentile(p: number): number | undefined { return this.h.totalCount ? this.h.getValueAtPercentile(p) : undefined; }
}
export const percentile = (h: Histogram, p: number) => h.percentile(p);
export const rate = (count: number, windowSec: number) => windowSec > 0 ? count / windowSec : 0;
export type RouteGroup = "page" | "order" | "health" | "staff" | "mybar";
export type HttpMetric = { count: number; errors: number; rejected: number; p50?: number; p95?: number; p99?: number };
export class HttpMetrics {
  readonly groups = new Map<RouteGroup, { h: Histogram; count: number; errors: number; rejected: number }>();
  status429 = 0;
  record(group: RouteGroup, ms: number, status: number) {
    const m = this.groups.get(group) ?? { h: new Histogram(), count: 0, errors: 0, rejected: 0 };
    m.h.record(ms); m.count++; if (status === 0 || status >= 500) m.errors++; if (status >= 400) m.rejected++;
    if (status === 429) this.status429++;
    this.groups.set(group, m);
  }
  result(): Partial<Record<RouteGroup, HttpMetric>> {
    return Object.fromEntries([...this.groups].map(([key, m]) => [key, { count: m.count, errors: m.errors, rejected: m.rejected, p50: percentile(m.h, 50), p95: percentile(m.h, 95), p99: percentile(m.h, 99) }]));
  }
}
