import { mkdir, writeFile } from "node:fs/promises";
import type { HttpMetrics } from "./metrics";
import type { SseMetrics } from "./sseHold";
import type { PoolMetrics } from "./poolWatch";
import thresholds from "../thresholds.json";
export function verdict(http: ReturnType<HttpMetrics["result"]>, status429: number, sse: SseMetrics, db: PoolMetrics, expected: number, expect429: boolean, full: boolean, event: { count: number; p95?: number; p99?: number }, operations: { served: number; delivered: number; mybarClosed: number }, restart: { ran: boolean; recovered: boolean }, rss: { startMB?: number; endMB?: number }) {
  const failures: string[] = [];
  const entries = Object.values(http);
  const errors = entries.reduce((sum, x) => sum + x.errors, 0), count = entries.reduce((sum, x) => sum + x.count, 0);
  if (!count || errors / count > thresholds.serverErrorRatio) failures.push("5xx/timeout oranı");
  if (entries.some((x) => x.rejected > 0) && !expect429) failures.push("başarısız HTTP iş isteği");
  if ((http.page?.p95 ?? Infinity) > thresholds.pageP95Ms || (http.page?.p99 ?? Infinity) > thresholds.pageP99Ms) failures.push("sayfa gecikmesi");
  if ((http.order?.p95 ?? Infinity) > thresholds.orderP95Ms) failures.push("sipariş gecikmesi");
  if (expect429 ? status429 === 0 : status429 > 0) failures.push("429 beklentisi");
  if (sse.peak < expected || sse.unexpectedCloses / Math.max(1, sse.opened) > thresholds.sseUnexpectedCloseRatio || sse.failedOpens) failures.push("SSE sürekliliği");
  if (!db.samples || db.samplePeak > thresholds.dbConnectionsMax) failures.push("DB havuzu");
  if (!expect429 && (!event.count || operations.served < 1 || operations.delivered < 1 || operations.mybarClosed < 1)) failures.push("uçtan uca personel zinciri/olay kanıtı");
  if (event.count && ((event.p95 ?? Infinity) > thresholds.eventP95Ms || (event.p99 ?? Infinity) > thresholds.eventP99Ms)) failures.push("olay gecikmesi");
  if (full) {
    if (sse.peak < thresholds.fullSsePeakMin) failures.push("tam yük SSE zirvesi");
    if (!event.count || (event.p95 ?? Infinity) > thresholds.eventP95Ms || (event.p99 ?? Infinity) > thresholds.eventP99Ms) failures.push("olay gecikmesi");
    if (!restart.ran || !restart.recovered) failures.push("60sn yeniden bağlanma tatbikatı");
    if (!rss.startMB || !rss.endMB || rss.endMB / rss.startMB > 1 + thresholds.rssGrowthRatioMax) failures.push("3–10 dk RSS ölçümü");
  }
  return { passed: failures.length === 0, failures };
}
export async function saveReport(report: unknown) {
  await mkdir("tools/load/.tmp", { recursive: true });
  const file = `tools/load/.tmp/run-${new Date().toISOString().replaceAll(":", "-")}.json`;
  await writeFile(file, JSON.stringify(report, null, 2) + "\n");
  return file;
}
