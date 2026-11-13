import { describe, expect, it } from "vitest";
import { compareRadarEvents } from "@/modules/radar/events";
import { initialState, toSnapshot, type RadarState } from "@/modules/radar/state";
import { applyEvents, reduce } from "@/modules/radar/ui/reducers";
import { H, T0, deepFreeze, ev, makeSnapshot, orderStatus } from "../helpers/radarStateFixtures";

const fresh = () => deepFreeze(initialState(makeSnapshot()));
const outlet = (s: RadarState) => s.layers.order!.outlets[0];
const table = (s: RadarState, id: string) => outlet(s).areas[0].tables.find((t) => t.tableId === id)!;
const room = (s: RadarState, id: string) => s.layers.minibar!.floors[0].rooms.find((r) => r.roomId === id)!;

describe("radar reducers", () => {
  it("masa siparisi eklenir/cikar, kasa ve KDS sayaclari turetilir", () => {
    let s = reduce(fresh(), orderStatus(T0 + 1000, "x1", "t1", "GONDERILDI"));
    expect(table(s, "t1").orders).toHaveLength(1);
    expect(outlet(s).queues.kasa.count).toBe(1);
    s = reduce(s, orderStatus(T0 + 2000, "x1", "t1", "ONAYLANDI"));
    expect(outlet(s).queues.kasa.count).toBe(0);
    expect(outlet(s).queues.kds.YENI.count).toBe(1);
    s = reduce(s, orderStatus(T0 + 3000, "x1", "t1", "ONAYLANDI", { prep: true }));
    expect(outlet(s).queues.kds.YENI.count).toBe(0);
    expect(outlet(s).queues.kds.HAZIRLANIYOR.count).toBe(1);
    expect(outlet(s).queues.kds.HAZIRLANIYOR.oldest).toBeDefined();
    s = reduce(s, orderStatus(T0 + 4000, "x1", "t1", "HAZIR"));
    expect(outlet(s).queues.kds.HAZIR.count).toBe(1);
    s = reduce(s, orderStatus(T0 + 5000, "x1", "t1", "SERVIS_EDILDI"));
    expect(table(s, "t1").orders).toHaveLength(0);
    expect(outlet(s).queues.kds.HAZIR.count).toBe(0);
  });

  it("garson siparisi: order.created yok, ilk olay ONAYLANDI yaratir", () => {
    const s = reduce(fresh(), orderStatus(T0 + 1000, "w1", "t2", "ONAYLANDI"));
    expect(table(s, "t2").orders.map((o) => o.status)).toEqual(["ONAYLANDI"]);
  });

  it("yaratma+onay ayni at: siralamayla tek siparis ONAYLANDI", () => {
    const created = orderStatus(T0 + 1000, "a1", "t1", "GONDERILDI", { id: "z" });
    const approved = orderStatus(T0 + 1000, "a1", "t1", "ONAYLANDI", { id: "a" });
    const s = applyEvents(fresh(), [approved, created].sort(compareRadarEvents));
    expect(table(s, "t1").orders).toHaveLength(1);
    expect(table(s, "t1").orders[0].status).toBe("ONAYLANDI");
  });

  it("order.escalated ve oda servisi order.sla", () => {
    let s = reduce(fresh(), orderStatus(T0, "x1", "t1", "GONDERILDI"));
    s = reduce(s, ev("order.escalated", T0 + 1, { orderId: "x1", orderNo: 1 }));
    expect(table(s, "t1").orders[0].escalated).toBe(true);
    s = reduce(s, orderStatus(T0 + 2, "rs1", "", "GONDERILDI", { kind: "ODA_SERVISI", tableId: undefined, roomId: "r1" }));
    expect(s.layers.roomService!.orders[0]).toMatchObject({ roomNumber: "101", level: "OK" });
    s = reduce(s, ev("order.sla", T0 + 3, { orderId: "rs1", orderNo: 1, level: "BREACH" }));
    expect(s.layers.roomService!.orders[0].level).toBe("BREACH");
    s = reduce(s, orderStatus(T0 + 4, "rs1", "", "TESLIM_EDILDI", { kind: "ODA_SERVISI", tableId: undefined, roomId: "r1" }));
    expect(s.layers.roomService!.orders).toHaveLength(0);
  });

  it("oda servisi: GONDERILDI acik sayilir; olayla giren siparis anlik goruntu yenilemesi ister", () => {
    let s = reduce(fresh(), orderStatus(T0, "rs2", "", "GONDERILDI", { kind: "ODA_SERVISI", tableId: undefined, roomId: "r1" }));
    expect(s.layers.roomService!.orders.map((o) => o.status)).toEqual(["GONDERILDI"]);
    expect(s.needsRefresh.has("order:rs2")).toBe(true);
    s = reduce(s, orderStatus(T0 + 1, "rs2", "", "IPTAL", { kind: "ODA_SERVISI", tableId: undefined, roomId: "r1" }));
    expect(s.layers.roomService!.orders).toHaveLength(0);
  });

  it("cagri acik/kapali, masa tarama ve atama", () => {
    let s = reduce(fresh(), ev("call.opened", T0, { callId: "c1", tableId: "t1", callType: "GARSON" }));
    expect(table(s, "t1").call).toMatchObject({ callId: "c1", type: "GARSON" });
    s = reduce(s, ev("call.closed", T0 + 1, { callId: "c1", tableId: "t1" }));
    expect(table(s, "t1").call).toBeNull();
    s = reduce(s, ev("table.scanned", T0 + 2, { tableId: "t1" }));
    expect(table(s, "t1").scannedAt).toBeDefined();
    s = reduce(s, ev("table.assigned", T0 + 3, { tableId: "t1", waiterId: "u1" }));
    expect(table(s, "t1").waiterName).toBe("Ayse Kaya");
    s = reduce(s, ev("table.assigned", T0 + 4, { tableId: "t2", waiterId: "bilinmeyen" }));
    expect(s.needsRefresh.has("table:t2")).toBe(true);
    s = reduce(s, ev("table.assigned", T0 + 5, { tableId: "t1", waiterId: null }));
    expect(table(s, "t1").waiterId).toBeUndefined();
  });

  it("print.job upsert/sil, sayilar turetilir; printer.health; outlet.ordering", () => {
    let s = reduce(fresh(), ev("print.job", T0, { jobId: "j1", printerId: "pr1", status: "KUYRUKTA" }));
    expect(outlet(s).queues.print.KUYRUKTA).toBe(1);
    s = reduce(s, ev("print.job", T0 + 1, { jobId: "j1", printerId: "pr1", status: "BASILIYOR" }));
    expect(outlet(s).queues.print).toEqual({ KUYRUKTA: 0, BASILIYOR: 1, HATA: 0 });
    s = reduce(s, ev("print.job", T0 + 2, { jobId: "j1", printerId: "pr1", status: "BASILDI" }));
    expect(outlet(s).queues.print).toEqual({ KUYRUKTA: 0, BASILIYOR: 0, HATA: 0 });
    expect(s.jobs.j1).toBeUndefined();
    s = reduce(s, ev("printer.health", T0 + 3, { printerId: "pr1", state: "SESSIZ" }));
    expect(outlet(s).printers[0].state).toBe("SESSIZ");
    s = reduce(s, ev("outlet.ordering", T0 + 4, { outletId: "o1", enabled: false }));
    expect(outlet(s).orderingEnabled).toBe(false);
  });

  it("oda kontrolu, silme -> needsRefresh, duzelt etkisiz, dnd, mybar, gorev", () => {
    let s = reduce(fresh(), ev("room.checked", T0, { roomId: "r1", checkType: "URUN_EKLENDI", taskStatus: "TAMAMLANDI", byUserId: "u1" }));
    expect(room(s, "r1").checkedToday?.type).toBe("URUN_EKLENDI");
    expect(room(s, "r1").task?.status).toBe("TAMAMLANDI");
    const before = s;
    s = reduce(s, ev("room.check.changed", T0 + 1, { roomId: "r1", op: "DUZELT" }));
    expect(s).toBe(before);
    s = reduce(s, ev("room.check.changed", T0 + 2, { roomId: "r1", op: "SIL" }));
    expect(s.needsRefresh.has("room:r1")).toBe(true);
    s = reduce(s, ev("dnd.marked", T0 + 3, { roomId: "r2", count: 1, minChecks: 2, status: "AKTIF" }));
    s = reduce(s, ev("dnd.marked", T0 + 4, { roomId: "r2", count: 2, minChecks: 2, status: "TAMAMLANDI" }));
    expect(room(s, "r2").dnd).toMatchObject({ count: 2, status: "TAMAMLANDI" });
    s = reduce(s, ev("dnd.missed", T0 + 5, { roomIds: ["r3"] }));
    expect(room(s, "r3").dnd?.status).toBe("EKSIK");
    s = reduce(s, ev("dnd.missed", T0 + 6, { roomIds: [] }));
    expect(s.needsRefresh.has("ALL")).toBe(true);
    s = reduce(s, ev("mybar.opened", T0 + 7, { requestId: "m1", roomId: "r1" }));
    expect(room(s, "r1").mybar).toMatchObject({ seen: false });
    s = reduce(s, ev("mybar.seen", T0 + 8, { requestId: "m1", roomId: "r1" }));
    expect(room(s, "r1").mybar?.seen).toBe(true);
    s = reduce(s, ev("mybar.closed", T0 + 9, { requestId: "m1", roomId: "r1", outcome: "TAMAM" }));
    expect(room(s, "r1").mybar).toBeNull();
    s = reduce(s, ev("task.updated", T0 + 10, { taskItemId: "ti-r3", roomId: "r3", to: "DEVAM" }));
    expect(room(s, "r3").task?.status).toBe("DEVAM");
    s = reduce(fresh(), ev("task.generated", T0, { date: "2026-11-03", itemCount: 4 }));
    expect(s.needsRefresh.has("ALL")).toBe(true);
  });

  it("stock.level 7/5 listeden cikar, 6/5 girer", () => {
    let s = reduce(fresh(), ev("stock.level", T0, { productId: "p1", remaining: 7, critical: 5 }));
    expect(s.layers.minibar!.stock).toHaveLength(0);
    s = reduce(s, ev("stock.level", T0 + 1, { productId: "p1", remaining: 6, critical: 5 }));
    expect(s.layers.minibar!.stock).toHaveLength(1);
  });

  it("presence, upload.status ve mail.failed", () => {
    let s = reduce(fresh(), ev("presence", T0, { sessionId: "s1", userId: "u1", status: "BOSTA", lastSeenAt: new Date(T0).toISOString() }));
    expect(s.layers.staff!.sessions[0].idle).toBe(true);
    s = reduce(s, ev("presence", T0 + 1, { sessionId: "s1", userId: "u1", status: "ONLINE" }));
    expect(s.layers.staff!.sessions[0].idle).toBeUndefined();
    s = reduce(s, ev("presence", T0 + 2, { sessionId: "s9", userId: "u9", status: "ONLINE" }));
    expect(s.needsRefresh.has("session:s9")).toBe(true);
    s = reduce(s, ev("presence", T0 + 3, { sessionId: "s1", userId: "u1", status: "CIKTI" }));
    expect(s.layers.staff!.sessions).toHaveLength(0);
    s = reduce(s, ev("upload.status", T0 + 4, { kind: "DOLULUK", status: "HATA" }));
    expect(s.layers.minibar!.uploads[0].status).toBe("HATA");
    s = reduce(s, ev("mail.failed", T0 + 5, { kind: "RAPOR" }));
    s = reduce(s, ev("mail.failed", T0 + 6, { kind: "RAPOR" }));
    expect(s.mailFailed).toBe(2);
  });

  it("presence.tick dokunmasi (userId bos) yalniz lastSeenAt; idle ve status korunur; bilinmeyen oturum yok sayilir", () => {
    let s = reduce(fresh(), ev("presence", T0, { sessionId: "s1", userId: "u1", status: "BOSTA", lastSeenAt: new Date(T0).toISOString() }));
    const before = s.layers.staff!.sessions[0];
    expect(before.idle).toBe(true);
    s = reduce(s, ev("presence", T0 + 5000, { sessionId: "s1", userId: "", status: "ONLINE", lastSeenAt: new Date(T0 + 5000).toISOString() }));
    const after = s.layers.staff!.sessions[0];
    expect(after.idle).toBe(true);
    expect(after.status).toBe(before.status);
    expect(after.lastSeenAt).toBe(new Date(T0 + 5000).toISOString());
    const same = s;
    s = reduce(s, ev("presence", T0 + 6000, { sessionId: "yok", userId: "", status: "ONLINE", lastSeenAt: new Date(T0 + 6000).toISOString() }));
    expect(s).toBe(same);
    expect(s.needsRefresh.size).toBe(0);
  });

  it("onceki mybar.closed daha yeni talebi silmez; masaya YOLDA eklenmez", () => {
    let s = reduce(fresh(), ev("mybar.opened", T0, { requestId: "m2", roomId: "r1" }));
    s = reduce(s, ev("mybar.closed", T0 + 1, { requestId: "m1", roomId: "r1", outcome: "TAMAM" }));
    expect(room(s, "r1").mybar).toMatchObject({ requestId: "m2" });
    s = reduce(s, ev("mybar.closed", T0 + 2, { requestId: "m2", roomId: "r1", outcome: "TAMAM" }));
    expect(room(s, "r1").mybar).toBeNull();
    s = reduce(fresh(), orderStatus(T0, "x", "t1", "YOLDA"));
    expect(table(s, "t1").orders).toHaveLength(0);
  });

  it("snapshot ortusme penceresi: sayac cift sayilmaz, tekrar oynatma idempotent", () => {
    const base = fresh();
    const snap = toSnapshot(base);
    // snapshot already counts one queued job
    const o = snap.layers.order!.outlets[0];
    const counted = { ...snap, layers: { ...snap.layers, order: { outlets: [{ ...o, queues: { ...o.queues, print: { KUYRUKTA: 1, BASILIYOR: 0, HATA: 0 } } }] } } } as typeof snap;
    const early = ev("print.job", T0 - 500, { jobId: "j1", printerId: "pr1", status: "KUYRUKTA", id: "pj1" });
    let s = initialState(counted);
    s = reduce(s, early);
    expect(outlet(s).queues.print.KUYRUKTA).toBe(1);
    const again = reduce(s, early);
    expect(outlet(again).queues.print.KUYRUKTA).toBe(1);
    s = reduce(s, ev("print.job", T0 + 10, { jobId: "j1", printerId: "pr1", status: "BASILIYOR" }));
    expect(outlet(s).queues.print).toEqual({ KUYRUKTA: 0, BASILIYOR: 1, HATA: 0 });
    // mail: same event id twice counts once
    const m = ev("mail.failed", T0, { kind: "RAPOR", id: "mf1" });
    expect(reduce(reduce(fresh(), m), m).mailFailed).toBe(1);
  });

  it("bilinmeyen masa/oda -> needsRefresh, durum ayni, firlatma yok; baska otel yok sayilir", () => {
    const f = fresh();
    let s = reduce(f, orderStatus(T0, "x", "yok", "GONDERILDI"));
    expect(s.needsRefresh.has("table:yok")).toBe(true);
    expect(s.layers).toBe(f.layers);
    s = reduce(f, ev("room.checked", T0, { roomId: "yok", checkType: "ACIK" }));
    expect(s.needsRefresh.has("room:yok")).toBe(true);
    const other = { ...orderStatus(T0, "x", "t1", "GONDERILDI"), hotelId: "baska" } as never;
    expect(reduce(f, other)).toBe(f);
  });

  it("girdi nesnesi degismez (derin dondurulmus)", () => {
    const f = fresh();
    expect(() => applyEvents(f, [orderStatus(T0, "x", "t1", "GONDERILDI"), ev("call.opened", T0 + 1, { callId: "c", tableId: "t1", callType: "HESAP" })])).not.toThrow();
    expect(table(f, "t1").orders).toHaveLength(0);
    expect(f.layers.order).toBeDefined();
    expect(H).toBe("h1");
  });
});
