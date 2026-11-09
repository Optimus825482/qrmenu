// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareRadarEvents } from "@/modules/radar/events";
import type { RadarEventType } from "@/modules/radar/types";
import { reduce } from "@/modules/radar/ui/reducers";
import { deriveAlerts } from "@/modules/radar/alerts";
import { initialState, type RadarState } from "@/modules/radar/state";
import { buildDemoScenario, DEMO_SPAN_MIN, type DemoFocus } from "@/modules/radar/ui/demo/demoScenario";
import { DemoDialog } from "@/modules/radar/ui/DemoDialog";
import { RadarRoot } from "@/modules/radar/ui/RadarRoot";
import { DEMO_END_HOLD_MS, useDemo } from "@/modules/radar/ui/demo/useDemo";
import { Toolbar } from "@/modules/radar/ui/Toolbar";
import { H, iso, makeSnapshot } from "../helpers/radarStateFixtures";
import { harness } from "../helpers/radarStoreHarness";

const START = Date.parse("2026-11-07T10:00:00.000Z");

vi.mock("@/modules/radar/server/actions/radar", async () => {
  const { makeSnapshot: make } = await import("../helpers/radarStateFixtures");
  return {
    radarSnapshotAction: async ({ hotelId }: { hotelId: string }) => ({
      ok: true,
      data: {
        ...make({ generatedAt: new Date().toISOString() }),
        hotelId,
        people: {},
        config: {
          liveBufferMinutes: 30,
          idleMinutes: 15,
          mybarStaleMinutes: 12,
          callAlertSeconds: 120,
          approvalEscalationMinutes: 4,
          slaMinutes: 20,
          wallRotateSeconds: 20,
          wallViews: ["genel", "kat", "masa", "kuyruk"],
          soundOnEscalation: false,
          replayRetentionDays: 90,
        },
      },
    }),
    radarOverviewAction: async () => ({ ok: true, data: { generatedAt: new Date().toISOString(), hotels: [] } }),
  };
});
vi.mock("@/shell/sseStore", async () => {
  const { createStore } = await import("zustand/vanilla");
  const sse = { store: createStore(() => ({ status: "open" })), subscribe: () => () => undefined };
  return { sseClient: () => sse };
});

/** Compile-time exhaustive: adding a RadarEvent type without listing it here fails the build. */
const ALL_TYPES: Record<RadarEventType, true> = {
  "order.status": true,
  "order.escalated": true,
  "order.sla": true,
  "call.opened": true,
  "call.closed": true,
  "table.scanned": true,
  "table.cleared": true,
  "table.assigned": true,
  "print.job": true,
  "printer.health": true,
  "room.checked": true,
  "room.check.changed": true,
  "room.scanned": true,
  "dnd.marked": true,
  "dnd.missed": true,
  "mybar.opened": true,
  "mybar.seen": true,
  "mybar.closed": true,
  "task.updated": true,
  "task.generated": true,
  "stock.level": true,
  "upload.status": true,
  presence: true,
  "mail.failed": true,
  "outlet.ordering": true,
};

