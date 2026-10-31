import { createStore, type StoreApi } from "zustand/vanilla";
import { type MeritEvent, SSE_EVENT_TYPES } from "@/lib/realtime-events";

/**
 * The tab's one connection to GET /api/sse (spec §9.1). Taskbar, Komuta Merkezi windows and the
 * mobile shell all subscribe here instead of opening their own EventSource. The connection opens
 * with the first subscriber and closes GRACE_MS after the last one leaves (closing and reopening a
 * window, or switching shells, does not drop it). A dropped connection is re-opened with
 * 1 s -> 30 s exponential backoff; before each retry a HEAD /api/sse tells a dead session (401)
 * from a network blip, so a missed `session.closed` still ends on /giris instead of retrying
 * forever.
 */

export type SseStatus = "connecting" | "open" | "closed";
export type SseHandler = (e: MeritEvent) => void;

export const MIN_DELAY_MS = 1000;
export const MAX_DELAY_MS = 30_000;
export const GRACE_MS = 5000;
const SSE_URL = "/api/sse";
const LOGIN_PATH = "/giris";
/** Control frames the store always handles itself. */
const SESSION_CLOSED = "session.closed";
const RECONNECT = "reconnect";
/** Synthetic event after a gap in the stream: subscribers refetch what they show. */
const RESYNC = "realtime.resync";

/** The parts of EventSource the store uses (a fake stands in under Vitest). */
export type EventSourceLike = {
  onopen: ((ev: Event) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
  addEventListener(type: string, listener: (ev: MessageEvent<string>) => void): void;
  close(): void;
};

export type SseClientDeps = {
  createEventSource(url: string): EventSourceLike;
  /** HEAD /api/sse → HTTP status; rejects when the network is down. */
  probe(url: string): Promise<number>;
  /** Leaves the shell for the login page (outside the router: works from any component tree). */
  signedOut(path: string): void;
  graceMs?: number;
};

export type SseClient = {
  store: StoreApi<{ status: SseStatus }>;
  /** `handler` receives every event whose type is in `types` (default SSE_EVENT_TYPES). */
  subscribe(handler: SseHandler, types?: readonly string[]): () => void;
};

type Subscriber = { handler: SseHandler; types: ReadonlySet<string> };

export function createSseClient(deps: SseClientDeps): SseClient {
  const store = createStore<{ status: SseStatus }>()(() => ({ status: "connecting" }));
  const setStatus = (status: SseStatus) => {
    if (store.getState().status !== status) store.setState({ status });
  };
  const graceMs = deps.graceMs ?? GRACE_MS;

  const subscribers = new Set<Subscriber>();
  let source: EventSourceLike | undefined;
  /** Named event types with a listener on the current source. */
  let listening = new Set<string>();
  let retry: ReturnType<typeof setTimeout> | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let delay = MIN_DELAY_MS;
  /** A HEAD probe after a drop is in flight (it schedules the retry). */
  let probing = false;
  /** The stream was interrupted (drop or recycle): the next open tells subscribers to resync. */
  let gap = false;
  /** The session is over (session.closed or 401): this tab never reconnects. */
  let ended = false;
  /** Bumped on every connect and teardown: callbacks of an older connection are ignored. */
  let generation = 0;

  const deliver = (type: string, data: string) => {
    let event: MeritEvent;
    try {
      event = JSON.parse(data) as MeritEvent;
    } catch {
      return; // malformed frame: ignore
    }
    const effective = type === "message" ? event.type : type;
    for (const sub of [...subscribers]) {
      if (!sub.types.has(effective)) continue;
      try {
        sub.handler(event);
      } catch (error) {
        console.error("[sse] abone hatası", error);
      }
    }
  };

  const endSession = () => {
    ended = true;
    teardown();
    deps.signedOut(LOGIN_PATH);
  };

  const listen = (es: EventSourceLike, type: string) => {
    if (listening.has(type)) return;
    listening.add(type);
    es.addEventListener(type, (msg) => {
      if (es !== source) return;
      if (type === RECONNECT) {
        // The server recycled the stream (max lifetime): reconnect at once.
        es.close();
        source = undefined;
        gap = true;
        delay = MIN_DELAY_MS;
        connect();
        return;
      }
      deliver(type, msg.data);
      if (type === SESSION_CLOSED) endSession();
    });
  };

  const wantedTypes = () => {
    const all = new Set<string>([...SSE_EVENT_TYPES, SESSION_CLOSED, RECONNECT]);
    for (const sub of subscribers) for (const t of sub.types) all.add(t);
    return all;
  };

  const scheduleRetry = (gen: number) => {
    const wait = delay;
    delay = Math.min(delay * 2, MAX_DELAY_MS);
    retry = setTimeout(() => {
      retry = undefined;
      if (gen === generation) connect();
    }, wait);
  };

  const onDropped = (gen: number) => {
    gap = true;
    setStatus("connecting");
    probing = true;
    deps.probe(SSE_URL).then(
      (status) => {
        if (gen !== generation || ended) return;
        probing = false;
        if (status === 401) endSession();
        else scheduleRetry(gen);
      },
      () => {
        if (gen !== generation || ended) return;
        probing = false;
        scheduleRetry(gen);
      },
    );
  };

  function connect() {
    if (ended) return;
    if (subscribers.size === 0) {
      teardown(); // a retry or recycle landed during the grace period: just close
      return;
    }
    const gen = ++generation;
    setStatus("connecting");
    const es = deps.createEventSource(SSE_URL);
    source = es;
    listening = new Set();
    es.onopen = () => {
      if (es !== source) return;
      delay = MIN_DELAY_MS;
      setStatus("open");
      if (gap) {
        gap = false;
        deliver(RESYNC, JSON.stringify({ type: RESYNC, at: new Date().toISOString() }));
      }
    };
    es.onerror = () => {
      if (es !== source) return;
      // Take over reconnecting from the browser so the delay (and the 401 check) are ours.
      es.close();
      source = undefined;
      onDropped(gen);
    };
    es.addEventListener("message", (msg) => {
      if (es === source) deliver("message", msg.data);
    });
    for (const type of wantedTypes()) listen(es, type);
  }

  function teardown() {
    generation++;
    if (retry) clearTimeout(retry);
    if (idle) clearTimeout(idle);
    retry = undefined;
    idle = undefined;
    probing = false;
    source?.close();
    source = undefined;
    listening = new Set();
    delay = MIN_DELAY_MS;
    setStatus("closed");
  }

  return {
    store,
    subscribe(handler, types = SSE_EVENT_TYPES) {
      const sub: Subscriber = { handler, types: new Set(types) };
      subscribers.add(sub);
      if (idle) {
        clearTimeout(idle);
        idle = undefined;
      }
      if (source) {
        for (const t of sub.types) listen(source, t);
      } else if (!retry && !probing) {
        connect();
      }
      return () => {
        if (!subscribers.delete(sub) || subscribers.size > 0) return;
        if (idle) clearTimeout(idle);
        idle = setTimeout(() => {
          idle = undefined;
          if (subscribers.size === 0) teardown();
        }, graceMs);
      };
    },
  };
}

let client: SseClient | undefined;

/** The browser tab's shared client. Server rendering never connects (no effect subscribes). */
export function sseClient(): SseClient {
  client ??= createSseClient({
    createEventSource: (url) => new EventSource(url),
    probe: async (url) =>
      (await fetch(url, { method: "HEAD", cache: "no-store", credentials: "same-origin" })).status,
    signedOut: (path) => window.location.replace(path),
  });
  return client;
}
