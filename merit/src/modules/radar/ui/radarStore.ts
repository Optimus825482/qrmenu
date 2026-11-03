import { createStore, type StoreApi } from "zustand/vanilla";
import type { MeritEvent } from "@/lib/realtime-events";
import { BUFFER_MAX_EVENTS, FLUSH_PER_SEC, PULSE_MS, STORM_THRESHOLD } from "../constants";
import { RADAR_EVENT_TYPES, compareRadarEvents, toRadarEvent } from "../events";
import { comparableState, firstDiffPath, initialState, type RadarState } from "../state";
import type { RadarAlert, RadarEvent, RadarOverview, RadarSnapshot } from "../types";
import { reduce } from "./reducers";

/**
 * Client store of the live radar (no React). Events are normalised, queued and reduced in one
 * batch FLUSH_PER_SEC times a second; a ring buffer plus per-minute checkpoints serve scrubbing.
 */

export type RadarStoreDeps = {
  fetchSnapshot(hotelId: string): Promise<RadarSnapshot>;
  subscribe(handler: (e: MeritEvent) => void, types: readonly string[]): () => void;
  now(): number;
  /** One-shot timer; returns its canceller. */
  schedule(cb: () => void, ms: number): () => void;
  reducedMotion(): boolean;
  hidden(): boolean;
  onDrift?(path: string): void;
  /** Counters scoped to the selected hotel, or every permitted hotel for "ALL". */
  fetchOverview?(hotelId: string): Promise<RadarOverview>;
  /** Alerts derived on every tick; default: the snapshot's own system alerts. */
  deriveAlerts?(state: RadarState, nowMs: number): RadarAlert[];
  /** `radar.liveBufferMinutes` (default 30). */
  bufferMinutes?(): number;
};

export type RadarMode = "live" | "scrub" | "replay";

export type RadarStoreState = {
  mode: RadarMode;
  hotelId: string | null;
  base: RadarSnapshot | null;
  view: RadarState | null;
  live: RadarState | null;
  buffer: RadarEvent[];
  checkpoints: Map<number, RadarState>;
  cursor: number | null;
  pulses: Map<string, number>;
  gaps: { from: string; to: string }[];
  alerts: RadarAlert[];
  connection: "connecting" | "live" | "offline";
  lastEventAt?: string;
  pending: number;
  seq: number;
  overview: RadarOverview | null;
  overviewError: string | null;
  start(hotelId: string): void;
  stop(): void;
  refresh(): Promise<void>;
  scrubTo(ms: number): void;
  goLive(): void;
  tick(): void;
  ingest(e: MeritEvent): void;
  /** Reduces the queue now (the UI calls it when the tab becomes visible). */
  flush(): void;
};

export type RadarStore = StoreApi<RadarStoreState>;

const MIN = 60_000;
const SKEW_MS = 2000;
const PULSE_GAP_MS = 2000;
const DEBOUNCE_MS = 1000;
const DRIFT_MS = 60_000;
const TICK_MS = 1000;

const t = (e: RadarEvent): number => Date.parse(e.at) || 0;

/** Europe/Nicosia business date (YYYY-MM-DD) of an instant. */
export function businessDateOf(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Nicosia", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(ms),
  );
}

function pulseKey(e: RadarEvent): string | undefined {
  switch (e.type) {
    case "order.status":
      return e.tableId ? `table:${e.tableId}` : e.roomId ? `room:${e.roomId}` : `order:${e.orderId}`;
    case "call.opened":
    case "call.closed":
    case "table.scanned":
    case "table.assigned":
      return `table:${e.tableId}`;
    case "room.checked":
    case "room.check.changed":
    case "room.scanned":
    case "dnd.marked":
    case "mybar.opened":
    case "mybar.seen":
    case "mybar.closed":
    case "task.updated":
      return `room:${e.roomId}`;
    case "print.job":
      return e.printerId ? `printer:${e.printerId}` : e.orderId ? `order:${e.orderId}` : undefined;
    case "printer.health":
      return `printer:${e.printerId}`;
    case "stock.level":
      return `stock:${e.productId}`;
    case "presence":
      return `session:${e.sessionId}`;
    case "outlet.ordering":
      return `outlet:${e.outletId}`;
    default:
      return undefined;
  }
}

/** First index whose event is not before `(time)`. */
function lowerBound(buf: RadarEvent[], time: number): number {
  let lo = 0;
  let hi = buf.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t(buf[mid]) < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function insertSorted(buf: RadarEvent[], e: RadarEvent): void {
  let lo = 0;
  let hi = buf.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (compareRadarEvents(buf[mid], e) <= 0) lo = mid + 1;
    else hi = mid;
  }
  buf.splice(lo, 0, e);
}