describe("demoScenario", () => {
  const fake = () => buildDemoScenario({ hotelId: H, startMs: START });

  it("aynı tohumla aynı gün, farklı tohumla farklı gün üretir", () => {
    expect(JSON.stringify(fake())).toBe(JSON.stringify(fake()));
    const other = buildDemoScenario({ hotelId: H, startMs: START, seed: 7 });
    expect(JSON.stringify(other.events)).not.toBe(JSON.stringify(fake().events));
  });

  it("olaylar sıralı, kimlikleri tekil ve hepsi anlık görüntüden sonra", () => {
    const s = fake();
    const sorted = [...s.events].sort(compareRadarEvents);
    expect(s.events.map((e) => e.id)).toEqual(sorted.map((e) => e.id));
    expect(new Set(s.events.map((e) => e.id)).size).toBe(s.events.length);
    for (const e of s.events) {
      expect(Date.parse(e.at)).toBeGreaterThan(Date.parse(s.snapshot.generatedAt));
      expect(Date.parse(e.at)).toBeLessThan(s.endMs);
      expect(e.hotelId).toBe(H);
    }
    expect(s.endMs - s.startMs).toBeLessThanOrEqual((DEMO_SPAN_MIN + 1) * 60_000);
    expect(s.events.length).toBeGreaterThan(80);
  });

  it("her olay türü en az bir kez bulunur (yerleşik otel)", () => {
    const present = new Set(fake().events.map((e) => e.type));
    expect([...present].sort()).toEqual(Object.keys(ALL_TYPES).sort());
    expect(new Set(fake().events.map((e) => e.layer))).toEqual(
      new Set(["MINIBAR", "SIPARIS", "ODA_SERVISI", "PERSONEL", "SISTEM"]),
    );
  });

  it("olaylar indirgeyicilerde çözülür: bilinmeyen oda/masa yenileme isteği yok, SLA UYARI sonra AŞIM", () => {
    const s = fake();
    let st = initialState(s.snapshot);
    const levels: string[] = [];
    const kinds = new Set<string>();
    const alertsAt = (cur: RadarState, ms: number) =>
      deriveAlerts(cur.layers, new Date(ms), cur.config, { hotelId: H, isSystem: true, mailFailed: cur.mailFailed });
    let nextCheck = s.startMs;
    for (const e of s.events) {
      for (; nextCheck <= Date.parse(e.at); nextCheck += 30_000) for (const a of alertsAt(st, nextCheck)) kinds.add(a.kind);
      st = reduce(st, e);
      if (e.type === "order.sla") levels.push(st.layers.roomService?.orders.find((o) => o.orderId === e.orderId)?.level ?? "?");
    }
    for (const a of alertsAt(st, s.endMs)) kinds.add(a.kind);
    // task.generated asks for a full refetch by design; nothing else is unresolved (replay ignores the request).
    expect([...st.needsRefresh]).toEqual(["ALL"]);
    for (const k of ["SIPARIS_ONAY", "RS_SLA", "CAGRI", "YAZICI_IS", "YAZICI", "STOK", "MYBAR", "DND_EKSIK", "EPOSTA"]) {
      expect(kinds.has(k), k).toBe(true);
    }
    expect(levels).toEqual(["WARN", "BREACH"]);
    expect(st.mailFailed).toBe(2);
  });

  it("yüklü anlık görüntüdeki kimlikler kullanılır ve geçici durum temizlenir", () => {
    const base = makeSnapshot({ tables: 6, generatedAt: iso(START) });
    const rooms = new Set(base.layers.minibar!.floors.flatMap((f) => f.rooms.map((r) => r.roomId)));
    const tables = new Set(base.layers.order!.outlets.flatMap((o) => o.areas.flatMap((a) => a.tables.map((t) => t.tableId))));
    const s = buildDemoScenario({ hotelId: H, startMs: START, base });
    expect(base.generatedAt).toBe(iso(START)); // the live snapshot is not mutated
    expect(s.snapshot.layers.minibar!.floors.flatMap((f) => f.rooms).every((r) => r.mybar === null && r.dnd === null)).toBe(true);
    for (const e of s.events) {
      if ("roomId" in e && e.roomId && e.type !== "order.status") expect(rooms.has(e.roomId), e.type).toBe(true);
      if ("tableId" in e && e.tableId) expect(tables.has(e.tableId), e.type).toBe(true);
    }
    let st = initialState(s.snapshot);
    for (const e of s.events) st = reduce(st, e);
    expect([...st.needsRefresh].filter((k) => k !== "ALL")).toEqual([]);
    expect(s.events.some((e) => e.type === "room.checked")).toBe(true);
  });

  it("katman yoksa o katmanın olayı üretilmez", () => {
    const base = makeSnapshot({ generatedAt: iso(START) });
    delete base.layers.minibar;
    delete base.layers.roomService;
    const types = new Set(buildDemoScenario({ hotelId: H, startMs: START, base }).events.map((e) => e.type));
    for (const t of ["room.checked", "mybar.opened", "stock.level", "order.sla"] as const) expect(types.has(t)).toBe(false);
    expect(types.has("order.status")).toBe(true);
  });
});

