import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { testDb } from "../helpers/db";

// The listener and the publisher must talk to the test database, not the dev one.
vi.mock("@/lib/env", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/env")>();
  return { env: { ...actual.env, DATABASE_URL: process.env.DATABASE_URL_TEST! } };
});
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const {
  isListening,
  listenerCount,
  matchesScope,
  publish,
  startRealtimeListener,
  stopRealtimeListener,
  subscribe,
} = await import("@/lib/realtime");
const { createSseStream } = await import("@/lib/sse");

const evt = (patch: Partial<MeritEvent> = {}): MeritEvent => ({
  type: "test.ping",
  at: "2026-06-15T12:00:00.000Z",
  ...patch,
});
const scope = (patch: Partial<Parameters<typeof matchesScope>[1]> = {}) => ({
  userId: "u1",
  sessionId: "s1",
  hotelIds: ["h1"],
  roleKind: "OUTLET" as const,
  ...patch,
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pgQuery(sql: string) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

/** Resolves with the first event delivered to a catch-all subscriber, or rejects after `ms`. */
function nextEvent(ms = 500): { promise: Promise<MeritEvent>; unsubscribe: () => void } {
  let unsubscribe = () => {};
  const promise = new Promise<MeritEvent>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("olay zamanında gelmedi")), ms);
    unsubscribe = subscribe(
      () => true,
      (e) => {
        clearTimeout(timer);
        resolve(e);
      },
    );
  });
  return { promise, unsubscribe };
}

describe("matchesScope", () => {
  it("userIds içinde kullanıcı varsa eşleşir", () => {
    expect(matchesScope(evt({ userIds: ["u1", "u2"], hotelId: "other" }), scope())).toBe(true);
  });
  it("userIds içinde kullanıcı yoksa (otel kapsamda olsa da) eşleşmez", () => {
    expect(matchesScope(evt({ userIds: ["u2"], hotelId: "h1" }), scope())).toBe(false);
  });
  it("userIds yokken otel kapsamdaysa eşleşir", () => {
    expect(matchesScope(evt({ hotelId: "h1" }), scope())).toBe(true);
  });
  it("userIds yokken otel kapsamda değilse eşleşmez", () => {
    expect(matchesScope(evt({ hotelId: "h2" }), scope())).toBe(false);
  });
  it("outlet oturumun outleti ise eşleşir, değilse eşleşmez", () => {
    const e = evt({ hotelId: "h1", outletId: "o1" });
    expect(matchesScope(e, scope({ outletId: "o1" }))).toBe(true);
    expect(matchesScope(e, scope({ outletId: "o2" }))).toBe(false);
  });
  it("SISTEM ve YONETIM rolü outlet'siz de olsa her outlet olayını alır", () => {
    const e = evt({ hotelId: "h1", outletId: "o1" });
    expect(matchesScope(e, scope({ roleKind: "SISTEM" }))).toBe(true);
    expect(matchesScope(e, scope({ roleKind: "YONETIM" }))).toBe(true);
    expect(matchesScope(e, scope({ roleKind: "MUTFAK" }))).toBe(false);
  });
  it("roleKinds varsa rol türü içinde olmalı", () => {
    const e = evt({ hotelId: "h1", roleKinds: ["MUTFAK", "SISTEM"] });
    expect(matchesScope(e, scope({ roleKind: "MUTFAK" }))).toBe(true);
    expect(matchesScope(e, scope({ roleKind: "OUTLET" }))).toBe(false);
  });
  it("userId de otel de yoksa (sistem geneli) herkese gider", () => {
    expect(matchesScope(evt({ type: "settings.changed" }), scope())).toBe(true);
  });
});

