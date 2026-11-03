import { describe, expect, it } from "vitest";
import { initialState, type RadarState } from "@/modules/radar/state";
import type { RadarEvent, RadarSnapshot } from "@/modules/radar/types";
import {
  GLINT_KINDS,
  MAX_SPRITES,
  RING_FOREVER_MS,
  coalesce,
  deriveMotion,
  hiddenAfterPrune,
  liveItems,
  openCallIds,
  prune,
  ringsFor,
  type MotionEvent,
} from "@/modules/radar/ui/motion/motionModel";

const HOTEL = "h1";
const T0 = "2026-11-03T10:00:00.000Z";

const snap = {
  generatedAt: T0,
  hotelId: HOTEL,
  businessDate: "2026-11-03",
  layers: {
    minibar: {
      floors: [
        {
          floorId: "f1",
          number: 1,
          name: "1. Kat",
          rooms: [
            { roomId: "r101", number: "101", occupied: true, task: null, checkedToday: null, dnd: null, mybar: null },
            { roomId: "r102", number: "102", occupied: true, task: null, checkedToday: null, dnd: null, mybar: null },
          ],
        },
      ],
      supervisors: [{ userId: "u-kat", name: "Kat Sorumlusu", floorIds: ["f1"], done: 0, total: 2 }],
      stock: [{ productId: "p1", name: "Su", remaining: 3, critical: 5 }],
      uploads: [],
    },
    order: {
      outlets: [
        {
          outletId: "o1",
          name: "Havuz Bar",
          type: "BAR",
          orderingEnabled: true,
          areas: [
            {
              areaId: "a1",
              name: "Teras",
              tables: [
                { tableId: "t1", label: "M1", orders: [], call: null },
                { tableId: "t2", label: "M2", orders: [], call: { callId: "c9", type: "GARSON", since: T0 } },
              ],
            },
          ],
          queues: {
            kasa: { count: 0 },
            kds: { YENI: { count: 0 }, HAZIRLANIYOR: { count: 0 }, HAZIR: { count: 0 } },
            print: { KUYRUKTA: 0, BASILIYOR: 0, HATA: 0 },
            jobs: [],
          },
          printers: [],
        },
      ],
    },
    roomService: {
      slaMinutes: 30,
      orders: [{ orderId: "rs1", orderNo: 7, roomNumber: "101", status: "ONAYLANDI", createdAt: T0, level: "OK" }],
    },
    staff: {
      sessions: [
        {
          sessionId: "s1",
          userId: "u-garson",
          name: "Garson",
          roleCode: "GARSON",
          roleKind: "OUTLET",
          outletId: "o1",
          status: "AKTIF",
          loginAt: T0,
          lastSeenAt: T0,
        },
      ],
    },
    system: { alerts: [], mailFailed: 0 },
  },
  config: {},
  sparkline: [],
} as unknown as RadarSnapshot;

const state: RadarState = initialState(snap);
const base = { hotelId: HOTEL, at: "2026-11-03T10:00:05.000Z" };
let n = 0;
const ev = (e: Record<string, unknown>): RadarEvent =>
  ({ ...base, id: `e${++n}`, layer: "SIPARIS", ...e }) as unknown as RadarEvent;
const derive = (events: RadarEvent[], speed: 1 | 10 | 60 = 1, next: RadarState = state, prev: RadarState = state) =>
  deriveMotion(prev, next, events, 1000, speed);

