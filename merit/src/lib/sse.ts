import { matchesScope, type Scope, subscribe } from "@/lib/realtime";
import { EVENT_TYPE_RE, type MeritEvent } from "@/lib/realtime-events";

export const SSE_PING_MS = 25_000;
/** A stream is recycled after this long so the session is re-validated on reconnect. */
export const SSE_MAX_LIFETIME_MS = 30 * 60_000;

/**
 * The body of GET /api/sse, independent of HTTP: a `hello` frame, every event visible to `scope`
 * as a named frame, and a `: ping` comment every `pingMs`. When `signal` aborts (or the reader
 * cancels) the subscription and the ping interval are released and the stream closes.
 */
export function createSseStream(
  scope: Scope,
  opts: { signal: AbortSignal; pingMs?: number; maxLifetimeMs?: number },
): ReadableStream<Uint8Array> {
  const { signal, pingMs = SSE_PING_MS, maxLifetimeMs = SSE_MAX_LIFETIME_MS } = opts;
  const encoder = new TextEncoder();
  let cleanup = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let unsubscribe = () => {};
      const timers: {
        ping?: ReturnType<typeof setInterval>;
        life?: ReturnType<typeof setTimeout>;
      } = {};
      let closed = false;

      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (timers.ping !== undefined) clearInterval(timers.ping);
        if (timers.life !== undefined) clearTimeout(timers.life);
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
          if (!EVENT_TYPE_RE.test(e.type)) return;
          // session.closed is addressed to one session: the user's other sessions neither see
          // the frame (it would send them to the login page) nor lose their stream.
          const closing = e.type === "session.closed";
          if (closing) {
            const sessionId = (e.payload as { sessionId?: string } | undefined)?.sessionId;
            if (sessionId !== scope.sessionId) return;
          }
          // Recipient ids are routing data; the browser has no use for other users' ids.
          const visible: MeritEvent = { ...e };
          delete visible.userIds;
          write(`event: ${e.type}\ndata: ${JSON.stringify(visible)}\n\n`);
          if (closing) cleanup();
        },
      );
      timers.ping = setInterval(() => write(": ping\n\n"), pingMs);
      timers.life = setTimeout(() => {
        write("event: reconnect\ndata: {}\n\n");
        cleanup();
      }, maxLifetimeMs);
    },
    cancel() {
      cleanup();
    },
  });
}
