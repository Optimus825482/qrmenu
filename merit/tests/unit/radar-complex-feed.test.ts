import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/radar/server/actions/radar", () => ({ radarOverviewAction: vi.fn(), radarSnapshotAction: vi.fn() }));

import type { RadarState } from "@/modules/radar/state";
import type { RadarAlert, RadarEvent } from "@/modules/radar/types";
import { eventsOfOperation, mergeAlerts, mergeEvents, mergeLookupState, type HotelFeed } from "@/modules/radar/ui/complex/ComplexFeed";
import { orderLanes } from "@/modules/radar/ui/views/OrdersAll";

const ev = (id: string, at: string, hotelId: string, layer: RadarEvent["layer"], type: string): RadarEvent =>
  ({ id, at, hotelId, layer, type }) as unknown as RadarEvent;

const state = (hotelId: string, tables: unknown[]): RadarState =>
  ({
    hotelId,
    people: { [`u-${hotelId}`]: `Kişi ${hotelId}` },
    layers: {
      system: { alerts: [] },
      order: { outlets: [{ outletId: `o-${hotelId}`, name: `Bar ${hotelId}`, printers: [], areas: [{ areaId: "a", name: "A", tables }] }] },
    },
  }) as unknown as RadarState;

const alert = (key: string, severity: RadarAlert["severity"], kind: RadarAlert["kind"], since: string): RadarAlert =>
  ({ key, severity, kind, hotelId: "x", ref: {}, since, count: 1, text: key }) as unknown as RadarAlert;

describe("Tüm kompleks: birleşik akış", () => {
  const all = new Set<RadarEvent["layer"]>(["MINIBAR", "SIPARIS", "ODA_SERVISI", "PERSONEL", "SISTEM"]);

  it("otellerin olaylarını zamana göre tek listede birleştirir", () => {
    const merged = mergeEvents([
      [ev("a1", "2026-11-14T10:00:00Z", "A", "SIPARIS", "order.status"), ev("a2", "2026-11-14T10:05:00Z", "A", "ODA_SERVISI", "order.status")],
      [ev("b1", "2026-11-14T10:02:00Z", "B", "MINIBAR", "mybar.created")],
    ]);
    expect(merged.map((e) => e.id)).toEqual(["a1", "b1", "a2"]);
  });

  it("açık operasyonun olaylarını süzer; kapalı katman akıştan düşer", () => {
    const events = [
      ev("1", "t1", "A", "SIPARIS", "order.status"),
      ev("2", "t2", "A", "ODA_SERVISI", "order.status"),
      ev("3", "t3", "B", "MINIBAR", "mybar.created"),
      ev("4", "t4", "B", "MINIBAR", "room.checked"),
    ];
    expect(eventsOfOperation(events, "genel", all).map((e) => e.id)).toEqual(["1", "2", "3", "4"]);
    expect(eventsOfOperation(events, "masa", all).map((e) => e.id)).toEqual(["1"]);
    expect(eventsOfOperation(events, "odaServisi", all).map((e) => e.id)).toEqual(["2"]);
    expect(eventsOfOperation(events, "mybar", all).map((e) => e.id)).toEqual(["3"]);
    expect(eventsOfOperation(events, "genel", new Set(["SIPARIS"])).map((e) => e.id)).toEqual(["1"]);
  });

  it("ad çözümü için otellerin masalarını ve kişilerini tek durumda toplar", () => {
    const merged = mergeLookupState([state("A", [{ tableId: "t1", label: "M1", orders: [], call: null }]), state("B", [])]);
    expect(merged?.layers.order?.outlets.map((o) => o.outletId)).toEqual(["o-A", "o-B"]);
    expect(merged?.people).toEqual({ "u-A": "Kişi A", "u-B": "Kişi B" });
    expect(mergeLookupState([])).toBeNull();
  });

  it("uyarıları otel içinde gruplar, otel koduyla adlandırır, kritikleri öne alır", () => {
    const feed = (id: string, code: string, alerts: RadarAlert[]): HotelFeed => ({
      hotel: { id, code, name: code },
      view: null,
      events: [],
      alerts,
      offline: false,
    });
    const merged = mergeAlerts(
      [
        feed("A", "ROYAL", [alert("w", "warn", "MYBAR", "2026-11-14T09:00:00Z")]),
        feed("B", "DIAMOND", [alert("c", "crit", "RS_SLA", "2026-11-14T10:00:00Z"), alert("s", "crit", "STOK", "2026-11-14T10:01:00Z")]),
      ],
      new Set(["MINIBAR", "ODA_SERVISI"]),
    );
    expect(merged.map((a) => a.text)).toEqual(["DIAMOND · c", "DIAMOND · s", "ROYAL · w"]);
    expect(new Set(merged.map((a) => a.key)).size).toBe(3);
    expect(mergeAlerts([feed("B", "DIAMOND", [alert("c", "crit", "RS_SLA", "t")])], new Set(["MINIBAR"]))).toEqual([]);
  });
});

describe("Tüm kompleks: masa siparişleri panosu", () => {
  it("açık siparişleri aşamalarına, açık çağrıları kendi şeridine koyar; en uzun bekleyen önce", () => {
    const lanes = orderLanes(
      state("A", [
        {
          tableId: "t1",
          label: "M1",
          orders: [
            { orderId: "o2", orderNo: 2, status: "GONDERILDI", since: "2026-11-14T10:05:00Z" },
            { orderId: "o3", orderNo: 3, status: "HAZIR", since: "2026-11-14T10:01:00Z" },
            { orderId: "o9", orderNo: 9, status: "SERVIS_EDILDI", since: "2026-11-14T09:00:00Z" },
          ],
          call: { callId: "c1", type: "GARSON", since: "2026-11-14T10:06:00Z" },
        },
        { tableId: "t2", label: "M2", orders: [{ orderId: "o1", orderNo: 1, status: "GONDERILDI", since: "2026-11-14T10:00:00Z", escalated: true }], call: null },
      ]),
    );
    expect(lanes.GONDERILDI.map((c) => [c.tableLabel, c.orderNo, c.escalated])).toEqual([["M2", 1, true], ["M1", 2, false]]);
    expect(lanes.ONAYLANDI).toEqual([]);
    expect(lanes.HAZIR.map((c) => c.orderNo)).toEqual([3]);
    expect(lanes.CAGRI.map((c) => [c.tableLabel, c.outletName, c.orderNo])).toEqual([["M1", "Bar A", undefined]]);
  });
});