describe("deriveMotion eşleme tablosu", () => {
  it("onay + hazırlanıyor: masadan mutfak kuyruğuna 1800 ms", () => {
    const out = derive([
      ev({ type: "order.status", orderId: "x", orderNo: 1, kind: "QR", to: "ONAYLANDI", prep: true, tableId: "t1", outletId: "o1" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "order.flow",
      from: "table:t1",
      to: "queue:o1:HAZIRLANIYOR",
      durationMs: 1800,
      at: 1000,
    });
  });

  it("hazır: mutfaktan masaya tepsi 1500 ms", () => {
    const out = derive([
      ev({ type: "order.status", orderId: "x", orderNo: 1, kind: "QR", to: "HAZIR", tableId: "t1", outletId: "o1" }),
    ]);
    expect(out[0]).toMatchObject({ kind: "order.ready", from: "queue:o1:HAZIR", to: "table:t1", durationMs: 1500 });
  });

  it("servis edildi: masada 600 ms onay halkası", () => {
    const out = derive([
      ev({ type: "order.status", orderId: "x", orderNo: 1, kind: "QR", to: "SERVIS_EDILDI", tableId: "t1", outletId: "o1" }),
    ]);
    expect(out[0]).toMatchObject({ kind: "order.served", from: "table:t1", durationMs: 600 });
    expect(out[0].to).toBeUndefined();
  });

  it("çağrı açıldı: çağrı kapanana kadar halka", () => {
    const out = derive([ev({ type: "call.opened", callId: "c1", tableId: "t1", callType: "GARSON" })]);
    expect(out[0]).toMatchObject({ kind: "call.ring", from: "table:t1", durationMs: RING_FOREVER_MS, tone: "danger" });
    expect(out[0].id).toContain("c1");
  });

  it("oda kontrolü ve DND: odada 900 ms süpürme + personel noktası odaya kayar", () => {
    const check = derive([
      ev({ layer: "MINIBAR", type: "room.checked", roomId: "r101", checkType: "SARFIYAT_YOK", byUserId: "u-kat" }),
    ]);
    expect(check.map((m) => m.kind).sort()).toEqual(["room.check", "staff.move"]);
    expect(check.find((m) => m.kind === "room.check")).toMatchObject({ from: "room:r101", durationMs: 900 });
    expect(check.find((m) => m.kind === "staff.move")).toMatchObject({
      from: "staff:u-kat",
      to: "room:r101",
      durationMs: 1200,
    });
    const dnd = derive([
      ev({ layer: "MINIBAR", type: "dnd.marked", roomId: "r102", count: 1, minChecks: 2, status: "AKTIF", byUserId: "u-kat" }),
    ]);
    expect(dnd.find((m) => m.kind === "dnd.mark")).toMatchObject({ from: "room:r102", durationMs: 900 });
  });

  it("MyBar isteği: odadan kat sorumlusuna rozet uçuşu", () => {
    const out = derive([ev({ layer: "MINIBAR", type: "mybar.opened", requestId: "q1", roomId: "r101" })]);
    expect(out[0]).toMatchObject({ kind: "mybar.request", from: "room:r101", to: "staff:u-kat" });
  });

  it("personel: son görüldüğü çapadan yenisine 1200 ms", () => {
    const next: RadarState = {
      ...state,
      layers: {
        ...state.layers,
        staff: { sessions: [{ ...state.layers.staff!.sessions[0], outletId: "o2" }] },
      },
    };
    const out = derive(
      [ev({ layer: "PERSONEL", type: "presence", sessionId: "s1", userId: "u-garson", status: "AKTIF", outletId: "o2" })],
      1,
      next,
      state,
    );
    expect(out[0]).toMatchObject({ kind: "staff.move", from: "outlet:o1", to: "outlet:o2", durationMs: 1200 });
    // Aynı yerde kalan oturum hareket üretmez.
    expect(
      derive([ev({ layer: "PERSONEL", type: "presence", sessionId: "s1", userId: "u-garson", status: "AKTIF", outletId: "o1" })]),
    ).toEqual([]);
  });

  it("yazdırma: mutfaktan yazıcıya kısa çizgi", () => {
    const out = derive([ev({ type: "print.job", jobId: "j1", status: "KUYRUKTA", outletId: "o1" })]);
    expect(out[0]).toMatchObject({ kind: "print.job", from: "queue:o1:HAZIRLANIYOR", to: "queue:o1:print" });
  });

  it("kritik stok: depo kartında 400 ms titreşim", () => {
    const out = derive([ev({ layer: "MINIBAR", type: "stock.level", productId: "p1", remaining: 2, critical: 5 })]);
    expect(out[0]).toMatchObject({ kind: "stock.critical", from: "stock:p1", durationMs: 400 });
    expect(derive([ev({ layer: "MINIBAR", type: "stock.level", productId: "p1", remaining: 50, critical: 5 })])).toEqual([]);
  });

  it("çapa bulunamazsa olay atlanır ve hata vermez", () => {
    expect(
      derive([
        ev({ type: "order.status", orderId: "x", orderNo: 1, kind: "QR", to: "HAZIR", tableId: "yok", outletId: "o1" }),
        ev({ type: "call.opened", callId: "c2", tableId: "yok", callType: "GARSON" }),
        ev({ layer: "MINIBAR", type: "room.checked", roomId: "yok", checkType: "ACIK" }),
        ev({ layer: "MINIBAR", type: "mybar.opened", requestId: "q", roomId: "yok" }),
        ev({ type: "table.scanned", tableId: "t1" }),
      ]),
    ).toEqual([]);
  });

  it("hız 10 süreyi böler, 60 yalnız ışıltı türlerini bırakır", () => {
    const all = [
      ev({ type: "order.status", orderId: "x", orderNo: 1, kind: "QR", to: "ONAYLANDI", prep: true, tableId: "t1", outletId: "o1" }),
      ev({ type: "order.status", orderId: "x", orderNo: 1, kind: "QR", to: "HAZIR", tableId: "t1", outletId: "o1" }),
      ev({ layer: "MINIBAR", type: "stock.level", productId: "p1", remaining: 2, critical: 5 }),
      ev({ type: "call.opened", callId: "c1", tableId: "t1", callType: "GARSON" }),
    ];
    const x10 = derive(all, 10);
    expect(x10.find((m) => m.kind === "order.flow")!.durationMs).toBe(180);
    expect(x10.find((m) => m.kind === "order.ready")!.durationMs).toBe(150);
    expect(x10.find((m) => m.kind === "call.ring")!.durationMs).toBe(RING_FOREVER_MS);
    const x60 = derive(all, 60);
    expect(x60.every((m) => GLINT_KINDS.has(m.kind))).toBe(true);
    expect(x60.map((m) => m.kind).sort()).toEqual(["call.ring", "order.ready", "stock.critical"]);
  });

  it("fiyat, isim ve not alanı taşımaz", () => {
    const out = derive([
      ev({ type: "order.status", orderId: "x", orderNo: 1, kind: "QR", to: "HAZIR", tableId: "t1", outletId: "o1" }),
      ev({ layer: "MINIBAR", type: "room.checked", roomId: "r101", checkType: "ACIK", byUserId: "u-kat" }),
    ]);
    expect(JSON.stringify(out)).not.toMatch(/price|name|note/i);
  });
});

const item = (over: Partial<MotionEvent>): MotionEvent => ({
  id: `m${++n}`,
  kind: "order.flow",
  from: "table:t1",
  to: "queue:o1:YENI",
  at: 0,
  durationMs: 1800,
  tone: "info",
  ...over,
});

describe("coalesce / prune", () => {
  it("300 aynı çapa olayı 1 öğe + 299 rozetine iner", () => {
    const list = Array.from({ length: 300 }, (_, i) => item({ id: `a${i}`, at: i }));
    const { items, hidden } = coalesce(list);
    expect(items).toHaveLength(1);
    expect(items[0].more).toBe(299);
    expect(hidden).toBe(0);
  });

  it("toplam sprite sayısı 120 sınırını aşmaz; taşan gizli sayaca eklenir", () => {
    const list = Array.from({ length: 400 }, (_, i) => item({ id: `b${i}`, at: i, from: `table:x${i}` }));
    const { items, hidden } = coalesce(list);
    expect(items.length).toBeLessThanOrEqual(MAX_SPRITES);
    expect(items.length + hidden).toBe(400);
    expect(MAX_SPRITES).toBe(120);
  });

  it("aynı kimlik iki kez sayılmaz", () => {
    const { items } = coalesce([item({ id: "z" }), item({ id: "z" })]);
    expect(items).toHaveLength(1);
    expect(items[0].more ?? 0).toBe(0);
  });

  it("prune biteni atar, çağrı halkasını çağrı kapanınca kaldırır", () => {
    const done = item({ id: "d", at: 0, durationMs: 500 });
    const live = item({ id: "l", at: 400, durationMs: 500 });
    const ring = item({
      id: "ring:c1",
      kind: "call.ring",
      from: "table:t1",
      to: undefined,
      at: 0,
      durationMs: RING_FOREVER_MS,
      tone: "danger",
    });
    expect(prune([done, live, ring], 600).map((m) => m.id)).toEqual(["l", "ring:c1"]);
    expect(prune([done, live, ring], 600, new Set(["c1"])).map((m) => m.id)).toEqual(["l", "ring:c1"]);
    expect(prune([done, live, ring], 600, new Set()).map((m) => m.id)).toEqual(["l"]);
  });

  it("açık çağrılar durumdan okunur ve ilk görünümde halka tohumlanır", () => {
    expect(openCallIds(state)).toEqual(new Set(["c9"]));
    const rings = ringsFor(state, 50);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toMatchObject({ kind: "call.ring", from: "table:t2", at: 50 });
  });

  it("iki açık çağrı iki ayrı halka olarak kalır; biri kapanınca yalnız o gider", () => {
    const mk = (id: string) =>
      item({ id: `ring:${id}`, kind: "call.ring", from: "table:t1", to: undefined, durationMs: RING_FOREVER_MS, tone: "danger" });
    const { items } = coalesce([mk("c1"), mk("c2")]);
    expect(items).toHaveLength(2);
    expect(prune(items, 10, new Set(["c2"])).map((m) => m.id)).toEqual(["ring:c2"]);
  });

  it("+N rozeti sprite'lar bitince temizlenir", () => {
    const list = Array.from({ length: 300 }, (_, i) => ({ ev: item({ id: `h${i}`, at: 0, durationMs: 500, from: `table:y${i}` }) }));
    const { items, hidden } = coalesce(list.map((p) => p.ev));
    expect(hidden).toBe(180);
    const running = items.map((ev) => ({ ev }));
    expect(hiddenAfterPrune(liveItems(running, 100), hidden)).toBe(180);
    expect(hiddenAfterPrune(liveItems(running, 600), hidden)).toBe(0);
  });
});