describe("publish / subscribe (gerçek Postgres)", () => {
  beforeAll(async () => {
    await startRealtimeListener();
  });
  afterEach(() => expect(listenerCount()).toBe(0));
  afterAll(async () => {
    await stopRealtimeListener();
    await testDb.$disconnect();
  });

  it("dinleyici başlar ve başlatma tekrar çağrılınca aynı bağlantıyı kullanır", async () => {
    // Other test files (running in parallel workers) may hold their own LISTEN connection on this
    // database, so idempotency is asserted as "starting again adds no connection".
    const count = async () => {
      const { rows } = await pgQuery(
        "select count(*)::int as n from pg_stat_activity " +
          "where query = 'LISTEN merit_events' and datname = current_database()",
      );
      return rows[0].n as number;
    };
    expect(isListening()).toBe(true);
    const before = await count();
    expect(before).toBeGreaterThanOrEqual(1);
    await startRealtimeListener();
    await startRealtimeListener();
    expect(isListening()).toBe(true);
    expect(await count()).toBe(before);
  });

  it("publish → abone 500 ms içinde olayı alır; unsubscribe sonrası sayaç 0", async () => {
    const { promise, unsubscribe } = nextEvent();
    expect(listenerCount()).toBe(1);
    await publish({ type: "test.ping", hotelId: "x", payload: { a: 1 } });
    const got = await promise;
    expect(got).toMatchObject({ type: "test.ping", hotelId: "x", payload: { a: 1 } });
    expect(typeof got.at).toBe("string");
    unsubscribe();
    expect(listenerCount()).toBe(0);
  });

  it("filtre uymayan olay aboneye ulaşmaz", async () => {
    const cb = vi.fn();
    const off = subscribe((e) => e.hotelId === "mine", cb);
    await publish({ type: "test.ping", hotelId: "other" });
    await publish({ type: "test.ping", hotelId: "mine" });
    await sleep(300);
    off();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].hotelId).toBe("mine");
  });

  it("commit olan transaction içindeki publish iletilir", async () => {
    const { promise, unsubscribe } = nextEvent();
    await testDb.$transaction(async (tx) => {
      await publish({ type: "test.tx", hotelId: "x" }, tx);
    });
    expect((await promise).type).toBe("test.tx");
    unsubscribe();
  });

  it("rollback olan transaction içindeki publish iletilmez", async () => {
    const cb = vi.fn();
    const off = subscribe(() => true, cb);
    await expect(
      testDb.$transaction(async (tx) => {
        await publish({ type: "test.rollback", hotelId: "x" }, tx);
        throw new Error("geri al");
      }),
    ).rejects.toThrow("geri al");
    await sleep(300);
    off();
    expect(cb).not.toHaveBeenCalled();
  });

  it("7500 baytı aşan yük kırpılır ve payloadTruncated işaretlenir", async () => {
    const { promise, unsubscribe } = nextEvent();
    await publish({ type: "test.big", hotelId: "x", payload: { blob: "x".repeat(9000) } });
    const got = await promise;
    expect(got.payload).toBeUndefined();
    expect(got.payloadTruncated).toBe(true);
    expect(got.hotelId).toBe("x");
    unsubscribe();
  });

  it("bozuk bir aboneyi atlar, diğerleri çalışır", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const good = vi.fn();
    const offBad = subscribe(
      () => true,
      () => {
        throw new Error("abone hatası");
      },
    );
    const offGood = subscribe(() => true, good);
    await publish({ type: "test.ping", hotelId: "x" });
    await sleep(300);
    offBad();
    offGood();
    err.mockRestore();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("sınırı aşan olayı anlaşılır bir hatayla reddeder (pg'nin ham hatası sızmaz)", async () => {
    const userIds = Array.from({ length: 400 }, (_, i) => `ckxxxxxxxxxxxxxxxxxxxxx${i}`);
    await expect(publish({ type: "test.huge", userIds })).rejects.toMatchObject({
      name: "DomainError",
      code: "INTERNAL",
      message: "Gerçek zaman olayı 8000 bayt sınırını aşıyor",
    });
  });

  it("geçersiz biçimli olaylar (null, dizi, kötü type) yoksayılır, abone çağrılmaz", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cb = vi.fn();
    const off = subscribe(() => true, cb);
    for (const raw of ["null", "[1]", '"x"', '{"type":"a\\nb"}', '{"type":5}', '{"type":""}']) {
      await pgQuery(`select pg_notify('merit_events', '${raw}')`);
    }
    await publish({ type: "test.ok", hotelId: "x" }); // the listener is still alive afterwards
    await sleep(300);
    off();
    const calls = warn.mock.calls.length;
    warn.mockRestore();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].type).toBe("test.ok");
    expect(calls).toBe(6);
  });

  it("bağlantı koparsa geri çekilmeyle yeniden bağlanır ve olaylar yine gelir", async () => {
    await pgQuery(
      "select pg_terminate_backend(pid) from pg_stat_activity where query = 'LISTEN merit_events'",
    );
    const cb = vi.fn();
    const off = subscribe(() => true, cb);
    const deadline = Date.now() + 6000;
    while (cb.mock.calls.length === 0 && Date.now() < deadline) {
      await publish({ type: "test.reconnect", hotelId: "x" });
      await sleep(400);
    }
    off();
    expect(cb).toHaveBeenCalled();
    expect(isListening()).toBe(true);
  }, 10_000);

  it("yeniden bağlanınca abonelere realtime.resync gönderilir; ilk bağlantıda gönderilmez", async () => {
    const seen: string[] = [];
    const off = subscribe(() => true, (e) => seen.push(e.type));
    await pgQuery(
      "select pg_terminate_backend(pid) from pg_stat_activity where query = 'LISTEN merit_events'",
    );
    const deadline = Date.now() + 6000;
    while (!seen.includes("realtime.resync") && Date.now() < deadline) await sleep(100);
    off();
    expect(seen.filter((t) => t === "realtime.resync")).toHaveLength(1);
    expect(isListening()).toBe(true);
  }, 10_000);
});

