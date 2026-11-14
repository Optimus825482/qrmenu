import { describe, expect, it } from "vitest";
import type { RadarState } from "@/modules/radar/state";
import type { RadarAlert, RadarEvent } from "@/modules/radar/types";
import { alertRecord, eventRecord, floorOptions, floorRoomNumbers, pathSteps } from "@/modules/radar/ui/path";

const SNAP = {
  layers: {
    minibar: {
      floors: [
        { floorId: "f1", name: "1. Kat", rooms: [{ roomId: "r101", number: "101" }] },
        { floorId: "f2", name: "2. Kat", rooms: [{ roomId: "r204", number: "204" }] },
      ],
    },
    order: {
      outlets: [
        { outletId: "o1", name: "Lobi Bar", areas: [{ tables: [{ tableId: "t7", label: "7" }] }] },
        { outletId: "o2", name: "Havuz", areas: [{ tables: [{ tableId: "t9", label: "9" }] }] },
      ],
    },
    roomService: { orders: [{ orderId: "ord1", orderNo: 15, roomNumber: "204" }] },
  },
} as unknown as RadarState;

const base = { multi: true, all: false, hotelName: "Royal", snap: SNAP, record: null };
const labels = (steps: { label: string }[]) => steps.map((s) => s.label);

describe("radar konum yolu: genelden özele", () => {
  it("tüm kompleks tek adımdır; tek otelde o adım yoktur", () => {
    expect(labels(pathSteps({ ...base, all: true, view: "genel", viewLabel: "Genel Bakış" }))).toEqual(["Tüm kompleks"]);
    expect(labels(pathSteps({ ...base, multi: false, view: "genel", viewLabel: "Genel Bakış" }))).toEqual(["Royal"]);
  });

  it("otel > operasyon > yer > kayıt", () => {
    expect(
      labels(pathSteps({ ...base, view: "kat", viewLabel: "Kat", floorId: "f2", record: { kind: "room", id: "r204" } })),
    ).toEqual(["Tüm kompleks", "Royal", "Kat", "2. Kat", "Oda 204"]);
    expect(
      labels(pathSteps({ ...base, view: "odaServisi", viewLabel: "Oda Servisi", record: { kind: "order", id: "ord1" } })),
    ).toEqual(["Tüm kompleks", "Royal", "Oda Servisi", "Oda 204 · #15"]);
  });

  it("masada yer her zaman bir outlettir (seçilmediyse ilki)", () => {
    expect(labels(pathSteps({ ...base, view: "masa", viewLabel: "Masa" }))).toEqual(["Tüm kompleks", "Royal", "Masa", "Lobi Bar"]);
    expect(
      labels(pathSteps({ ...base, view: "masa", viewLabel: "Masa", outletId: "o2", record: { kind: "table", id: "t9" } })),
    ).toEqual(["Tüm kompleks", "Royal", "Masa", "Havuz", "Masa 9"]);
  });

  it("başka operasyonun ya da artık olmayan kaydın adı yola yazılmaz", () => {
    expect(labels(pathSteps({ ...base, view: "kat", viewLabel: "Kat", record: { kind: "table", id: "t7" } }))).toEqual([
      "Tüm kompleks",
      "Royal",
      "Kat",
    ]);
    expect(
      labels(pathSteps({ ...base, view: "odaServisi", viewLabel: "Oda Servisi", record: { kind: "order", id: "yok" } })),
    ).toEqual(["Tüm kompleks", "Royal", "Oda Servisi"]);
  });

  it("kat filtresi yalnız oda operasyonlarında sunulur", () => {
    expect(floorOptions("kat", SNAP)).toHaveLength(2);
    expect(floorOptions("mybar", SNAP)).toHaveLength(2);
    expect(floorOptions("masa", SNAP)).toEqual([]);
    expect(floorOptions("personel", SNAP)).toEqual([]);
    expect([...(floorRoomNumbers(SNAP, "f2") ?? [])]).toEqual(["204"]);
    expect(floorRoomNumbers(SNAP, undefined)).toBeUndefined();
    expect(floorRoomNumbers(SNAP, "yok")).toBeUndefined();
  });
});

describe("uyarı ve olay tıklaması kayda iner", () => {
  const alert = (kind: RadarAlert["kind"], ref: object) => ({ kind, ref }) as unknown as RadarAlert;

  it("uyarı: çağrı masayı, SLA siparişi, MyBar ve DND odayı açar", () => {
    expect(alertRecord(alert("CAGRI", { outletId: "o1", tableId: "t7" }), "masa")).toEqual({ kind: "table", id: "t7" });
    expect(alertRecord(alert("RS_SLA", { orderId: "ord1" }), "odaServisi")).toEqual({ kind: "order", id: "ord1" });
    expect(alertRecord(alert("MYBAR", { roomId: "r204" }), "mybar")).toEqual({ kind: "room", id: "r204" });
    expect(alertRecord(alert("DND_EKSIK", { roomId: "r101" }), "kat")).toEqual({ kind: "room", id: "r101" });
  });

  it("kaydı olmayan uyarı yalnız operasyonu açar", () => {
    expect(alertRecord(alert("STOK", { productId: "p1" }), "kat")).toBeNull();
    expect(alertRecord(alert("YAZICI", { outletId: "o1", printerId: "x" }), "kuyruk")).toBeNull();
  });

  it("olay: kendi operasyonundaki kaydı açar", () => {
    const ev = (o: object) => o as unknown as RadarEvent;
    expect(eventRecord(ev({ type: "call.opened", tableId: "t7" }), "masa")).toEqual({ kind: "table", id: "t7" });
    expect(eventRecord(ev({ type: "room.checked", roomId: "r101" }), "kat")).toEqual({ kind: "room", id: "r101" });
    expect(eventRecord(ev({ type: "order.status", orderId: "ord1", roomId: "r204" }), "odaServisi")).toEqual({ kind: "order", id: "ord1" });
    expect(eventRecord(ev({ type: "print.job" }), "kuyruk")).toBeNull();
  });
});

describe("oda servisi gün özeti", () => {
  it("teslim sayısı, ortalama süre ve zamanında oranı", async () => {
    const { deliverySummary } = await import("@/modules/radar/ui/views/RoomService");
    const d = (min: number) => ({ createdAt: "2026-11-14T10:00:00.000Z", deliveredAt: new Date(Date.UTC(2026, 10, 14, 10, min)).toISOString() });
    expect(deliverySummary([], 30)).toBeNull();
    expect(deliverySummary([d(10), d(20), d(40), d(50)], 30)).toEqual({ count: 4, avgMin: 30, onTimePct: 50 });
  });
});
