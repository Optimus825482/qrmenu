import { describe, expect, it } from "vitest";
import { comparableState, initialState } from "@/modules/radar/state";
import type { RadarEvent } from "@/modules/radar/types";
import { applyEvents } from "@/modules/radar/ui/reducers";
import { businessDateOf } from "@/modules/radar/ui/radarStore";
import { H, T0, iso, makeSnapshot, wireOrder, wireScan } from "../helpers/radarStateFixtures";
import { harness } from "../helpers/radarStoreHarness";

const tables = (n: number) => makeSnapshot({ tables: n, generatedAt: iso(T0) });

describe("radar store: akis", () => {
  it("1 sn'de 40 olay en fazla 4 bosaltma turu", async () => {
    const h = harness({ snapshot: () => tables(60) });
    await h.boot();
    const seq0 = h.store.getState().seq;
    for (let i = 0; i < 40; i++) {
      h.emit(wireOrder(T0 + 10 + i, `o${i}`, `t${i + 1}`));
      await h.advance(25);
    }
    await h.advance(300);
    const s = h.store.getState();
    expect(s.seq - seq0).toBeLessThanOrEqual(4 + 1);
    expect(s.seq - seq0).toBeGreaterThanOrEqual(1);
    expect(s.live!.layers.order!.outlets[0].queues.kds.YENI.count).toBe(40);
  });

  it("ayni id iki kez = tek etki", async () => {
    const h = harness();
    await h.boot();
    const e = wireOrder(T0 + 10, "o1", "t1");
    h.emit(e);
    h.emit(e);
    await h.advance(300);
    expect(h.store.getState().buffer).toHaveLength(1);
  });

  it("nabiz: firtina yok, 3 olayda var, ayni varliga 2 sn icinde ikinci yok, reducedMotion hic yok", async () => {
    const h = harness({ snapshot: () => tables(40) });
    await h.boot();
    for (let i = 0; i < 25; i++) h.emit(wireScan(T0 + 10 + i, `t${i + 1}`));
    await h.advance(300);
    expect(h.store.getState().pulses.size).toBe(0);

    await h.advance(2500);
    for (let i = 0; i < 3; i++) h.emit(wireScan(h.getNow() + i, `t${i + 1}`));
    await h.advance(300);
    expect(h.store.getState().pulses.size).toBe(3);

    await h.advance(700); // 600 ms pulse expired
    h.emit(wireScan(h.getNow() + 1, "t1"));
    await h.advance(300);
    expect(h.store.getState().pulses.has("table:t1")).toBe(false);
    await h.advance(2000);
    h.emit(wireScan(h.getNow() + 1, "t1"));
    await h.advance(300);
    expect(h.store.getState().pulses.has("table:t1")).toBe(true);

    const r = harness();
    r.state.reducedMotion = true;
    await r.boot();
    r.emit(wireScan(T0 + 10, "t1"));
    await r.advance(300);
    expect(r.store.getState().pulses.size).toBe(0);
    expect(r.store.getState().live!.layers.order!.outlets[0].areas[0].tables[0].scannedAt).toBeDefined();
  });

  it("gizli sekme: olaylar birikir, gorunur olunca tek bosaltma ve nabiz yok", async () => {
    const h = harness();
    await h.boot();
    h.state.hidden = true;
    const seq0 = h.store.getState().seq;
    h.emit(wireScan(T0 + 10, "t1"));
    h.emit(wireScan(T0 + 11, "t2"));
    await h.advance(2000);
    expect(h.store.getState().seq).toBe(seq0);
    h.state.hidden = false;
    await h.advance(300);
    const s = h.store.getState();
    expect(s.seq).toBe(seq0 + 1);
    expect(s.pulses.size).toBe(0);
    expect(s.buffer).toHaveLength(2);
  });
});

