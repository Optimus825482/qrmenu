import { describe, expect, it } from "vitest";
import {
  compareRadarEvents,
  RADAR_EVENT_TYPES,
  SOURCE_RANK,
  toRadarEvent,
} from "@/modules/radar/events";
import { findForbiddenKeys } from "@/modules/radar/privacy";
import type { RadarEvent } from "@/modules/radar/types";
import { EVENT_TYPE_RE, type MeritEvent, SSE_EVENT_TYPES } from "@/lib/realtime-events";

const AT = "2026-11-03T10:00:00.000Z";
const env = (type: string, payload?: unknown, patch: Partial<MeritEvent> = {}): MeritEvent => ({
  type,
  hotelId: "h1",
  outletId: "ol1",
  at: AT,
  ...(payload === undefined ? {} : { payload }),
  ...patch,
});

const ORDER_P = {
  orderId: "o1",
  orderNo: 45,
  status: "ONAYLANDI",
  from: "GONDERILDI",
  kind: "MASA",
  tableId: "t1",
  tableLabel: "M12",
  assignedWaiterId: "u2",
  byUserId: "u3",
};
const DND_P = { roomId: "r1", roomNumber: "204", floorId: "f1", count: 1, required: 2, status: "AKTIF", byUserId: "u1" };

const SAMPLES: Record<string, MeritEvent> = {
  "order.created": env("order.created", { ...ORDER_P, status: "GONDERILDI", from: null }),
  "order.confirmed": env("order.confirmed", { ...ORDER_P, status: "TEYIT_BEKLIYOR" }),
  "order.approved": env("order.approved", ORDER_P),
  "order.rejected": env("order.rejected", { ...ORDER_P, status: "REDDEDILDI" }),
  "order.prep": env("order.prep", ORDER_P),
  "order.ready": env("order.ready", { ...ORDER_P, status: "HAZIR" }),
  "order.onway": env("order.onway", { ...ORDER_P, status: "YOLDA", kind: "ODA_SERVISI", roomId: "r1" }),
  "order.delivered": env("order.delivered", { ...ORDER_P, status: "TESLIM_EDILDI", kind: "ODA_SERVISI" }),
  "order.served": env("order.served", { ...ORDER_P, status: "SERVIS_EDILDI" }),
  "order.cancelled": env("order.cancelled", { ...ORDER_P, status: "IPTAL" }),
  "order.escalated": env("order.escalated", { orderId: "o1", orderNo: 45, status: "GONDERILDI" }),
  "order.sla": env("order.sla", { orderId: "o1", orderNo: 45, roomId: "r1", level: "WARN", ageMin: 24 }),
  "call.created": env("call.created", { callId: "c1", tableId: "t1", tableLabel: "M12", type: "GARSON" }),
  "call.resolved": env("call.resolved", { callId: "c1", tableId: "t1", status: "YANITLANDI" }),
  "assignment.changed": env("assignment.changed", { tableId: "t1", userId: "u2" }),
  "print.queued": env("print.queued", { jobId: "j1", orderId: "o1", printerId: "p1" }),
  "print.printed": env("print.printed", { jobId: "j1", orderId: "o1", printerId: "p1" }),
  "print.failed": env("print.failed", { jobId: "j1", orderId: "o1", printerId: "p1", reason: "BASILAMADI", error: "x" }),
  "printer.status": env("printer.status", { printerId: "p1", ok: false, reason: "SESSIZ" }),
  "scan.table": env("scan.table", { tableId: "t1", tableLabel: "M12" }),
  "scan.room": env("scan.room", { roomId: "r1", roomNumber: "204", floorId: "f1" }),
  "session.changed": env("session.changed", { sessionId: "s1", userId: "u1", fullName: "Ayşe Kaya", status: "ONLINE" }),
  "ordering.changed": env("ordering.changed", { enabled: false }),
  "settings.changed": env("settings.changed", { key: "rs.slaMinutes" }),
  "definition.changed": env("definition.changed", { entity: "Room", id: "r1", op: "update" }),
  "realtime.resync": { type: "realtime.resync", at: AT },
  "mybar.created": env("mybar.created", { requestId: "m1", roomId: "r1", roomNumber: "204" }),
  "mybar.seen": env("mybar.seen", { requestId: "m1", roomId: "r1", byUserId: "u1" }),
  "mybar.completed": env("mybar.completed", {
    requestId: "m1", roomId: "r1", roomNumber: "204", closedWithMissing: false, waitSec: 90, byUserId: "u1",
  }),
  "mybar.cancelled": env("mybar.cancelled", { requestId: "m1", roomId: "r1", byUserId: "u1" }),
  "roomcheck.done": env("roomcheck.done", {
    roomId: "r1", roomNumber: "204", floorId: "f1", checkType: "URUN_EKLENDI", addedQty: 3, taskStatus: "TAMAMLANDI", byUserId: "u1",
  }),
  "room.check.changed": env("room.check.changed", { roomId: "r1", transactionId: "x1", op: "SIL", byUserId: "u1" }),
  "dnd.marked": env("dnd.marked", DND_P),
  "dnd.completed": env("dnd.completed", { ...DND_P, count: 2, status: "TAMAMLANDI" }),
  "dnd.missed": env("dnd.missed", { date: "2026-11-03", roomIds: ["r1", "r2"] }),
  "task.updated": env("task.updated", { items: [{ taskItemId: "k1", roomId: "r1", from: "BEKLIYOR", to: "DEVAM" }] }),
  "task.generated": env("task.generated", { day: "2026-11-03", types: ["INHOUSE_KONTROL"], itemCount: 40 }),
  "stock.changed": env("stock.changed", { productId: "pr1", remainingQty: 4, criticalLevel: 5, delta: -2, type: "TRANSFER" }),
  "stock.critical": env("stock.critical", { productId: "pr1", remainingQty: 4, criticalLevel: 5 }),
  "occupancy.uploaded": env("occupancy.uploaded", { uploadId: "up1", kind: "INHOUSE", status: "TAMAMLANDI", okRows: 10, errorRows: 0 }),
  "occupancy.missing": env("occupancy.missing", { date: "2026-11-03", missingKinds: ["INHOUSE"], slot: "10:00" }),
  "presence.tick": env("presence.tick", { sessions: [{ sessionId: "s1", lastSeenAt: AT }] }),
  "mail.failed": env("mail.failed", { kind: "RAPOR" }),
};

