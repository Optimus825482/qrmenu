import { matchesScope, type Scope, type ScopeCoverage, subscribe } from "@/lib/realtime";
import { EVENT_TYPE_RE, type MeritEvent } from "@/lib/realtime-events";

export const SSE_PING_MS = 25_000;
/** A stream is recycled after this long so the session is re-validated on reconnect. */
export const SSE_MAX_LIFETIME_MS = 30 * 60_000;

type SseOptions = {
  signal: AbortSignal;
  pingMs?: number;
  maxLifetimeMs?: number;
  /** Per-delivery sanitiser applied to a copy of each accepted event (never mutates the shared one). */
  map?: (e: MeritEvent) => MeritEvent;
  /** Called once when the stream ends, whatever ended it (abort, cancel, recycle, stalled consumer). */
  onClose?: () => void;
};

/** How often a connection re-reads its user's cross-hotel coverage besides the change events. */
export const SSE_COVERAGE_RELOAD_MS = 60_000;
/** Addressed to one user when their coverage is granted, changed or revoked (roomService/coverage.ts). */
const COVERAGE_CHANGED = "rs.coverage.changed";
const RESYNC = "realtime.resync";

type SseStreamOptions = SseOptions & {
  /**
   * Reads the user's open cross-hotel room-service grants. When given, the stream loads them at once, again on
   * every `rs.coverage.changed` addressed to the user, after a listener gap (`realtime.resync`) and every
   * `coverageReloadMs`. A failed read keeps nothing: the connection falls back to its own hotels.
   */
  loadCoverage?: () => Promise<readonly ScopeCoverage[]>;
  coverageReloadMs?: number;
};

/** Role kinds that may read which staff member did something (the same rule as the radar's `LayerEnv.named`). */
export const seesStaffNames = (roleKind: Scope["roleKind"]): boolean => roleKind === "SISTEM" || roleKind === "YONETIM";

/** Payload fields that carry a staff member's name, per event type. */
const STAFF_NAME_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "call.resolved": ["waiterName", "resolvedByName"],
};

/**
 * `e` without the staff names in its payload (a copy; the shared event is never touched). For connections whose
 * role may not read them: the screens already hide the names, this keeps them out of the network traffic too.
 */
export function withoutStaffNames(e: MeritEvent): MeritEvent {
  const fields = STAFF_NAME_FIELDS[e.type];
  const payload = e.payload;
  if (!fields || typeof payload !== "object" || payload === null || Array.isArray(payload)) return e;
  const kept = Object.fromEntries(Object.entries(payload).filter(([k]) => !fields.includes(k)));
  return { ...e, payload: kept as MeritEvent["payload"] };
}

/** Frames a stalled consumer may leave queued before its stream is closed. */
const MAX_QUEUED_FRAMES = 256;

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
  const { signal, pingMs = SSE_PING_MS, maxLifetimeMs = SSE_MAX_LIFETIME_MS, map, onClose } = opts;
  let closeNotified = false;
  const notifyClose = () => {
    if (closeNotified) return;
    closeNotified = true;
    try {
      onClose?.();
    } catch (err) {
      console.error("[sse] onClose hatası", err);
    }
  };
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
        notifyClose();
        try {
          controller.close();
        } catch {
          // already closed or errored by the consumer
        }
      };
      const write = (chunk: string) => {
        if (closed) return;
        // A consumer that stopped reading must not make the queue grow without bound: drop it, the client reconnects.
        if (controller.desiredSize !== null && controller.desiredSize < -MAX_QUEUED_FRAMES) {
          cleanup();
          return;
        }
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      if (signal.aborted) {
        closed = true;
        notifyClose();
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
          const visible: MeritEvent = { ...(map ? map(e) : e) };
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
 *
 * Cross-hotel room-service coverage (`loadCoverage`) lives in the connection's own copy of the scope. Expiry
 * needs no reload: `matchesScope` compares every grant's time window with the clock for each event. A revoke
 * or a new grant reaches the stream as `rs.coverage.changed`: the hotel is dropped from the copy at once and
 * the grants are re-read; the periodic re-read is the safety net for a notification that was lost.
 */
export function createSseStream(scope: Scope, opts: SseStreamOptions): ReadableStream<Uint8Array> {
  const { loadCoverage, coverageReloadMs = SSE_COVERAGE_RELOAD_MS, ...rest } = opts;
  if (!loadCoverage) {
    return createFilteredSseStream((e) => {
      if (!matchesScope(e, scope)) return false;
      if (e.type === "session.closed") {
        return (e.payload as { sessionId?: string } | undefined)?.sessionId === scope.sessionId;
      }
      return true;
    }, rest);
  }

  const live: Scope = { ...scope };
  let seq = 0;
  let stopped = false;
  const reload = () => {
    if (stopped) return;
    const mine = ++seq;
    loadCoverage().then(
      (rows) => {
        // A slower, older read must not overwrite a newer one.
        if (mine === seq && !stopped) live.coverage = rows;
      },
      (err) => {
        if (mine === seq) live.coverage = [];
        console.error("[sse] oteller arası kapsam okunamadı", err);
      },
    );
  };
  reload();
  const timer = setInterval(reload, coverageReloadMs);

  return createFilteredSseStream(
    (e) => {
      if (e.type === RESYNC) reload();
      else if (e.type === COVERAGE_CHANGED && e.userIds?.includes(live.userId)) {
        // Fail-closed until the re-read lands: the hotel the change is about (or, unknown, every hotel) is dropped.
        const hotelId = (e.payload as { hotelId?: unknown } | null | undefined)?.hotelId;
        live.coverage = typeof hotelId === "string" ? (live.coverage ?? []).filter((c) => c.hotelId !== hotelId) : [];
        reload();
      }
      if (!matchesScope(e, live)) return false;
      if (e.type === "session.closed") {
        return (e.payload as { sessionId?: string } | undefined)?.sessionId === live.sessionId;
      }
      return true;
    },
    {
      ...rest,
      onClose: () => {
        stopped = true;
        clearInterval(timer);
        rest.onClose?.();
      },
    },
  );
}