describe("radar store: geri sarma", () => {
  function randomWire(n: number, seed: number) {
    let x = seed;
    const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const statuses = ["order.created", "order.approved", "order.ready", "order.served", "order.cancelled"];
    const map: Record<string, string> = {
      "order.created": "GONDERILDI",
      "order.approved": "ONAYLANDI",
      "order.ready": "HAZIR",
      "order.served": "SERVIS_EDILDI",
      "order.cancelled": "IPTAL",
    };
    const out = [];
    for (let i = 0; i < n; i++) {
      const at = T0 + 1000 + Math.floor(rnd() * 5 * 60_000);
      const k = statuses[Math.floor(rnd() * statuses.length)];
      const oid = `o${Math.floor(rnd() * 15)}`;
      const tid = `t${(Number(oid.slice(1)) % 6) + 1}`;
      if (rnd() < 0.2) out.push(wireScan(at, tid));
      else out.push(wireOrder(at, oid, tid, k, map[k]));
    }
    return out;
  }

  it("checkpoint ile geri sarma = bastan indirgeme (200 olay, 5 dk, 20 an)", async () => {
    const h = harness({ snapshot: () => tables(8) });
    await h.boot();
    const wire = randomWire(200, 7).sort((a, b) => a.at.localeCompare(b.at));
    for (let i = 0; i < wire.length; i++) {
      h.setNow(Date.parse(wire[i].at));
      h.emit(wire[i]);
      if (i % 7 === 6) h.store.getState().flush();
    }
    h.setNow(T0 + 6 * 60_000);
    h.store.getState().flush();
    const s = h.store.getState();
    expect(s.checkpoints.size).toBeGreaterThan(3);
    const all: RadarEvent[] = s.buffer;
    expect(all.length).toBeGreaterThan(100);
    for (let i = 0; i < 20; i++) {
      const t = T0 + 500 + Math.floor(((i * 7919) % 1000) / 1000 * 5 * 60_000);
      s.scrubTo(t);
      const expected = applyEvents(initialState(makeSnapshot({ tables: 8, generatedAt: iso(T0) })), all.filter((e) => Date.parse(e.at) <= t));
      expect(h.store.getState().view).toEqual(expected);
    }
  });

  it("scrub modunda yeni olay view'u degistirmez, pending artar, goLive hepsini yansitir", async () => {
    const h = harness();
    await h.boot();
    h.emit(wireOrder(T0 + 1000, "o1", "t1"));
    await h.advance(300);
    h.store.getState().scrubTo(T0 + 2000);
    const view = h.store.getState().view;
    h.emit(wireOrder(T0 + 3000, "o2", "t2"));
    h.emit(wireOrder(T0 + 3001, "o3", "t3"));
    await h.advance(300);
    const s = h.store.getState();
    expect(s.mode).toBe("scrub");
    expect(s.view).toBe(view);
    expect(s.pending).toBe(2);
    s.goLive();
    const g = h.store.getState();
    expect(g.mode).toBe("live");
    expect(g.pending).toBe(0);
    expect(g.view!.layers.order!.outlets[0].queues.kds.YENI.count).toBe(3);
  });

  it("30 dk / 5000 olay siniri: 6000 olay -> buffer <= 5000, 31 dk oncesi atilir, seen sinirli", async () => {
    const h2 = harness({ snapshot: () => makeSnapshot({ generatedAt: iso(T0 - 60 * 60_000) }) });
    h2.setNow(T0);
    await h2.boot();
    for (let i = 0; i < 6000; i++) {
      // spread over 35 minutes before now, plus a 32-minute-old head
      h2.emit({ type: "scan.table", hotelId: H, at: iso(T0 - 35 * 60_000 + i * 350), payload: { tableId: "t1" } });
    }
    h2.store.getState().flush();
    const s = h2.store.getState();
    expect(s.buffer.length).toBeLessThanOrEqual(5000);
    expect(Date.parse(s.buffer[0].at)).toBeGreaterThanOrEqual(T0 - 30 * 60_000);
  });
});