describe("demo kaynağı yazma yolu kullanmaz", () => {
  const dir = join(__dirname, "..", "..", "src", "modules", "radar", "ui", "demo");
  const files = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
  it("demo dosyaları sunucu eylemi, veritabanı, yayın veya gerçek zamanlı modülü içe aktarmaz", () => {
    expect(files.sort()).toEqual(["demoScenario.ts", "useDemo.ts"]);
    const banned = /(\/server\/actions|@\/lib\/db|prisma|\/publish|realtime|@\/lib\/rbac|fetch\(|EventSource|sseClient)/;
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8");
      for (const line of text.split("\n")) {
        if (/^\s*import\s/.test(line) && !/^\s*import type\b/.test(line)) expect(line, f).not.toMatch(banned);
        if (/^\s*(\/\/|\*)/.test(line)) continue;
        expect(line, f).not.toMatch(/fetch\(|EventSource|sseClient|publish\(/);
      }
    }
  });
});

function Probe({ store, hotelId = H }: { store: ReturnType<typeof harness>["store"]; hotelId?: string }) {
  const demo = useDemo(store, { hotelId, enabled: true });
  return (
    <Toolbar
      idPrefix="t"
      hotels={[{ id: H, code: "H1", name: "Otel" }]}
      hotelId={hotelId}
      onHotel={() => undefined}
      layers={[]}
      active={new Set()}
      onToggleLayer={() => undefined}
      views={["genel"]}
      view="genel"
      onView={() => undefined}
      connection="live"
      demo={{ running: demo.running, disabled: false, onStart: demo.start, onStop: demo.stop }}
    />
  );
}

describe("Demo başlat / durdur", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(START);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function boot() {
    const h = harness({ snapshot: () => makeSnapshot({ generatedAt: new Date(START).toISOString() }) });
    h.setNow(START);
    await h.boot(H);
    return h;
  }
  const settle = async () => {
    for (let i = 0; i < 20; i++) await act(async () => Promise.resolve());
  };

  it("rozet yalnız demo sürerken görünür; Demo durdur canlıya döner ve temizler", async () => {
    const h = await boot();
    render(<Probe store={h.store} />);
    expect(screen.queryByTestId("radar-demo-badge")).toBeNull();
    fireEvent.click(screen.getByTestId("radar-demo-start"));
    await settle();
    expect(screen.getByTestId("radar-demo-badge").textContent).toBe("DEMO");
    expect(h.store.getState().mode).toBe("replay");
    expect(h.store.getState().replay?.speed).toBe(10);
    expect(screen.queryByTestId("radar-demo-start")).toBeNull();

    await act(async () => h.advance(20_000));
    expect(h.store.getState().buffer.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("radar-demo-stop"));
    await settle();
    expect(screen.queryByTestId("radar-demo-badge")).toBeNull();
    expect(screen.getByTestId("radar-demo-start")).toBeTruthy();
    expect(h.store.getState().mode).toBe("live");
    expect(h.store.getState().replay).toBeNull();
    h.store.getState().stop();
  });

  it("betik bitince kendiliğinden durur ve canlıya döner", async () => {
    const h = await boot();
    render(<Probe store={h.store} />);
    fireEvent.click(screen.getByTestId("radar-demo-start"));
    await settle();
    // 30 virtual minutes at 10x = 3 real minutes.
    await act(async () => h.advance((DEMO_SPAN_MIN * 60_000) / 10 + 5_000));
    const s = h.store.getState();
    expect(s.replay?.atEnd).toBe(true);
    expect(s.buffer.length).toBe(s.replay?.totalEvents);
    expect(screen.getByTestId("radar-demo-badge")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(DEMO_END_HOLD_MS + 50);
    });
    await settle();
    expect(screen.queryByTestId("radar-demo-badge")).toBeNull();
    expect(h.store.getState().mode).toBe("live");
    h.store.getState().stop();
  });

  it("başka yoldan (Esc / Canlıya dön) tekrar bitince rozet kalkar", async () => {
    const h = await boot();
    render(<Probe store={h.store} />);
    fireEvent.click(screen.getByTestId("radar-demo-start"));
    await settle();
    expect(screen.getByTestId("radar-demo-badge")).toBeTruthy();
    await act(async () => {
      h.store.getState().exitReplay();
    });
    await settle();
    expect(screen.queryByTestId("radar-demo-badge")).toBeNull();
    h.store.getState().stop();
  });

  it("anlık görüntü yokken yerleşik otel ile başlar", async () => {
    const h = harness();
    h.setNow(START);
    h.store.getState().start(H); // snapshot not awaited: base is still null
    render(<Probe store={h.store} />);
    fireEvent.click(screen.getByTestId("radar-demo-start"));
    await settle();
    expect(h.store.getState().mode).toBe("replay");
    expect(h.store.getState().view?.layers.minibar?.floors.length).toBeGreaterThan(0);
    h.store.getState().stop();
  });
});

