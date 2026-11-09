import { describe, expect, it } from "vitest";
import {
  metricLayer,
  sparkPoints,
  sparkTotals,
  orderStatusLabel,
  roomCellModel,
  tableCardModel,
  type RoomCell,
  type TableCard,
} from "@/modules/radar/labels";

const NOW = Date.parse("2026-11-03T10:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

describe("orderStatusLabel", () => {
  const table: [Parameters<typeof orderStatusLabel>[0], Parameters<typeof orderStatusLabel>[1], string][] = [
    ["GONDERILDI", "MASA", "Onay bekliyor"],
    ["ONAYLANDI", "MASA", "Hazırlanıyor"],
    ["HAZIR", "MASA", "Hazır"],
    ["TEYIT_BEKLIYOR", "ODA_SERVISI", "Teyit bekliyor"],
    ["ONAYLANDI", "ODA_SERVISI", "Onaylandı"],
    ["HAZIR", "ODA_SERVISI", "Hazır"],
    ["YOLDA", "ODA_SERVISI", "Yolda"],
    ["TESLIM_EDILDI", "ODA_SERVISI", "Teslim edildi"],
  ];
  it.each(table)("%s / %s -> %s", (status, kind, text) => {
    expect(orderStatusLabel(status, kind)).toBe(text);
  });
});

function room(over: Partial<RoomCell> = {}): RoomCell {
  return {
    roomId: "r204",
    number: "204",
    occupied: true,
    task: { itemId: "ti", type: "INHOUSE_KONTROL", status: "BEKLIYOR", priority: 1 },
    checkedToday: null,
    dnd: null,
    mybar: null,
    ...over,
  };
}

describe("roomCellModel", () => {
  it("occupied room with DND 1/2, MyBar 12 min and a waiting task", () => {
    const m = roomCellModel(
      room({
        dnd: { count: 1, minChecks: 2, status: "AKTIF", lastAt: ago(5 * MIN) },
        mybar: { requestId: "m1", since: ago(12 * MIN), seen: false },
      }),
      NOW,
    );
    expect(m.tone).toBe("warn");
    expect(m.edge).toBe("solid");
    expect(m.corner).toEqual(["D1/2", "M12"]);
    expect(m.checked).toBe(false);
    expect(m.ariaLabel).toBe("204: Dolu, görev bekliyor, DND 1/2, MyBar 12 dk");
  });

  it("empty room has a dashed edge", () => {
    const m = roomCellModel(room({ occupied: false, task: null }), NOW);
    expect(m.edge).toBe("dashed");
    expect(m.ariaLabel).toBe("204: Boş, görev yok");
  });

  it("checked today", () => {
    const m = roomCellModel(room({ checkedToday: { type: "URUN_EKLENDI", at: ago(MIN), userId: "u1" } }), NOW);
    expect(m.checked).toBe(true);
    expect(m.ariaLabel).toContain("kontrol edildi");
  });

  it("no task is muted", () => {
    expect(roomCellModel(room({ task: null }), NOW).tone).toBe("muted");
  });

  it("task states map to tones", () => {
    const tone = (status: NonNullable<RoomCell["task"]>["status"]) =>
      roomCellModel(room({ task: { itemId: "t", type: "INHOUSE_KONTROL", status, priority: 1 } }), NOW).tone;
    expect(tone("BEKLIYOR")).toBe("warn");
    expect(tone("DEVAM")).toBe("info");
    expect(tone("DND_BEKLIYOR")).toBe("info");
    expect(tone("TAMAMLANDI")).toBe("success");
    expect(tone("EKSIK")).toBe("danger");
  });

  it("DND EKSIK is danger", () => {
    const m = roomCellModel(room({ dnd: { count: 1, minChecks: 2, status: "EKSIK", lastAt: ago(MIN) } }), NOW);
    expect(m.tone).toBe("danger");
    expect(m.corner).toEqual(["D1/2"]);
  });

  it("a finished DND shows no corner mark; MyBar below a minute is M0", () => {
    const m = roomCellModel(
      room({
        dnd: { count: 2, minChecks: 2, status: "TAMAMLANDI", lastAt: ago(MIN) },
        mybar: { requestId: "m", since: ago(10_000), seen: true },
      }),
      NOW,
    );
    expect(m.corner).toEqual(["M0"]);
  });
});

function table(over: Partial<TableCard> = {}): TableCard {
  return { tableId: "t1", label: "M1", orders: [], call: null, ...over };
}

describe("tableCardModel", () => {
  it("GONDERILDI -> Onay bekliyor, warn", () => {
    const m = tableCardModel(
      table({ orders: [{ orderId: "o1", orderNo: 45, status: "GONDERILDI", since: ago(MIN) }] }),
      NOW,
    );
    expect(m.statusText).toBe("Onay bekliyor");
    expect(m.tone).toBe("warn");
    expect(m.badges).toContain("1 sipariş");
  });

  it("ONAYLANDI -> Hazırlanıyor (info), HAZIR -> Hazır (success)", () => {
    const one = (status: "ONAYLANDI" | "HAZIR") =>
      tableCardModel(table({ orders: [{ orderId: "o", orderNo: 1, status, since: ago(MIN) }] }), NOW);
    expect(one("ONAYLANDI")).toMatchObject({ statusText: "Hazırlanıyor", tone: "info" });
    expect(one("HAZIR")).toMatchObject({ statusText: "Hazır", tone: "success" });
  });

  it("a call open for 61 s is danger with the seconds exposed", () => {
    const m = tableCardModel(table({ call: { callId: "c1", type: "GARSON", since: ago(61_000) } }), NOW);
    expect(m.callSeconds).toBe(61);
    expect(m.tone).toBe("danger");
    expect(m.badges).toContain("Çağrı");
  });

  it("a fresh call keeps the status tone", () => {
    const m = tableCardModel(table({ call: { callId: "c1", type: "GARSON", since: ago(10_000) } }), NOW);
    expect(m.callSeconds).toBe(10);
    expect(m.tone).not.toBe("danger");
  });

  it("no waiter -> Atanmadı", () => {
    expect(tableCardModel(table(), NOW).waiter).toBe("Atanmadı");
    expect(tableCardModel(table({ waiterId: "w", waiterName: "Ayşe Kaya" }), NOW).waiter).toBe("Ayşe Kaya");
    expect(tableCardModel(table(), NOW, false).waiter).toBe("");
    expect(tableCardModel(table({ waiterId: "w", waiterName: "Ayşe Kaya" }), NOW, false).waiter).toBe("Ayşe Kaya");
  });

  it("empty table is Boş / muted", () => {
    expect(tableCardModel(table(), NOW)).toMatchObject({ statusText: "Boş", tone: "muted", guestPresent: false });
  });

  it("guest presence: 39 min scan yes, 41 min no, emptiedAt cancels", () => {
    expect(tableCardModel(table({ scannedAt: ago(39 * MIN) }), NOW).guestPresent).toBe(true);
    expect(tableCardModel(table({ scannedAt: ago(41 * MIN) }), NOW).guestPresent).toBe(false);
    expect(tableCardModel(table({ scannedAt: ago(39 * MIN) }), NOW)).toMatchObject({
      statusText: "Dolu",
      tone: "accent",
    });
    expect(
      tableCardModel(table({ scannedAt: ago(10 * MIN), emptiedAt: ago(5 * MIN) }), NOW).guestPresent,
    ).toBe(false);
  });
});

describe("metricLayer", () => {
  it("maps counter screens to layers", () => {
    expect(metricLayer("MB-DND")).toBe("MINIBAR");
    expect(metricLayer("QS-KUY")).toBe("SIPARIS");
    expect(metricLayer("QM-CAG")).toBe("SIPARIS");
    expect(metricLayer("RO-SLA")).toBe("ODA_SERVISI");
    expect(metricLayer("CR-ONL")).toBe("PERSONEL");
    expect(metricLayer("CR-SYS")).toBe("SISTEM");
  });
});

describe("sparkline helpers", () => {
  const spark = [
    { bucketStart: "2026-11-03T09:58:00.000Z", counts: { MINIBAR: 2, SIPARIS: 1 } },
    { bucketStart: "2026-11-03T09:59:00.000Z", counts: { SIPARIS: 4 } },
    { bucketStart: "2026-11-03T10:00:00.000Z", counts: {} },
  ];
  it("sums per bucket and filters by layers", () => {
    expect(sparkTotals(spark)).toEqual([3, 4, 0]);
    expect(sparkTotals(spark, new Set(["MINIBAR"] as const))).toEqual([2, 0, 0]);
  });
  it("never produces NaN, also with no data", () => {
    expect(sparkPoints([], 100, 20)).not.toContain("NaN");
    expect(sparkPoints([0, 0, 0], 100, 20)).not.toContain("NaN");
    expect(sparkPoints([5], 100, 20)).not.toContain("NaN");
    expect(sparkPoints([1, 2, 4], 100, 20).split(" ")).toHaveLength(3);
  });
});