describe("radar store: resync, tazeleme, sapma", () => {
  it("realtime.resync: 1 bant, tek yeni fetch, eski olay yok sayilir, kesinti oncesi olaylar arabellekte", async () => {
    const h = harness();
    await h.boot();
    h.emit(wireOrder(T0 + 1000, "o1", "t1"));
    await h.advance(300);
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(1);
    await h.advance(40_000);
    h.emit({ type: "realtime.resync", at: iso(h.getNow()) });
    await h.store.getState().refresh();
    const s = h.store.getState();
    expect(s.gaps).toHaveLength(1);
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(2);
    expect(Date.parse(s.base!.generatedAt)).toBe(h.getNow());
    expect(s.buffer).toHaveLength(1);
    h.emit(wireOrder(h.getNow() - 10_000, "old", "t2")); // before generatedAt - 2s
    await h.advance(300);
    expect(h.store.getState().buffer).toHaveLength(1);
    h.emit(wireOrder(h.getNow() - 1000, "recent", "t2")); // within skew
    await h.advance(300);
    expect(h.store.getState().buffer).toHaveLength(2);
  });

  it("businessDate degisimi (23:59:58 -> 00:00:02) yeniler", async () => {
    const start = Date.parse("2026-11-03T21:59:58+00:00"); // 23:59:58 Nicosia
    expect(businessDateOf(start)).toBe("2026-11-03");
    const h = harness({ snapshot: () => ({ ...makeSnapshot({ generatedAt: iso(h.getNow()) }), businessDate: businessDateOf(h.getNow()) }) });
    h.setNow(start);
    await h.boot();
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(1);
    await h.advance(1500);
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(1);
    await h.advance(3000);
    expect(h.fetchSnapshot.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(h.store.getState().live!.businessDate).toBe("2026-11-04");
  });

  it("settings.changed rs.slaMinutes yeniler, price.display etkisiz", async () => {
    const h = harness();
    await h.boot();
    h.emit({ type: "settings.changed", hotelId: H, at: iso(h.getNow()), payload: { key: "price.display" } });
    await h.advance(100);
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(1);
    h.emit({ type: "settings.changed", hotelId: H, at: iso(h.getNow()), payload: { key: "rs.slaMinutes" } });
    await h.advance(100);
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(2);
  });

  it("ayni needsRefresh 3 kez -> tek fetchSnapshot (1 sn debounce)", async () => {
    const h = harness();
    await h.boot();
    for (let i = 0; i < 3; i++) h.emit(wireOrder(T0 + 10 + i, `o${i}`, "yok"));
    await h.advance(300);
    expect(h.store.getState().live!.needsRefresh.has("table:yok")).toBe(true);
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(1);
    await h.advance(1200);
    expect(h.fetchSnapshot).toHaveBeenCalledTimes(2);
  });

  it("sapma yoklamasi: esitse onDrift yok; farkliysa bir kez ve live duzelir", async () => {
    const drifts: string[] = [];
    let snap = () => makeSnapshot({ generatedAt: iso(h.getNow()) });
    const h = harness({ snapshot: () => snap(), onDrift: (p) => drifts.push(p) });
    await h.boot();
    await h.advance(61_000);
    expect(drifts).toEqual([]);
    expect(h.fetchSnapshot.mock.calls.length).toBe(2);
    snap = () => {
      const s = makeSnapshot({ generatedAt: iso(h.getNow()) });
      s.layers.order!.outlets[0].areas[0].tables[0].orders = [{ orderId: "gizli", orderNo: 9, status: "ONAYLANDI", since: iso(h.getNow()) }];
      return s;
    };
    await h.advance(60_000);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].startsWith("order")).toBe(true);
    const live = h.store.getState().live!;
    expect(live.layers.order!.outlets[0].areas[0].tables[0].orders).toHaveLength(1);
    expect(comparableState(live)).toEqual(comparableState(initialState(snap())));
    await h.advance(60_000);
    expect(drifts).toHaveLength(1);
  });

  it("ALL: yalniz overview, 1 sn debounce", async () => {
    let calls = 0;
    const h = harness({ fetchOverview: async () => { calls++; return { generatedAt: iso(T0), hotels: [] }; } });
    await h.boot("ALL");
    expect(h.fetchSnapshot).not.toHaveBeenCalled();
    const c0 = calls;
    for (let i = 0; i < 5; i++) h.emit(wireOrder(T0 + i, `o${i}`, "t1"));
    await h.advance(1200);
    expect(calls - c0).toBe(1);
  });
});

describe("radar store: performans", () => {
  it("10k olay besle; 30 dk icinde geri sarma < 150 ms (toleransli, en iyi 3 deneme)", async () => {
    const h = harness({ snapshot: () => tables(300) });
    await h.boot();
    for (let i = 0; i < 10_000; i++) {
      const at = T0 + 100 + i * 180;
      h.setNow(at);
      h.emit(wireOrder(at, `o${i % 400}`, `t${(i % 300) + 1}`, "order.approved", i % 3 === 0 ? "SERVIS_EDILDI" : "ONAYLANDI"));
      if (i % 50 === 49) h.store.getState().flush();
    }
    h.store.getState().flush();
    const s = h.store.getState();
    expect(s.buffer.length).toBeLessThanOrEqual(5000);
    const first = Date.parse(s.buffer[0].at);
    for (const frac of [0.1, 0.5, 0.9]) {
      const t = first + frac * (T0 + 100 + 10_000 * 180 - first);
      let best = Infinity;
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        s.scrubTo(t);
        best = Math.min(best, performance.now() - t0);
      }
      expect(best).toBeLessThan(150);
    }
  });
});
