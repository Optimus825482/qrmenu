import { request, Agent } from "undici";
import { setTimeout as sleep } from "node:timers/promises";
export type SseMetrics = { opened: number; active: number; peak: number; unexpectedCloses: number; reconnectOk: number; failedOpens: number };
export const sseMetrics = (): SseMetrics => ({ opened: 0, active: 0, peak: 0, unexpectedCloses: 0, reconnectOk: 0, failedOpens: 0 });
// The default fetch pool buffers responses; SSE gets a separate dispatcher with no body timeout.
export const sseAgent = new Agent({ connections: 500, bodyTimeout: 0, headersTimeout: 15_000 });
export async function holdSse(url: string, headers: Record<string, string>, signal: AbortSignal, metrics: SseMetrics, onEvent: (name: string, data: unknown) => void = () => {}): Promise<void> {
  let reconnect = false, attempt = 0;
  while (!signal.aborted) {
    let active = false;
    try {
      const res = await request(url, { headers, signal, dispatcher: sseAgent, maxRedirections: 0 });
      if (res.statusCode !== 200 || !String(res.headers["content-type"]).includes("text/event-stream")) { await res.body.dump(); throw new Error("SSE refused"); }
      metrics.opened++; metrics.active++; active = true; metrics.peak = Math.max(metrics.peak, metrics.active);
      if (reconnect) metrics.reconnectOk++;
      attempt = 0;
      let pending = "";
      for await (const chunk of res.body) {
        pending += Buffer.from(chunk).toString("utf8").replaceAll("\r\n", "\n");
        let split: number;
        while ((split = pending.indexOf("\n\n")) >= 0) {
          const frame = pending.slice(0, split); pending = pending.slice(split + 2);
          const event = frame.split("\n").find((l) => l.startsWith("event:"))?.slice(6).trim() ?? "message";
          const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
          if (data) { try { onEvent(event, JSON.parse(data)); } catch { /* Non-JSON heartbeat. */ } }
        }
        if (pending.length > 128_000) throw new Error("SSE frame too large");
      }
      if (!signal.aborted) metrics.unexpectedCloses++;
    } catch {
      if (!signal.aborted) { if (active) metrics.unexpectedCloses++; else metrics.failedOpens++; }
    } finally { if (active) metrics.active--; }
    if (!signal.aborted) { reconnect = true; await sleep(Math.min(8000, 500 * 2 ** attempt++) + Math.random() * 250, undefined, { signal }).catch(() => {}); }
  }
}
