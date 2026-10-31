import { Client } from "pg";
import type { Prisma, RoleKind } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { type MeritEvent, REALTIME_CHANNEL } from "@/lib/realtime-events";

export type { MeritEvent } from "@/lib/realtime-events";

/** pg_notify payloads are limited to 8000 bytes; stay safely below. */
const MAX_PAYLOAD_BYTES = 7500;
const BACKOFF_MS = [1000, 2000, 4000, 8000];

type Subscriber = { filter: (e: MeritEvent) => boolean; cb: (e: MeritEvent) => void };

/**
 * Process-wide listener state. Kept on globalThis so Next dev HMR (which re-evaluates this
 * module) never ends up with two clients or lost subscribers.
 */
type RealtimeState = {
  subscribers: Set<Subscriber>;
  client?: Client;
  listening: boolean;
  starting?: Promise<void>;
  stopped: boolean;
  attempt: number;
  timer?: ReturnType<typeof setTimeout>;
};

declare global {
  var __meritRealtime: RealtimeState | undefined;
}

function state(): RealtimeState {
  return (globalThis.__meritRealtime ??= {
    subscribers: new Set(),
    listening: false,
    stopped: false,
    attempt: 0,
  });
}

export type Scope = {
  userId: string;
  hotelIds: string[];
  outletId?: string;
  roleKind: RoleKind;
};

/**
 * Whether `scope` (one SSE connection) may see event `e`:
 *  - `userIds` set  -> the user must be listed; otherwise `hotelId` (when set) must be in scope
 *    (an event with neither is system-wide and reaches everyone);
 *  - `outletId` set -> the session's outlet, or a SISTEM/YONETIM role;
 *  - `roleKinds` set -> the session's role kind must be listed.
 */
export function matchesScope(e: MeritEvent, scope: Scope): boolean {
  if (e.userIds) {
    if (!e.userIds.includes(scope.userId)) return false;
  } else if (e.hotelId && !scope.hotelIds.includes(e.hotelId)) {
    return false;
  }
  if (e.outletId) {
    const privileged = scope.roleKind === "SISTEM" || scope.roleKind === "YONETIM";
    if (e.outletId !== scope.outletId && !privileged) return false;
  }
  if (e.roleKinds && !e.roleKinds.includes(scope.roleKind)) return false;
  return true;
}

/**
 * Emits an event on the `merit_events` channel. With `tx` the NOTIFY is part of that
 * transaction: listeners see it only after commit and never if it rolls back.
 */
export async function publish(
  event: Omit<MeritEvent, "at">,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  let full: MeritEvent = { ...event, at: new Date().toISOString() };
  let json = JSON.stringify(full);
  if (Buffer.byteLength(json) > MAX_PAYLOAD_BYTES) {
    full = { ...full, payloadTruncated: true };
    delete full.payload;
    json = JSON.stringify(full);
  }
  const db = tx ?? prisma;
  await db.$executeRaw`SELECT pg_notify(${REALTIME_CHANNEL}, ${json})`;
}

export function subscribe(
  filter: (e: MeritEvent) => boolean,
  cb: (e: MeritEvent) => void,
): () => void {
  const sub: Subscriber = { filter, cb };
  state().subscribers.add(sub);
  return () => {
    state().subscribers.delete(sub);
  };
}

export function listenerCount(): number {
  return state().subscribers.size;
}

export function isListening(): boolean {
  return state().listening;
}

function dispatch(raw: string | undefined): void {
  if (!raw) return;
  let event: MeritEvent;
  try {
    event = JSON.parse(raw) as MeritEvent;
  } catch {
    console.error("[realtime] çözülemeyen olay", raw.slice(0, 200));
    return;
  }
  for (const sub of [...state().subscribers]) {
    try {
      if (sub.filter(event)) sub.cb(event);
    } catch (err) {
      console.error("[realtime] abone hatası", err);
    }
  }
}

function scheduleReconnect(): void {
  const st = state();
  if (st.stopped || st.timer) return;
  const delay = BACKOFF_MS[Math.min(st.attempt, BACKOFF_MS.length - 1)];
  st.attempt++;
  st.timer = setTimeout(() => {
    st.timer = undefined;
    void connect();
  }, delay);
}

async function connect(): Promise<void> {
  const st = state();
  if (st.stopped) return;
  const client = new Client({ connectionString: env.DATABASE_URL });
  st.client = client;

  // 'error' and 'end' both fire for one failure; only the current client may trigger recovery.
  const lost = (err?: unknown) => {
    if (st.client !== client) return;
    if (err) console.error("[realtime] bağlantı hatası", err);
    st.client = undefined;
    st.listening = false;
    client.removeAllListeners();
    client.on("error", () => {});
    client.end().catch(() => {});
    scheduleReconnect();
  };
  client.on("error", lost);
  client.on("end", () => lost());
  client.on("notification", (msg) => {
    if (msg.channel === REALTIME_CHANNEL) dispatch(msg.payload);
  });

  try {
    await client.connect();
    await client.query(`LISTEN ${REALTIME_CHANNEL}`);
    if (st.client !== client) {
      // stopped (or superseded) while connecting
      await client.end().catch(() => {});
      return;
    }
    st.listening = true;
    st.attempt = 0;
  } catch (err) {
    lost(err);
  }
}

/**
 * Opens the single long-lived LISTEN connection. Idempotent; resolves once the first connection
 * attempt finished. A failed attempt does not throw: it is retried with 1-2-4-8 s backoff.
 */
export function startRealtimeListener(): Promise<void> {
  const st = state();
  st.stopped = false;
  if (!st.starting) {
    st.starting = connect().finally(() => {
      // Keep the promise cached only while a client exists or a retry is pending.
      if (!st.client && !st.timer) st.starting = undefined;
    });
  }
  return st.starting;
}

/** Closes the listener and cancels pending reconnects. Subscribers stay registered. */
export async function stopRealtimeListener(): Promise<void> {
  const st = state();
  st.stopped = true;
  st.starting = undefined;
  st.listening = false;
  if (st.timer) {
    clearTimeout(st.timer);
    st.timer = undefined;
  }
  const client = st.client;
  st.client = undefined;
  if (client) {
    client.removeAllListeners();
    client.on("error", () => {});
    await client.end().catch(() => {});
  }
}