export function createRadarStore(deps: RadarStoreDeps): RadarStore {
  // Closure-owned mutable structures; the store state exposes copies after each change.
  let buf: RadarEvent[] = [];
  let cps = new Map<number, RadarState>();
  let cpNext = 0;
  let queue: RadarEvent[] = [];
  const seen = new Set<string>();
  const lastPulseAt = new Map<string, number>();
  let generation = 0;
  let overviewRequest = 0;
  let unsubscribe: (() => void) | undefined;
  let inflight: Promise<void> | undefined;
  let flushCancel: (() => void) | undefined;
  let refreshCancel: (() => void) | undefined;
  let overviewCancel: (() => void) | undefined;
  let tickCancel: (() => void) | undefined;
  let driftCancel: (() => void) | undefined;
  let deferred = false;
  let rolloverSeen: string | undefined;

  const store = createStore<RadarStoreState>()((set, get) => {
    const bufferMs = () => (deps.bufferMinutes?.() ?? 30) * MIN;
    const genFloor = (): number => {
      const b = get().base;
      return b ? (Date.parse(b.generatedAt) || 0) - SKEW_MS : -Infinity;
    };

    /** Applies sorted events on `cur`, creating minute checkpoints (state before the minute). */
    const applyWithCheckpoints = (cur: RadarState, evs: RadarEvent[], from = 0): RadarState => {
      for (let i = from; i < evs.length; i++) {
        const e = evs[i];
        const time = t(e);
        while (cpNext <= time) {
          cps.set(cpNext, cur);
          cpNext += MIN;
        }
        cur = reduce(cur, e);
      }
      return cur;
    };

    const rebuildFrom = (time: number): RadarState => {
      let key = -Infinity;
      for (const k of cps.keys()) if (k <= time && k > key) key = k;
      if (key === -Infinity) key = Math.min(...cps.keys());
      for (const k of [...cps.keys()]) if (k > key) cps.delete(k);
      cpNext = Math.floor(key / MIN) * MIN + MIN;
      return applyWithCheckpoints(cps.get(key)!, buf, lowerBound(buf, key));
    };

    const trim = () => {
      const cutoff = deps.now() - bufferMs();
      let drop = lowerBound(buf, cutoff);
      if (buf.length - drop > BUFFER_MAX_EVENTS) drop = buf.length - BUFFER_MAX_EVENTS;
      if (drop > 0) {
        for (let i = 0; i < drop; i++) seen.delete(buf[i].id);
        buf = buf.slice(drop);
      }
      if (buf.length > 0) {
        const first = t(buf[0]);
        let keep = -Infinity;
        for (const k of cps.keys()) if (k <= first && k > keep) keep = k;
        for (const k of [...cps.keys()]) if (k < keep) cps.delete(k);
      }
    };

    const trimNow = () => {
      const n = buf.length;
      const c = cps.size;
      trim();
      return buf.length !== n || cps.size !== c;
    };

    const scrubState = (time: number): RadarState | null => {
      if (cps.size === 0) return null;
      let key = -Infinity;
      for (const k of cps.keys()) if (k <= time && k > key) key = k;
      if (key === -Infinity) key = Math.min(...cps.keys());
      let cur = cps.get(key)!;
      for (let i = lowerBound(buf, key); i < buf.length && t(buf[i]) <= time; i++) cur = reduce(cur, buf[i]);
      return cur;
    };

    const expire = (pulses: Map<string, number>, nowMs: number): Map<string, number> => {
      let out = pulses;
      for (const [k, until] of pulses) {
        if (until <= nowMs) {
          if (out === pulses) out = new Map(pulses);
          out.delete(k);
        }
      }
      return out;
    };

    const afterLiveChange = (live: RadarState) => {
      if (live.needsRefresh.size > 0 && !refreshCancel) {
        refreshCancel = deps.schedule(() => {
          refreshCancel = undefined;
          void get().refresh();
        }, DEBOUNCE_MS);
      }
    };

    const adopt = (snap: RadarSnapshot) => {
      const floor = (Date.parse(snap.generatedAt) || 0) - SKEW_MS;
      for (const k of [...cps.keys()]) if (k >= floor) cps.delete(k);
      const init = initialState(snap);
      cps.set(floor, init);
      cpNext = Math.floor(floor / MIN) * MIN + MIN;
      set({ base: snap });
      const live = applyWithCheckpoints(init, buf, lowerBound(buf, floor));
      const s = get();
      const view = s.mode === "live" ? live : (s.cursor !== null ? scrubState(s.cursor) : null) ?? live;
      set({
        live,
        view,
        checkpoints: new Map(cps),
        connection: "live",
        seq: s.seq + 1,
        alerts: (deps.deriveAlerts ?? defaultAlerts)(live, deps.now()),
      });
      // events queued before the base arrived are now judged against it
      afterLiveChange(live);
      if (queue.length > 0 && !flushCancel) flushCancel = deps.schedule(flush, 1000 / FLUSH_PER_SEC);
    };

    const defaultAlerts = (s: RadarState): RadarAlert[] => s.layers.system.alerts;

    const flush = () => {
      flushCancel = undefined;
      const s = get();
      if (!s.live || !s.base) return;
      if (queue.length === 0) return;
      if (deps.hidden()) {
        deferred = true;
        flushCancel = deps.schedule(flush, 1000 / FLUSH_PER_SEC);
        return;
      }
      const floor = genFloor();
      const batch = queue.filter((e) => t(e) >= floor).sort(compareRadarEvents);
      queue = [];
      const suppress = deferred;
      deferred = false;
      if (batch.length === 0) return;

      let live = s.live;
      const last = buf[buf.length - 1];
      if (!last || compareRadarEvents(batch[0], last) >= 0) {
        for (const e of batch) buf.push(e);
        live = applyWithCheckpoints(live, batch);
      } else {
        for (const e of batch) insertSorted(buf, e);
        live = rebuildFrom(t(batch[0]));
      }
      trim();

      const nowMs = deps.now();
      let pulses = expire(s.pulses, nowMs);
      if (!suppress && s.mode === "live" && !deps.reducedMotion() && batch.length <= STORM_THRESHOLD) {
        for (const e of batch) {
          const key = pulseKey(e);
          if (!key) continue;
          const prev = lastPulseAt.get(key);
          if (prev !== undefined && nowMs - prev < PULSE_GAP_MS) continue;
          lastPulseAt.set(key, nowMs);
          if (pulses === s.pulses) pulses = new Map(pulses);
          pulses.set(key, nowMs + PULSE_MS);
        }
      }
      if (lastPulseAt.size > 500) for (const [k, v] of lastPulseAt) if (nowMs - v > PULSE_GAP_MS) lastPulseAt.delete(k);

      const scrubbing = s.mode !== "live";
      set({
        live,
        view: scrubbing ? s.view : live,
        buffer: buf.slice(),
        checkpoints: new Map(cps),
        pulses,
        pending: scrubbing ? s.pending + batch.length : 0,
        lastEventAt: batch[batch.length - 1].at,
        seq: s.seq + 1,
      });
      afterLiveChange(live);
      if (queue.length > 0 && !flushCancel) flushCancel = deps.schedule(flush, 1000 / FLUSH_PER_SEC);
    };

    const scheduleFlush = () => {
      if (!flushCancel) flushCancel = deps.schedule(flush, 1000 / FLUSH_PER_SEC);
    };

    const loadOverview = async () => {
      const hotelId = get().hotelId;
      if (!hotelId || !deps.fetchOverview) return;
      const gen = generation;
      const request = ++overviewRequest;
      try {
        const result = await deps.fetchOverview(hotelId);
        if (gen !== generation || request !== overviewRequest) return;
        // Defense in depth: one-hotel stores never adopt cards for another hotel.
        const overview = hotelId === "ALL" ? result : {
          ...result,
          hotels: result.hotels.filter((h) => h.hotelId === hotelId),
        };
        set({ overview, overviewError: null, ...(hotelId === "ALL" ? { connection: "live" as const } : {}) });
      } catch (error) {
        if (gen !== generation || request !== overviewRequest) return;
        set({
          overviewError: error instanceof Error ? error.message : "Genel bakış yüklenemedi.",
          ...(hotelId === "ALL" ? { connection: "offline" as const } : {}),
        });
      }
    };

    const refreshOverview = () => {
      if (overviewCancel || !deps.fetchOverview) return;
      overviewCancel = deps.schedule(() => {
        overviewCancel = undefined;
        void loadOverview();
      }, DEBOUNCE_MS);
    };

    const drift = () => {
      driftCancel = deps.schedule(drift, DRIFT_MS);
      const { hotelId, live } = get();
      if (!hotelId || hotelId === "ALL" || !live) return;
      const gen = generation;
      void deps.fetchSnapshot(hotelId).then(
        (snap) => {
          if (gen !== generation) return;
          get().flush(); // compare against live + flushed queue
          if (queue.length > 0) return; // hidden tab: queue not applied yet, try next round
          const cur = get().live;
          if (!cur) return;
          const fold = (Date.parse(snap.generatedAt) || 0) - SKEW_MS;
          let ref = initialState(snap);
          for (let i = lowerBound(buf, fold); i < buf.length; i++) ref = reduce(ref, buf[i]);
          const path = firstDiffPath(comparableState(cur), comparableState(ref));
          if (path === undefined) return;
          adopt(snap);
          deps.onDrift?.(path);
        },
        () => undefined,
      );
    };

    const tick = () => {
      const s = get();
      const nowMs = deps.now();
      const pulses = expire(s.pulses, nowMs);
      const patch: Partial<RadarStoreState> = {};
      if (pulses !== s.pulses) patch.pulses = pulses;
      if (trimNow()) {
        patch.buffer = buf.slice();
        patch.checkpoints = new Map(cps);
      }
      if (s.live) {
        patch.alerts = (deps.deriveAlerts ?? defaultAlerts)(s.live, nowMs);
        const today = businessDateOf(nowMs);
        if (today !== s.live.businessDate && rolloverSeen !== today) {
          rolloverSeen = today;
          void get().refresh();
        }
      }
      set(patch);
    };

    const loopTick = () => {
      tickCancel = deps.schedule(() => {
        get().tick();
        loopTick();
      }, TICK_MS);
    };

    const stop = () => {
      generation++;
      unsubscribe?.();
      unsubscribe = undefined;
      for (const c of [flushCancel, refreshCancel, overviewCancel, tickCancel, driftCancel]) c?.();
      flushCancel = refreshCancel = overviewCancel = tickCancel = driftCancel = undefined;
      inflight = undefined;
      queue = [];
      deferred = false;
    };

    return {
      mode: "live",
      hotelId: null,
      base: null,
      view: null,
      live: null,
      buffer: [],
      checkpoints: new Map(),
      cursor: null,
      pulses: new Map(),
      gaps: [],
      alerts: [],
      connection: "connecting",
      pending: 0,
      seq: 0,
      overview: null,
      overviewError: null,

      start(hotelId) {
        stop();
        buf = [];
        cps = new Map();
        seen.clear();
        lastPulseAt.clear();
        rolloverSeen = undefined;
        set({
          mode: "live",
          hotelId,
          base: null,
          view: null,
          live: null,
          buffer: [],
          checkpoints: new Map(),
          cursor: null,
          pulses: new Map(),
          gaps: [],
          alerts: [],
          connection: "connecting",
          lastEventAt: undefined,
          pending: 0,
          seq: 0,
          overview: null,
          overviewError: null,
        });
        unsubscribe = deps.subscribe((e) => get().ingest(e), RADAR_EVENT_TYPES);
        void get().refresh();
        loopTick();
        if (hotelId !== "ALL") driftCancel = deps.schedule(drift, DRIFT_MS);
      },

      stop() {
        stop();
      },

      refresh() {
        const { hotelId } = get();
        if (!hotelId) return Promise.resolve();
        if (hotelId === "ALL") return loadOverview();
        if (inflight) return inflight;
        const gen = generation;
        const p: Promise<void> = Promise.all([
          loadOverview(),
          deps.fetchSnapshot(hotelId).then(
            (snap) => {
              if (gen === generation) adopt(snap);
            },
            () => {
              if (gen === generation) set({ connection: "offline" });
            },
          ),
        ]).then(() => undefined);
        inflight = p;
        void p.finally(() => {
          if (inflight === p) inflight = undefined;
        });
        return p;
      },

      scrubTo(time) {
        const s = get();
        if (!s.live) return;
        const view = scrubState(time);
        if (!view) return;
        set({ mode: "scrub", cursor: time, view, pending: s.mode === "live" ? 0 : s.pending });
      },

      goLive() {
        const s = get();
        set({ mode: "live", cursor: null, view: s.live, pending: 0 });
      },

      tick,

      flush() {
        flushCancel?.();
        flushCancel = undefined;
        flush();
      },

      ingest(e) {
        const s = get();
        const hotelId = s.hotelId;
        if (!hotelId) return;
        const r = toRadarEvent(e);
        if (r.gap) {
          const nowIso = new Date(deps.now()).toISOString();
          set({ gaps: [...s.gaps, { from: s.lastEventAt ?? s.base?.generatedAt ?? nowIso, to: nowIso }] });
        }
        if (hotelId === "ALL") {
          if (r.refresh || r.events.length > 0) refreshOverview();
          return;
        }
        if (r.refresh) void get().refresh();
        const floor = genFloor();
        let added = false;
        for (const re of r.events) {
          if (re.hotelId !== hotelId) continue;
          if (seen.has(re.id)) continue;
          if (t(re) < floor) continue;
          seen.add(re.id);
          queue.push(re);
          added = true;
        }
        if (added) {
          scheduleFlush();
          refreshOverview();
        }
      },
    };
  });

  return store;
}
