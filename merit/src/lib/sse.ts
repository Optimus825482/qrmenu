import { matchesScope, type Scope, subscribe } from "@/lib/realtime";
import { EVENT_TYPE_RE, type MeritEvent } from "@/lib/realtime-events";

export const SSE_PING_MS = 25_000;
/** A stream is recycled after this long so the session is re-validated on reconnect. */
export const SSE_MAX_LIFETIME_MS = 30 * 60_000;

type SseOptions = { signal: AbortSignal; pingMs?: number; maxLifetimeMs?: number };

/**
 * An SSE body over any event filter, independent of HTTP: a `hello` frame, every event `filter`
 * accepts as a named frame, and a `: ping` comment every `pingMs`. When `signal` aborts (or the
 * reader cancels) the subscription and the ping interval are released and the stream closes.
 * A delivered `session.closed` frame ends the stream. The recipient list (`userIds`) is routing
 * data and is never sent to the browser.
 */
export function createFilteredSseStream(
  filter: (e: MeritEvent) => boolean,
  opts: SseOptions,
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
        filter,
        (e) => {
          if (!EVENT_TYPE_RE.test(e.type)) return;
          const closing = e.type === "session.closed";
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

/**
 * The body of GET /api/sse: every event visible to `scope`. session.closed is addressed to one
 * session: the user's other sessions neither see the frame (it would send them to the login page)
 * nor lose their stream.
 */
export function createSseStream(scope: Scope, opts: SseOptions): ReadableStream<Uint8Array> {
  return createFilteredSseStream((e) => {
    if (!matchesScope(e, scope)) return false;
    if (e.type === "session.closed") {
      return (e.payload as { sessionId?: string } | undefined)?.sessionId === scope.sessionId;
    }
    return true;
  }, opts);
}
