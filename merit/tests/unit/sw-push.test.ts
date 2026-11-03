import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");

type Handler = (event: Record<string, unknown>) => void;

function load(opts: { clients?: Record<string, unknown>[]; keys?: string[] } = {}) {
  const handlers: Record<string, Handler> = {};
  const showNotification = vi.fn(async () => {});
  const openWindow = vi.fn(async () => null);
  const deleted: string[] = [];
  const self = {
    location: { origin: "https://merit.example.test" },
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    registration: { showNotification },
    clients: {
      matchAll: vi.fn(async () => opts.clients ?? []),
      openWindow,
      claim: vi.fn(async () => {}),
    },
    skipWaiting: vi.fn(async () => {}),
  };
  const caches = {
    keys: async () => opts.keys ?? [],
    delete: async (k: string) => {
      deleted.push(k);
      return true;
    },
    open: async () => ({ addAll: async () => {}, match: async () => undefined, put: async () => {}, keys: async () => [] }),
  };
  vm.runInNewContext(source, { self, caches, URL, Response, fetch: async () => new Response("ok"), console }, { filename: "sw.js" });
  return { handlers, showNotification, openWindow, deleted, self };
}

function pushEvent(data: unknown, raw = false) {
  const waits: Promise<unknown>[] = [];
  return {
    event: {
      data: { json: () => (raw ? JSON.parse(data as string) : data) },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    },
    done: () => Promise.all(waits),
  };
}

describe("sw push", () => {
  it("geçerli yük bildirim gösterir; mybar etiketi etkileşim ister", async () => {
    const sw = load();
    const { event, done } = pushEvent({ title: "Oda 101 - Yeni MyBar talebi", body: "b", url: "/kat/mybar?focus=1", tag: "mybar-1" });
    sw.handlers.push!(event);
    await done();
    expect(sw.showNotification).toHaveBeenCalledWith(
      "Oda 101 - Yeni MyBar talebi",
      expect.objectContaining({ body: "b", tag: "mybar-1", requireInteraction: true, data: { url: "/kat/mybar?focus=1" } }),
    );
  });

  it("görünür ve odaklı istemci varsa bildirim gösterilmez, postMessage gider", async () => {
    const postMessage = vi.fn();
    const sw = load({ clients: [{ visibilityState: "visible", focused: true, postMessage }] });
    const { event, done } = pushEvent({ title: "t", body: "b", url: "/", tag: "x-1" });
    sw.handlers.push!(event);
    await done();
    expect(sw.showNotification).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "push" }));
  });

  it("bozuk JSON genel bildirim gösterir, istisna yok", async () => {
    const sw = load();
    const { event, done } = pushEvent("{bozuk", true);
    sw.handlers.push!(event);
    await done();
    expect(sw.showNotification).toHaveBeenCalledWith("Merit OS", expect.objectContaining({ body: "Yeni bildirim", data: { url: "/" } }));
  });
});

describe("sw notificationclick", () => {
  const click = (sw: ReturnType<typeof load>, url: string) => {
    const close = vi.fn();
    const waits: Promise<unknown>[] = [];
    sw.handlers.notificationclick!({ notification: { close, data: { url } }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    return { close, done: () => Promise.all(waits) };
  };

  it("mevcut pencere varsa focus + navigate", async () => {
    const focus = vi.fn(async () => {});
    const navigate = vi.fn(async () => {});
    const sw = load({ clients: [{ focus, navigate }] });
    const c = click(sw, "/kat/mybar?focus=1");
    await c.done();
    expect(c.close).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("https://merit.example.test/kat/mybar?focus=1");
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it("pencere yoksa openWindow", async () => {
    const sw = load();
    await click(sw, "/kat/mybar").done();
    expect(sw.openWindow).toHaveBeenCalledWith("https://merit.example.test/kat/mybar");
  });

  it("başka origin kökə düşer", async () => {
    const sw = load();
    await click(sw, "https://evil.test/x").done();
    expect(sw.openWindow).toHaveBeenCalledWith("https://merit.example.test/");
  });
});

describe("sw önbellek kuralları", () => {
  const fetchEvent = (pathname: string) => {
    const respondWith = vi.fn();
    return {
      respondWith,
      event: { request: { method: "GET", mode: "cors", url: `https://merit.example.test${pathname}` }, respondWith },
    };
  };

  it("API isteğine respondWith çağrılmaz, statik varlığa çağrılır", () => {
    const sw = load();
    const api = fetchEvent("/api/x");
    sw.handlers.fetch!(api.event);
    expect(api.respondWith).not.toHaveBeenCalled();
    const asset = fetchEvent("/_next/static/a.js");
    sw.handlers.fetch!(asset.event);
    expect(asset.respondWith).toHaveBeenCalled();
  });

  it("activate eski merit önbelleklerini siler", async () => {
    const sw = load({ keys: ["merit-static-v1", "merit-static-v3", "merit-media-v3", "baska"] });
    const waits: Promise<unknown>[] = [];
    sw.handlers.activate!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect(sw.deleted).toEqual(["merit-static-v1"]);
  });
});