const FOCI: [DemoFocus, (type: string, layer: string) => boolean][] = [
  ["MINIBAR", (_t, layer) => layer === "MINIBAR"],
  ["OUTLET", (t, layer) => layer === "SIPARIS" || t === "printer.health"],
  ["ROOM_SERVICE", (_t, layer) => layer === "ODA_SERVISI"],
];

describe("modüle odaklı senaryo", () => {
  for (const [focus, isOwn] of FOCI) {
    for (const withBase of [false, true]) {
      it(`${focus} (${withBase ? "yüklü otel" : "yerleşik otel"}): olayların en az %70 kadarı o modüldendir ve ilk 200 sn içinde en az 3 olay vardır`, () => {
        const base = withBase ? makeSnapshot({ tables: 12, generatedAt: iso(START) }) : undefined;
        const s = buildDemoScenario({ hotelId: H, startMs: START, base, focus });
        const own = s.events.filter((e) => isOwn(e.type, e.layer)).length;
        expect(own / s.events.length).toBeGreaterThanOrEqual(0.7);
        expect(s.events.length - own).toBeGreaterThan(0); // a few background events stay
        const early = s.events.filter((e) => Date.parse(e.at) - START <= 200_000);
        expect(early.length).toBeGreaterThanOrEqual(3);
        expect(new Set(s.events.map((e) => e.id)).size).toBe(s.events.length);
        let st = initialState(s.snapshot);
        for (const e of s.events) st = reduce(st, e);
        expect([...st.needsRefresh].filter((k) => k !== "ALL")).toEqual([]);
      });
    }
  }

  it("ROOM_SERVICE: doluluk yüklenmemişse (hiç dolu oda yok) yine de oda servisi akışı üretilir", () => {
    const base = makeSnapshot({ generatedAt: iso(START) });
    for (const f of base.layers.minibar!.floors) for (const r of f.rooms) r.occupied = false;
    const s = buildDemoScenario({ hotelId: H, startMs: START, base, focus: "ROOM_SERVICE" });
    expect(s.events.filter((e) => e.layer === "ODA_SERVISI").length).toBeGreaterThanOrEqual(20);
    // The general scenario is unchanged: no occupied room, no room service orders.
    expect(buildDemoScenario({ hotelId: H, startMs: START, base }).events.some((e) => e.layer === "ODA_SERVISI")).toBe(false);
  });

  it("odaksız senaryo değişmez ve odaklı olanlardan farklıdır", () => {
    const plain = buildDemoScenario({ hotelId: H, startMs: START });
    expect(JSON.stringify(plain)).toBe(JSON.stringify(buildDemoScenario({ hotelId: H, startMs: START, focus: undefined })));
    expect(JSON.stringify(buildDemoScenario({ hotelId: H, startMs: START, focus: "OUTLET" }).events)).not.toBe(
      JSON.stringify(plain.events),
    );
  });
});

