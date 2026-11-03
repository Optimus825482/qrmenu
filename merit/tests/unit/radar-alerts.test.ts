import { describe, expect, it } from "vitest";
import { deriveAlerts, groupAlerts, type AlertLayers, type AlertThresholds } from "@/modules/radar/alerts";
import type { RadarAlert } from "@/modules/radar/types";

const TH: AlertThresholds = { callAlertSeconds: 60, mybarStaleMinutes: 30, idleMinutes: 10, approvalEscalationMinutes: 2 };
// 12:00 Nicosia (UTC+2 in November).
const NOW = new Date("2026-11-03T10:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const OPTS = { hotelId: "h1", isSystem: false };

const queues = {
  kasa: { count: 0 },
  kds: { YENI: { count: 0 }, HAZIRLANIYOR: { count: 0 }, HAZIR: { count: 0 } },
  print: { KUYRUKTA: 0, BASILIYOR: 0, HATA: 0 },
  jobs: [],
};

function orderLayer(over: {
  call?: { since: string };
  orders?: { status: "GONDERILDI" | "ONAYLANDI"; since: string; escalated?: boolean }[];
  printHata?: number;
  printers?: { state: "HAZIR" | "SESSIZ" | "HATA" }[];
}): AlertLayers {
  return {
    order: {
      outlets: [
        {
          outletId: "o1",
          name: "Restoran",
          type: "SALON",
          orderingEnabled: true,
          areas: [
            {
              areaId: "a1",
              name: "Salon",
              tables: [
                {
                  tableId: "t1",
                  label: "M1",
                  orders: (over.orders ?? []).map((o, i) => ({ orderId: `ord${i}`, orderNo: i + 1, ...o })),
                  call: over.call ? { callId: "c1", type: "GARSON", since: over.call.since } : null,
                },
              ],
            },
          ],
          queues: { ...queues, print: { ...queues.print, HATA: over.printHata ?? 0 } },
          printers: (over.printers ?? []).map((p, i) => ({ printerId: `p${i}`, name: `Yazici ${i}`, ...p })),
        },
      ],
    },
  } as AlertLayers;
}

const minibarLayer = (over: Partial<NonNullable<AlertLayers["minibar"]>> & { room?: object } = {}): AlertLayers => {
  const { room, ...rest } = over;
  return {
    minibar: {
      floors: [
        {
          floorId: "f1",
          number: 1,
          name: "Kat 1",
          rooms: [{ roomId: "r1", number: "101", occupied: true, task: null, checkedToday: null, dnd: null, mybar: null, ...room }],
        },
      ],
      supervisors: [],
      stock: [],
      uploads: [],
      ...rest,
    },
  };
};

describe("deriveAlerts", () => {
  it("raises a call alert only past callAlertSeconds", () => {
    const at59 = deriveAlerts(orderLayer({ call: { since: ago(59_000) } }), NOW, TH, OPTS);
    expect(at59.filter((a) => a.kind === "CAGRI")).toHaveLength(0);
    const at61 = deriveAlerts(orderLayer({ call: { since: ago(61_000) } }), NOW, TH, OPTS);
    expect(at61.filter((a) => a.kind === "CAGRI")).toEqual([
      expect.objectContaining({ severity: "crit", kind: "CAGRI", hotelId: "h1", ref: { outletId: "o1", tableId: "t1" } }),
    ]);
  });

  it("flags an unapproved order that was escalated or waited past the threshold", () => {
    const fresh = deriveAlerts(orderLayer({ orders: [{ status: "GONDERILDI", since: ago(60_000) }] }), NOW, TH, OPTS);
    expect(fresh).toHaveLength(0);
    const late = deriveAlerts(orderLayer({ orders: [{ status: "GONDERILDI", since: ago(121_000) }] }), NOW, TH, OPTS);
    expect(late.map((a) => a.kind)).toEqual(["SIPARIS_ONAY"]);
    const escalated = deriveAlerts(
      orderLayer({ orders: [{ status: "GONDERILDI", since: ago(1000), escalated: true }] }),
      NOW,
      TH,
      OPTS,
    );
    expect(escalated.map((a) => a.kind)).toEqual(["SIPARIS_ONAY"]);
    const approved = deriveAlerts(
      orderLayer({ orders: [{ status: "ONAYLANDI", since: ago(600_000), escalated: true }] }),
      NOW,
      TH,
      OPTS,
    );
    expect(approved).toHaveLength(0);
  });

  it("raises MyBar alerts past radar.mybarStaleMinutes", () => {
    const mk = (min: number, th = TH) =>
      deriveAlerts(
        minibarLayer({ room: { mybar: { requestId: "m1", since: ago(min * 60_000), seen: false } } }),
        NOW,
        th,
        OPTS,
      ).filter((a) => a.kind === "MYBAR");
    expect(mk(29)).toHaveLength(0);
    expect(mk(30)).toHaveLength(0);
    expect(mk(31)).toHaveLength(1);
    expect(mk(31, { ...TH, mybarStaleMinutes: 45 })).toHaveLength(0);
  });

  it("maps room-service age against the SLA: 79 percent none, 80 warn, 100 crit", () => {
    // SLA 10 min = 600 s: 79 % = 474 s, 80 % = 480 s, 100 % = 600 s.
    const at = (sec: number, level: "OK" | "WARN" | "BREACH" = "OK") =>
      deriveAlerts(
        {
          roomService: {
            slaMinutes: 10,
            orders: [{ orderId: "rs1", orderNo: 7, roomNumber: "101", status: "HAZIR", createdAt: ago(sec * 1000), level }],
          },
        },
        NOW,
        TH,
        OPTS,
      );
    expect(at(474)).toHaveLength(0);
    expect(at(480)).toEqual([expect.objectContaining({ kind: "RS_SLA", severity: "warn" })]);
    expect(at(600)).toEqual([expect.objectContaining({ kind: "RS_SLA", severity: "crit" })]);
    // A level the server already stamped counts even when the clock says otherwise.
    expect(at(1, "BREACH")[0]?.severity).toBe("crit");
  });

  it("flags stock at the critical level but not one above", () => {
    const stock = (remaining: number) =>
      deriveAlerts(minibarLayer({ stock: [{ productId: "p1", name: "Kola", remaining, critical: 5 }] }), NOW, TH, OPTS).filter(
        (a) => a.kind === "STOK",
      );
    expect(stock(5)).toHaveLength(1);
    expect(stock(6)).toHaveLength(0);
    expect(stock(4)).toHaveLength(1);
  });

  it("flags silent and failed printers and failed print jobs", () => {
    const a = deriveAlerts(
      orderLayer({ printHata: 2, printers: [{ state: "SESSIZ" }, { state: "HATA" }, { state: "HAZIR" }] }),
      NOW,
      TH,
      OPTS,
    );
    expect(a.filter((x) => x.kind === "YAZICI")).toHaveLength(2);
    expect(a.find((x) => x.kind === "YAZICI_IS")).toMatchObject({ count: 2, severity: "crit" });
  });

  it("raises missing-upload alerts only from 10:00 Nicosia", () => {
    const layers = minibarLayer({
      uploads: [
        { kind: "IN_HOUSE", status: "EKSIK" },
        { kind: "ARRIVAL", status: "TAMAMLANDI" },
      ],
    });
    const count = (d: Date) => deriveAlerts(layers, d, TH, OPTS).filter((a) => a.kind === "YUKLEME").length;
    // 09:59 and 10:00 in Nicosia (UTC+2).
    expect(count(new Date("2026-11-03T07:59:00.000Z"))).toBe(0);
    expect(count(new Date("2026-11-03T08:00:00.000Z"))).toBe(1);
  });

  it("flags DND EKSIK rooms", () => {
    const a = deriveAlerts(
      minibarLayer({ room: { dnd: { count: 1, minChecks: 2, status: "EKSIK", lastAt: ago(1000) } } }),
      NOW,
      TH,
      OPTS,
    );
    expect(a.map((x) => x.kind)).toEqual(["DND_EKSIK"]);
  });

  it("reports failed mail to SISTEM only", () => {
    const none = {} as AlertLayers;
    expect(deriveAlerts(none, NOW, TH, { hotelId: "h1", isSystem: false, mailFailed: 3 })).toHaveLength(0);
    expect(deriveAlerts(none, NOW, TH, { hotelId: "h1", isSystem: true, mailFailed: 0 })).toHaveLength(0);
    expect(deriveAlerts(none, NOW, TH, { hotelId: "h1", isSystem: true, mailFailed: 3 })).toEqual([
      expect.objectContaining({ kind: "EPOSTA", count: 3 }),
    ]);
  });

  it("is a pure function of its inputs", () => {
    const layers = orderLayer({ call: { since: ago(90_000) } });
    expect(deriveAlerts(layers, NOW, TH, OPTS)).toEqual(deriveAlerts(layers, NOW, TH, OPTS));
  });
});

describe("groupAlerts", () => {
  const alert = (over: Partial<RadarAlert>): RadarAlert => ({
    key: "k",
    severity: "crit",
    kind: "YAZICI",
    hotelId: "h1",
    ref: {},
    text: "x",
    since: ago(1000),
    count: 1,
    ...over,
  });

  it("merges the same kind into one counted row", () => {
    const { shown, more } = groupAlerts([1, 2, 3].map((i) => alert({ key: `p${i}`, ref: { printerId: `p${i}` } })));
    expect(more).toBe(0);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ kind: "YAZICI", count: 3 });
    expect(shown[0]?.text).toContain("×3");
  });

  it("caps at five rows and counts the rest, critical first", () => {
    const kinds: RadarAlert["kind"][] = ["CAGRI", "STOK", "MYBAR", "YUKLEME", "DND_EKSIK", "SIPARIS_ONAY", "RS_SLA"];
    const alerts = kinds.map((kind, i) =>
      alert({ key: kind, kind, severity: kind === "RS_SLA" ? "warn" : "crit", since: ago(i * 1000) }),
    );
    const { shown, more } = groupAlerts(alerts);
    expect(shown).toHaveLength(5);
    expect(more).toBe(2);
    expect(shown.every((a) => a.severity === "crit")).toBe(true);
    // Oldest first inside one severity.
    const ages = shown.map((a) => Date.parse(a.since));
    expect([...ages].sort((a, b) => a - b)).toEqual(ages);
  });

  it("puts warnings after criticals", () => {
    const { shown } = groupAlerts([
      alert({ key: "w", kind: "RS_SLA", severity: "warn", since: ago(900_000) }),
      alert({ key: "c", kind: "CAGRI", severity: "crit", since: ago(1000) }),
    ]);
    expect(shown.map((a) => a.severity)).toEqual(["crit", "warn"]);
  });
});