describe("createSseStream", () => {
  beforeAll(async () => {
    await startRealtimeListener();
  });
  afterAll(async () => {
    await stopRealtimeListener();
  });

  const decoder = new TextDecoder();
  async function readUntil(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    needle: string,
    ms = 1000,
  ): Promise<string> {
    let buf = "";
    const deadline = Date.now() + ms;
    while (!buf.includes(needle)) {
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`"${needle}" gelmedi; alınan: ${buf}`);
      const r = await Promise.race([
        reader.read(),
        sleep(left).then(() => "timeout" as const),
      ]);
      if (r === "timeout") throw new Error(`"${needle}" gelmedi; alınan: ${buf}`);
      if (r.done) break;
      buf += decoder.decode(r.value);
    }
    return buf;
  }

  it("önce hello, sonra yalnız kapsama uyan olayları yazar; kullanıcı kimlikleri sızmaz", async () => {
    const ac = new AbortController();
    const base = listenerCount();
    const reader = createSseStream(scope({ hotelIds: ["h1"] }), { signal: ac.signal }).getReader();
    expect(listenerCount()).toBe(base + 1);
    const hello = await readUntil(reader, "\n\n");
    expect(hello).toMatch(/^event: hello\ndata: \{"at":"[^"]+"\}\n\n/);

    await publish({ type: "test.ping", hotelId: "h2" }); // kapsam dışı
    await publish({ type: "notification.created", hotelId: "h1", userIds: ["u1", "u9"] });
    const got = await readUntil(reader, "\n\n");
    expect(got).toMatch(/^event: notification\.created\ndata: \{/);
    expect(got).not.toContain("test.ping");
    expect(got).not.toContain("u9");
    ac.abort();
  });

  it("abort: abonelik kalkar, akış kapanır, ping aralığı temizlenir", async () => {
    const clear = vi.spyOn(globalThis, "clearInterval");
    const ac = new AbortController();
    const base = listenerCount();
    const reader = createSseStream(scope(), { signal: ac.signal, pingMs: 30 }).getReader();
    expect(listenerCount()).toBe(base + 1);
    await readUntil(reader, ": ping\n\n");

    ac.abort();
    expect(listenerCount()).toBe(base);
    expect(clear).toHaveBeenCalled();
    // Once the queued chunks are drained the stream must be closed (no further pings).
    let done = false;
    for (let i = 0; i < 20 && !done; i++) done = (await reader.read()).done;
    expect(done).toBe(true);
    clear.mockRestore();
  });

  it("azami ömür dolunca reconnect olayı yazar ve akışı kapatır", async () => {
    const base = listenerCount();
    const reader = createSseStream(scope(), {
      signal: new AbortController().signal,
      maxLifetimeMs: 50,
    }).getReader();
    expect(listenerCount()).toBe(base + 1);
    const got = await readUntil(reader, "event: reconnect\ndata: {}\n\n");
    expect(got).toContain("event: hello");
    expect((await reader.read()).done).toBe(true);
    expect(listenerCount()).toBe(base);
  });

  it("zaten abort edilmiş sinyalde abonelik hiç açılmaz", () => {
    const ac = new AbortController();
    ac.abort();
    const base = listenerCount();
    createSseStream(scope(), { signal: ac.signal });
    expect(listenerCount()).toBe(base);
  });

  it("istemci akışı iptal ederse (cancel) abonelik kalkar", async () => {
    const base = listenerCount();
    const stream = createSseStream(scope(), { signal: new AbortController().signal });
    expect(listenerCount()).toBe(base + 1);
    await stream.cancel();
    expect(listenerCount()).toBe(base);
  });
});