describe("Demo senaryosu penceresi", () => {
  afterEach(() => cleanup());
  const hotels = [
    { id: "h1", name: "Merit Royal" },
    { id: "h2", name: "Merit Crystal" },
  ];

  it("üç modülü sunar, Minibar seçili gelir; Başlat seçileni ve oteli bildirir, Vazgeç kapatır", () => {
    const onStart = vi.fn();
    const onCancel = vi.fn();
    render(<DemoDialog hotels={hotels} defaultHotelId="h2" onStart={onStart} onCancel={onCancel} />);
    expect(screen.getByRole("dialog", { name: "Demo senaryosu" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => r.parentElement?.textContent)).toEqual([
      "Minibar",
      "Outlet (QR Sipariş)",
      "Oda Servisi",
    ]);
    expect((screen.getByLabelText("Demo oteli") as HTMLSelectElement).value).toBe("h2");
    fireEvent.click(screen.getByLabelText("Oda Servisi"));
    fireEvent.click(screen.getByRole("button", { name: "Başlat" }));
    expect(onStart).toHaveBeenCalledWith({ focus: "ROOM_SERVICE", hotelId: "h2" });
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("tek otel varsa otel seçimi gizlidir", () => {
    render(<DemoDialog hotels={hotels.slice(0, 1)} defaultHotelId="h1" onStart={() => undefined} onCancel={() => undefined} />);
    expect(screen.queryByLabelText("Demo oteli")).toBeNull();
  });
});

describe("Radar penceresinde modül demosu", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => cleanup());

  const initial = {
    hotels: [
      { id: "h1", code: "R", name: "Merit Royal" },
      { id: "h2", code: "C", name: "Merit Crystal" },
    ],
    hotelId: "ALL",
    demoMode: true,
  };
  const until = async (check: () => void) => {
    let last: unknown;
    for (let i = 0; i < 60; i++) {
      try {
        check();
        return;
      } catch (e) {
        last = e;
        await act(async () => {
          await new Promise((r) => setTimeout(r, 25));
        });
      }
    }
    throw last;
  };

  it("Tüm kompleks'te Demo başlat ve Animasyon etkindir; Animasyon ilk otele geçip açar", async () => {
    render(<RadarRoot mode="window" initial={initial} />);
    expect((screen.getByTestId("radar-demo-start") as HTMLButtonElement).disabled).toBe(false);
    const motion = screen.getByRole("button", { name: "Animasyon" }) as HTMLButtonElement;
    expect(motion.disabled).toBe(false);
    fireEvent.click(motion);
    await until(() => expect((screen.getByLabelText("Otel") as HTMLSelectElement).value).toBe("h1"));
    expect(window.localStorage.getItem("merit.u.radar.motion")).not.toBe("0");
    expect(screen.getByRole("button", { name: "Animasyon" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Başlat oteli ve görünümü değiştirir, rozet modülü yazar, Demo durdur öncekini geri koyar", async () => {
    window.localStorage.setItem("merit.u.radar.motion", "0");
    render(<RadarRoot mode="window" initial={initial} />);
    fireEvent.click(screen.getByTestId("radar-demo-start"));
    expect(screen.getByRole("dialog", { name: "Demo senaryosu" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Demo oteli"), { target: { value: "h2" } });
    fireEvent.click(screen.getByLabelText("Oda Servisi"));
    fireEvent.click(screen.getByTestId("radar-demo-go"));

    await until(() => expect(screen.getByTestId("radar-demo-badge").textContent).toBe("DEMO · Oda Servisi"));
    expect((screen.getByLabelText("Otel") as HTMLSelectElement).value).toBe("h2");
    expect(screen.getByRole("tab", { name: "Oda Servisi" }).getAttribute("aria-selected")).toBe("true");
    // The toolbar switch is off, yet the scene runs for the demo.
    expect(screen.getByRole("button", { name: "Animasyon" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("radar-demo-stop"));
    await until(() => expect((screen.getByLabelText("Otel") as HTMLSelectElement).value).toBe("ALL"));
    expect(screen.queryByTestId("radar-demo-badge")).toBeNull();
    expect(screen.getByRole("button", { name: "Animasyon" }).getAttribute("aria-pressed")).toBe("false");
    expect(window.localStorage.getItem("merit.u.radar.motion")).toBe("0");
  });

  it("Vazgeç hiçbir şeyi değiştirmez", () => {
    render(<RadarRoot mode="window" initial={initial} />);
    fireEvent.click(screen.getByTestId("radar-demo-start"));
    fireEvent.click(screen.getByTestId("radar-demo-cancel"));
    expect(screen.queryByRole("dialog", { name: "Demo senaryosu" })).toBeNull();
    expect((screen.getByLabelText("Otel") as HTMLSelectElement).value).toBe("ALL");
  });

  it("demoMode: false iken Demo başlat butonu gizlenir", () => {
    render(<RadarRoot mode="window" initial={{ ...initial, demoMode: false }} />);
    expect(screen.queryByTestId("radar-demo-start")).toBeNull();
  });
});