describe("RADAR_EVENT_TYPES", () => {
  it("43 ad, hepsi geçerli SSE adı; roomcheck.done SSE_EVENT_TYPES dışında, mybar.created içinde", () => {
    expect(RADAR_EVENT_TYPES).toHaveLength(43);
    expect(new Set(RADAR_EVENT_TYPES).size).toBe(43);
    for (const name of RADAR_EVENT_TYPES) expect(EVENT_TYPE_RE.test(name)).toBe(true);
    expect(SSE_EVENT_TYPES).not.toContain("roomcheck.done");
    expect(SSE_EVENT_TYPES).toContain("mybar.created");
  });

  it("her ad için örnek var ve toRadarEvent hatasız geçer", () => {
    for (const name of RADAR_EVENT_TYPES) {
      const sample = SAMPLES[name];
      expect(sample, name).toBeDefined();
      expect(() => toRadarEvent(sample!), name).not.toThrow();
      const r = toRadarEvent(sample!);
      // Every sample is meaningful: it yields an event, a refresh or a gap.
      expect(r.events.length > 0 || r.refresh || r.gap, name).toBeTruthy();
    }
  });
});

describe("toRadarEvent: siparişler", () => {
  it("order.approved tek order.status üretir (beyaz liste)", () => {
    const r = toRadarEvent(env("order.approved", ORDER_P, { hotelId: "h1", outletId: "ol1" }));
    expect(r.refresh).toBeUndefined();
    expect(r.events).toEqual([
      {
        id: `order.approved:o1:${AT}`,
        at: AT,
        type: "order.status",
        layer: "SIPARIS",
        orderId: "o1",
        orderNo: 45,
        kind: "MASA",
        to: "ONAYLANDI",
        from: "GONDERILDI",
        tableId: "t1",
        waiterId: "u2",
        byUserId: "u3",
        hotelId: "h1",
        outletId: "ol1",
      },
    ]);
  });

  it("ODA_SERVISI kind katmanı ve roomId taşır", () => {
    const r = toRadarEvent(env("order.ready", { ...ORDER_P, kind: "ODA_SERVISI", status: "HAZIR", roomId: "r9", tableId: null }));
    expect(r.events[0]).toMatchObject({ type: "order.status", layer: "ODA_SERVISI", roomId: "r9", to: "HAZIR" });
  });

  it("eski order.created yükü (kind yok): roomNumber varsa oda servisi", () => {
    const r = toRadarEvent(env("order.created", { orderId: "o2", orderNo: 1, roomId: "r1", roomNumber: "204", status: "GONDERILDI" }));
    expect(r.events[0]).toMatchObject({ layer: "ODA_SERVISI", kind: "ODA_SERVISI", to: "GONDERILDI" });
  });

  it("order.prep: prep=true, to=ONAYLANDI", () => {
    const r = toRadarEvent(env("order.prep", ORDER_P));
    expect(r.events[0]).toMatchObject({ type: "order.status", prep: true, to: "ONAYLANDI" });
  });

  it("telefon teyidinde order.confirmed(ONAYLANDI) çift olay üretmez", () => {
    expect(toRadarEvent(env("order.confirmed", ORDER_P)).events).toEqual([]);
  });

  it("garson siparişi (from yok, order.created yok) yine order.status üretir", () => {
    const r = toRadarEvent(env("order.approved", { ...ORDER_P, from: null, source: "GARSON" }));
    expect(r.events[0]).toMatchObject({ type: "order.status", to: "ONAYLANDI" });
    expect((r.events[0] as { from?: string }).from).toBeUndefined();
  });
});

