import { randomUUID } from "node:crypto";
import { request, Agent } from "undici";
import { setTimeout as sleep } from "node:timers/promises";
import { HttpMetrics, type RouteGroup } from "./metrics";
import { holdSse, type SseMetrics } from "./sseHold";
import type { Targets } from "./targets";
import type { Config } from "./config";
export const httpAgent = new Agent({ connections: 80, bodyTimeout: 15_000, headersTimeout: 15_000 });
export async function measuredRequest(url: string, group: RouteGroup, metrics: HttpMetrics, headers: Record<string, string>, data?: unknown) {
  const start = performance.now();
  try {
    const response = await request(url, { method: data ? "POST" : "GET", headers: { ...headers, ...(data ? { "content-type": "application/json" } : {}) }, body: data ? JSON.stringify(data) : undefined, dispatcher: httpAgent, maxRedirections: 0, signal: AbortSignal.timeout(15_000) });
    const text = await response.body.text(); metrics.record(group, performance.now() - start, response.statusCode);
    let json: unknown; try { json = JSON.parse(text); } catch { /* HTML page. */ }
    return { status: response.statusCode, json };
  } catch { metrics.record(group, performance.now() - start, 0); return { status: 0, json: undefined }; }
}
export type CreatedOrder = { id: string; orderNo: number; token: string; outletId?: string; kind: "table" | "room"; createdAt: number; startedAt?: number };
export type CreatedMybar = { id: string; roomNumber: string };
export async function guestFlow(index: number, config: Config, targets: Targets, stop: AbortSignal, http: HttpMetrics, sse: SseMetrics, orders: CreatedOrder[], mybars: CreatedMybar[], onOrderEvent: (name: string, data: unknown) => void): Promise<void> {
  const flowStartedAt = Date.now();
  await sleep(config.rampMs * index / config.guests, undefined, { signal: stop }).catch(() => {});
  if (stop.aborted) return;
  const tableCount = Math.round(config.guests * 0.8);
  const isRoom = index >= tableCount;
  const target = isRoom ? targets.rooms[(index - tableCount) % targets.rooms.length] : targets.tables[index % targets.tables.length];
  const headers = { "x-forwarded-for": config.nat ? "10.250.0.1" : `10.251.${Math.floor(index / 250)}.${index % 250 + 1}`, "user-agent": "Merit-Local-Load" };
  const base = targets.baseUrl;
  await measuredRequest(`${base}/q/${target.token}`, "page", http, headers);
  const initialStop = new AbortController();
  const abortInitial = () => initialStop.abort();
  stop.addEventListener("abort", abortInitial, { once: true });
  const stream = holdSse(`${base}/api/q/${target.token}/events`, headers, initialStop.signal, sse, onOrderEvent);
  let orderStream: Promise<void> | undefined;
  // Each guest submits once. Room guests alternate room-service and MyBar (note-only request).
  // Full run: the first 60 table guests create the 4th-minute 60 orders / 30s burst.
  const submitAt = config.smoke ? 500 + index * 50 : isRoom ? 20_000 + (index - tableCount) * 7000 : index < 60 ? 240_000 + index * 500 : 20_000 + (index - 60) / Math.max(1, tableCount - 60) * 460_000;
  await sleep(Math.max(0, submitAt - (Date.now() - flowStartedAt)), undefined, { signal: stop }).catch(() => {});
  if (!stop.aborted) {
    const mybar = isRoom && index % 2 === 1;
    const response = await measuredRequest(`${base}/api/q/${target.token}/${mybar ? "mybar" : "order"}`, mybar ? "mybar" : "order", http, headers, mybar ? { idempotencyKey: randomUUID(), locale: "tr", items: [], note: "Yerel yük denemesi" } : { idempotencyKey: randomUUID(), locale: "tr", items: [{ menuNodeId: target.menuNodeId, qty: 1 }] });
    const result = response.json as { ok?: boolean; data?: { orderId?: string; orderNo?: number; requestId?: string } } | undefined;
    if (mybar && result?.ok && result.data?.requestId) mybars.push({ id: result.data.requestId, roomNumber: `Y${(index - tableCount) % targets.rooms.length + 1}` });
    if (result?.ok && result.data?.orderId && result.data.orderNo) {
      orders.push({ id: result.data.orderId, orderNo: result.data.orderNo, token: target.token, outletId: "outletId" in target ? target.outletId : undefined, kind: isRoom ? "room" : "table", createdAt: Date.now() });
      // Order status events are scoped to explicitly named IDs.
      initialStop.abort(); await stream;
      orderStream = holdSse(`${base}/api/q/${target.token}/events?orders=${result.data.orderId}`, headers, stop, sse, onOrderEvent);
    }
  }
  while (!stop.aborted) {
    await sleep(config.smoke ? 20_000 : 20_000 + Math.random() * 40_000, undefined, { signal: stop }).catch(() => {});
    if (!stop.aborted) await measuredRequest(`${base}/q/${target.token}`, "page", http, headers);
  }
  await stream;
  await orderStream;
  stop.removeEventListener("abort", abortInitial);
}
