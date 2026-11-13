import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSseClient,
  GRACE_MS,
  MIN_DELAY_MS,
  type EventSourceLike,
  type SseClient,
} from "@/shell/sseStore";

type Listener = (ev: MessageEvent<string>) => void;

class FakeEventSource implements EventSourceLike {
  onopen: ((ev: Event) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  closed = false;
  listeners = new Map<string, Listener[]>();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.(new Event("open"));
  }
  emit(type: string, data: unknown) {
    const ev = { type, data: JSON.stringify(data) } as MessageEvent<string>;
    for (const l of this.listeners.get(type) ?? []) l(ev);
  }
  fail() {
    this.onerror?.(new Event("error"));
  }
}

let sources: FakeEventSource[];
let probe: ReturnType<typeof vi.fn<(url: string) => Promise<number>>>;
let signedOut: ReturnType<typeof vi.fn<(path: string) => void>>;
let client: SseClient;
const last = () => sources[sources.length - 1];
const status = () => client.store.getState().status;
const event = (type: string, extra: object = {}) => ({
  type,
  at: "2026-10-31T10:00:00Z",
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers();
  sources = [];
  probe = vi.fn(async () => 204);
  signedOut = vi.fn();
  client = createSseClient({
    createEventSource: (url) => {
      const es = new FakeEventSource(url);
      sources.push(es);
      return es;
    },
    probe,
    signedOut,
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("sseStore: sekme başına tek EventSource", () => {
  it("üç abone tek bağlantıyı paylaşır; olaylar türe göre dağıtılır", () => {
    const all = vi.fn();
    const onlyNotif = vi.fn();
    const none = vi.fn();
    client.subscribe(all);
    client.subscribe(onlyNotif, ["notification.created"]);
    client.subscribe(none, []);
    expect(sources).toHaveLength(1);
    expect(last().url).toBe("/api/sse");
    expect(status()).toBe("connecting");
    last().open();
    expect(status()).toBe("open");

    last().emit("notification.created", event("notification.created"));
    last().emit("settings.changed", event("settings.changed"));
    expect(all).toHaveBeenCalledTimes(2);
    expect(onlyNotif).toHaveBeenCalledTimes(1);
    expect(none).not.toHaveBeenCalled();
  });

  it("yeni türle gelen abone mevcut bağlantıya dinleyici ekler (yeni bağlantı açmaz)", () => {
    client.subscribe(vi.fn());
    const custom = vi.fn();
    client.subscribe(custom, ["order.created"]);
    expect(sources).toHaveLength(1);
    last().emit("order.created", event("order.created"));
    expect(custom).toHaveBeenCalledTimes(1);
  });

  it("son abone ayrılınca 5 sn sonra kapanır; arada gelen abone bağlantıyı korur", () => {
    const off1 = client.subscribe(vi.fn());
    last().open();
    off1();
    vi.advanceTimersByTime(GRACE_MS - 1);
    expect(last().closed).toBe(false);
    const off2 = client.subscribe(vi.fn());
    vi.advanceTimersByTime(GRACE_MS * 2);
    expect(sources).toHaveLength(1);
    expect(last().closed).toBe(false);

    off2();
    vi.advanceTimersByTime(GRACE_MS);
    expect(last().closed).toBe(true);
    expect(status()).toBe("closed");

    client.subscribe(vi.fn());
    expect(sources).toHaveLength(2);
  });

  it("bir abonenin hatası diğerlerini durdurmaz", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = vi.fn();
    client.subscribe(() => {
      throw new Error("boom");
    });
    client.subscribe(ok);
    last().emit("settings.changed", event("settings.changed"));
    expect(ok).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("session.closed: aboneye iletilir, bağlantı kapanır, /giris'e gider, yeniden bağlanmaz", () => {
    const seen = vi.fn();
    client.subscribe(seen, ["session.closed"]);
    last().open();
    last().emit("session.closed", event("session.closed"));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(last().closed).toBe(true);
    expect(signedOut).toHaveBeenCalledWith("/giris");
    expect(status()).toBe("closed");
    client.subscribe(vi.fn());
    vi.advanceTimersByTime(60_000);
    expect(sources).toHaveLength(1);
  });

  it("outlet/otel geçişi duyurulduysa session.closed girişe atmaz, yeni oturumla yeniden bağlanır", () => {
    client.subscribe(vi.fn());
    last().open();
    client.expectSwitch();
    last().emit("session.closed", event("session.closed"));
    expect(signedOut).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(sources).toHaveLength(2);
    // The next session.closed is a real one again.
    last().open();
    last().emit("session.closed", event("session.closed"));
    expect(signedOut).toHaveBeenCalledWith("/giris");
  });

  it("geçiş iptal edilirse session.closed yine girişe gönderir", () => {
    client.subscribe(vi.fn());
    last().open();
    client.expectSwitch()();
    last().emit("session.closed", event("session.closed"));
    expect(signedOut).toHaveBeenCalledWith("/giris");
  });

  it("reconnect: eski akış kapanır, hemen yenisi açılır", () => {
    client.subscribe(vi.fn());
    const first = last();
    first.open();
    first.emit("reconnect", {});
    expect(first.closed).toBe(true);
    expect(sources).toHaveLength(2);
    // Frames still arriving on the old source are ignored.
    const late = vi.fn();
    client.subscribe(late);
    first.emit("settings.changed", event("settings.changed"));
    expect(late).not.toHaveBeenCalled();
  });
});

describe("sseStore: kopma, HEAD yoklaması ve geri çekilme", () => {
  it("durum başlangıçta 'connecting' (henüz hiç bağlanılmadı)", () => {
    expect(status()).toBe("connecting");
  });

  it("kopmadan sonra yeniden açılınca realtime.resync iletilir; ilk açılışta iletilmez", async () => {
    const resync = vi.fn();
    client.subscribe(resync, ["realtime.resync"]);
    last().open();
    expect(resync).not.toHaveBeenCalled();
    last().fail();
    await vi.advanceTimersByTimeAsync(MIN_DELAY_MS);
    expect(sources).toHaveLength(2);
    last().open();
    expect(resync).toHaveBeenCalledTimes(1);
    expect(resync.mock.calls[0][0]).toMatchObject({ type: "realtime.resync" });
    // A later open without a drop in between does not resync again.
    last().open();
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it("sunucu 'reconnect' çerçevesiyle akışı yenilediğinde de yeni açılışta resync iletilir", () => {
    const resync = vi.fn();
    client.subscribe(resync, ["realtime.resync"]);
    last().open();
    last().emit("reconnect", {});
    expect(sources).toHaveLength(2);
    last().open();
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it("hata → HEAD 204 → 1 sn, sonra 2 sn bekleyip yeniden bağlanır", async () => {
    client.subscribe(vi.fn());
    last().fail();
    expect(sources[0].closed).toBe(true);
    expect(status()).toBe("connecting");
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledWith("/api/sse");
    await vi.advanceTimersByTimeAsync(MIN_DELAY_MS - 1);
    expect(sources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sources).toHaveLength(2);

    last().fail();
    await vi.advanceTimersByTimeAsync(MIN_DELAY_MS);
    expect(sources).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(MIN_DELAY_MS);
    expect(sources).toHaveLength(3);

    // A successful open resets the backoff.
    last().open();
    last().fail();
    await vi.advanceTimersByTimeAsync(MIN_DELAY_MS);
    expect(sources).toHaveLength(4);
  });

  it("hata → HEAD 401 → yeniden bağlanmaz, /giris'e gider", async () => {
    probe.mockResolvedValue(401);
    client.subscribe(vi.fn());
    last().open();
    last().fail();
    await vi.advanceTimersByTimeAsync(0);
    expect(signedOut).toHaveBeenCalledWith("/giris");
    expect(status()).toBe("closed");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sources).toHaveLength(1);
  });

  it("HEAD ağ hatası → geri çekilmeyle denemeye devam eder", async () => {
    probe.mockRejectedValue(new TypeError("Failed to fetch"));
    client.subscribe(vi.fn());
    last().fail();
    await vi.advanceTimersByTimeAsync(MIN_DELAY_MS);
    expect(sources).toHaveLength(2);
    expect(signedOut).not.toHaveBeenCalled();
  });

  it("yoklama sürerken gelen abone ikinci bağlantı açmaz", async () => {
    let resolve!: (n: number) => void;
    probe.mockImplementation(() => new Promise<number>((r) => (resolve = r)));
    client.subscribe(vi.fn());
    last().fail();
    client.subscribe(vi.fn());
    expect(sources).toHaveLength(1);
    resolve(204);
    await vi.advanceTimersByTimeAsync(MIN_DELAY_MS);
    expect(sources).toHaveLength(2);
  });
});
