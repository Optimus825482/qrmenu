import { matchesScope, type Scope, subscribe } from "@/lib/realtime";
import type { MeritEvent } from "@/lib/realtime-events";

export const SSE_PING_MS = 25_000;

/**
 * The body of GET /api/sse, independent of HTTP: a `hello` frame, every event visible to `scope`
 * as a named frame, and a `: ping` comment every `pingMs`. When `signal` aborts (or the reader
 * cancels) the subscription and the ping interval are released and the stream closes.
 */
export function createSseStream(
  scope: Scope,
  opts: { signal: AbortSignal; pingMs?: number },
): ReadableStream<Uint8Array> {
  const { signal, pingMs = SSE_PING_MS } = opts;
  const encoder = new TextEncoder();
  let cleanup = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let unsubscribe = () => {};
      const timers: { ping?: ReturnType<typeof setInterval> } = {};
      let closed = false;

      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (timers.ping !== undefined) clearInterval(timers.ping);
        signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // already closed or errored by the consumer
        }
      };
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      if (signal.aborted) {
        closed = true;
        controller.close();
        return;
      }
      signal.addEventListener("abort", cleanup, { once: true });

      write(`event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
      unsubscribe = subscribe(
        (e) => matchesScope(e, scope),
        (e) => {
          // Recipient ids are routing data; the browser has no use for other users' ids.
          const visible: MeritEvent = { ...e };
          delete visible.userIds;
          write(`event: ${e.type}\ndata: ${JSON.stringify(visible)}\n\n`);
        },
      );
      timers.ping = setInterval(() => write(": ping\n\n"), pingMs);
    },
    cancel() {
      cleanup();
    },
  });
}