describe("toRadarEvent: minibar ve sistem", () => {
  it("dnd.marked: required -> minChecks", () => {
    const r = toRadarEvent(env("dnd.marked", { ...DND_P, count: 1, required: 2, status: "AKTIF" }));
    expect(r.events[0]).toMatchObject({ type: "dnd.marked", layer: "MINIBAR", roomId: "r1", count: 1, minChecks: 2, status: "AKTIF" });
  });

  it("task.updated: 3 kalem 3 olay, kimlikler benzersiz; truncated yenileme ister", () => {
    const items = ["a", "b", "c"].map((k) => ({ taskItemId: k, roomId: "r1", from: "BEKLIYOR", to: "DEVAM" }));
    const r = toRadarEvent(env("task.updated", { items }));
    expect(r.events).toHaveLength(3);
    expect(new Set(r.events.map((e) => e.id)).size).toBe(3);
    expect(r.events[0]!.id).toMatch(/#0:/);
    expect(toRadarEvent(env("task.updated", { items, truncated: true })).refresh).toBe("ALL");
  });

  it("payloadTruncated her olayda refresh ALL", () => {
    expect(toRadarEvent(env("order.approved", undefined, { payloadTruncated: true }))).toEqual({ events: [], refresh: "ALL" });
    expect(toRadarEvent(env("stock.changed", undefined, { payloadTruncated: true })).refresh).toBe("ALL");
  });

  it("stock.changed -> stock.level; çoklu kalem ayrı olaylar", () => {
    expect(toRadarEvent(SAMPLES["stock.changed"]!).events[0]).toMatchObject({
      type: "stock.level", productId: "pr1", remaining: 4, critical: 5,
    });
    const many = toRadarEvent(env("stock.changed", { items: [
      { productId: "a", remainingQty: 1, criticalLevel: 2 },
      { productId: "b", remainingQty: 3, criticalLevel: 2 },
    ] }));
    expect(many.events).toHaveLength(2);
  });

  it("mybar.completed sonucu eksik/tamam; cancelled IPTAL", () => {
    const base = { requestId: "m1", roomId: "r1", roomNumber: "204", waitSec: 5, byUserId: "u1" };
    expect(toRadarEvent(env("mybar.completed", { ...base, closedWithMissing: true })).events[0]).toMatchObject({ type: "mybar.closed", outcome: "EKSIK" });
    expect(toRadarEvent(env("mybar.completed", { ...base, closedWithMissing: false })).events[0]).toMatchObject({ outcome: "TAMAM" });
    expect(toRadarEvent(SAMPLES["mybar.cancelled"]!).events[0]).toMatchObject({ outcome: "IPTAL" });
  });

  it("ordering.changed -> outlet.ordering", () => {
    expect(toRadarEvent(SAMPLES["ordering.changed"]!).events[0]).toMatchObject({
      type: "outlet.ordering", outletId: "ol1", enabled: false, layer: "SIPARIS",
    });
  });

  it("printer.status: SESSIZ/HATA/HAZIR durumları", () => {
    const state = (p: object) => (toRadarEvent(env("printer.status", p)).events[0] as { state: string }).state;
    expect(state({ printerId: "p", ok: true })).toBe("HAZIR");
    expect(state({ printerId: "p", ok: false })).toBe("HATA");
    expect(state({ printerId: "p", ok: false, reason: "SESSIZ" })).toBe("SESSIZ");
  });

  it("presence.tick her oturum için dokunma olayı üretir (lastSeenAt)", () => {
    const r = toRadarEvent(SAMPLES["presence.tick"]!);
    expect(r.events[0]).toMatchObject({ type: "presence", sessionId: "s1", lastSeenAt: AT, layer: "PERSONEL" });
  });

  it("realtime.resync -> gap", () => {
    expect(toRadarEvent({ type: "realtime.resync", at: AT })).toEqual({ events: [], gap: true, refresh: "ALL" });
  });

  it("settings.changed: yalnız radar.*, module.* ve eşik anahtarları yeniler", () => {
    expect(toRadarEvent(env("settings.changed", { key: "price.display" }))).toEqual({ events: [] });
    for (const key of ["rs.slaMinutes", "radar.wallRotateSeconds", "module.QR_ORDER", "dnd.minChecks", "order.callAlertSeconds"]) {
      expect(toRadarEvent(env("settings.changed", { key })).refresh, key).toBe("ALL");
    }
  });

  it("definition.changed her zaman yeniler; bilinmeyen tip ve hotelId'siz zarf olay üretmez", () => {
    expect(toRadarEvent(env("definition.changed", { entity: "Table" })).refresh).toBe("ALL");
    expect(toRadarEvent(env("no.such.type", {}))).toEqual({ events: [] });
    expect(toRadarEvent(env("order.approved", ORDER_P, { hotelId: undefined }))).toEqual({ events: [] });
  });

  it("eksik/bozuk yük çökmeden boş döner", () => {
    for (const name of RADAR_EVENT_TYPES) {
      if (name === "realtime.resync") continue;
      expect(() => toRadarEvent(env(name, "bozuk"))).not.toThrow();
      expect(() => toRadarEvent(env(name, { items: "x", sessions: 3 }))).not.toThrow();
    }
  });
});

describe("gizlilik", () => {
  it("order.rejected yasak anahtar ve metin taşımaz", () => {
    const r = toRadarEvent(
      env("order.rejected", { ...ORDER_P, status: "REDDEDILDI", rejectReason: "x-sebep", subtotal: 12, note: "n-not", unitPrice: 3, ip: "1.2.3.4" }),
    );
    expect(r.events).toHaveLength(1);
    expect(findForbiddenKeys(r)).toEqual([]);
    const json = JSON.stringify(r);
    for (const s of ["rejectReason", "subtotal", "note", "unitPrice", "x-sebep", "n-not", "1.2.3.4"]) expect(json).not.toContain(s);
  });

  it("hiçbir örnek yasak anahtar taşımaz; session.changed ad sızdırmaz", () => {
    for (const name of RADAR_EVENT_TYPES) {
      expect(findForbiddenKeys(toRadarEvent(SAMPLES[name]!)), name).toEqual([]);
    }
    expect(JSON.stringify(toRadarEvent(SAMPLES["session.changed"]!))).not.toContain("Ayşe");
  });
});

describe("sıralama (Review Focus 2)", () => {
  const ev = (over: Partial<RadarEvent> & { type: RadarEvent["type"] }, id: string, at = AT): RadarEvent =>
    ({ id, at, hotelId: "h1", layer: "SIPARIS", ...over }) as RadarEvent;
  const status = (to: string, id: string, at = AT) =>
    ev({ type: "order.status", orderId: "o", orderNo: 1, kind: "MASA", to: to as never }, id, at);

  it("aynı ms: yaratma < geçiş < uyarı; eşit rankta id sırası", () => {
    const create = status("GONDERILDI", "z");
    const approve = status("ONAYLANDI", "a");
    const esc = ev({ type: "order.escalated", orderId: "o", orderNo: 1 }, "0");
    const approve2 = status("HAZIR", "b");
    expect(SOURCE_RANK(create)).toBe(0);
    expect(SOURCE_RANK(approve)).toBe(1);
    expect(SOURCE_RANK(esc)).toBe(2);
    expect([esc, approve2, approve, create].sort(compareRadarEvents).map((e) => e.id)).toEqual(["z", "a", "b", "0"]);
  });

  it("farklı at önce gelir; rastgele iki karıştırma aynı diziyi verir", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const types = ["GONDERILDI", "ONAYLANDI", "HAZIR", "IPTAL"];
    const events: RadarEvent[] = Array.from({ length: 200 }, (_, i) => {
      const at = new Date(Date.parse(AT) + Math.floor(rnd() * 5) * 1000).toISOString();
      return rnd() < 0.2
        ? ev({ type: "order.escalated", orderId: "o", orderNo: 1 }, `e${i}`, at)
        : status(types[Math.floor(rnd() * 4)]!, `s${i}`, at);
    });
    const shuffle = (arr: RadarEvent[]) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j]!, a[i]!];
      }
      return a;
    };
    const one = shuffle(events).sort(compareRadarEvents).map((e) => e.id);
    const two = shuffle(events).sort(compareRadarEvents).map((e) => e.id);
    expect(one).toEqual(two);
    for (let i = 1; i < one.length; i++) {
      const a = events.find((e) => e.id === one[i - 1])!;
      const b = events.find((e) => e.id === one[i])!;
      expect(compareRadarEvents(a, b)).toBeLessThanOrEqual(0);
    }
  });
});
