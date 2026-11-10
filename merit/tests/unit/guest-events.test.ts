import { describe, expect, it } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { guestEventFilter, sanitizeGuestEvent } from "@/modules/menu/guestEventFilter";

const at = new Date().toISOString();
const ev = (e: Partial<MeritEvent> & { type: string }): MeritEvent => ({ at, ...e });
const filter = guestEventFilter({ outletId: "o1", hotelId: "h1", orderIds: ["ord1"] });

describe("guestEventFilter", () => {
  it("yalnız kendi outletinin menü olaylarını geçirir", () => {
    expect(filter(ev({ type: "menu.availability", hotelId: "h1", outletId: "o1" }))).toBe(true);
    expect(filter(ev({ type: "menu.availability", hotelId: "h1", outletId: "o2" }))).toBe(false);
    expect(filter(ev({ type: "ordering.changed", hotelId: "h1", outletId: "o1" }))).toBe(true);
  });

  it("hotelId'siz (sistem kapsamlı) price.display tüm outletlere; otel kapsamlısı yalnız kendi oteline", () => {
    expect(filter(ev({ type: "price.display" }))).toBe(true);
    expect(filter(ev({ type: "price.display", hotelId: "h1" }))).toBe(true);
    expect(filter(ev({ type: "price.display", hotelId: "h2" }))).toBe(false);
    expect(filter(ev({ type: "price.display", hotelId: "h1", outletId: "o2" }))).toBe(false);
  });

  it("SEC-9: call.resolved yalnız aynı otel/outlet ve aynı masa akışına gider", () => {
    const table = guestEventFilter({ outletId: "o1", hotelId: "h1", tableId: "t1", orderIds: [] });
    const call = (over: Partial<MeritEvent> = {}, tableId = "t1") =>
      ev({ type: "call.resolved", hotelId: "h1", outletId: "o1", payload: { tableId, status: "YANITLANDI" }, ...over });
    expect(table(call())).toBe(true);
    expect(table(call({}, "t2"))).toBe(false);
    expect(table(call({ outletId: "o2" }))).toBe(false);
    expect(table(call({ hotelId: "h2" }))).toBe(false);
    expect(table(ev({ type: "call.resolved", hotelId: "h1", outletId: "o1" }))).toBe(false);
    // Outlet-wide (no table) and room streams never get it.
    expect(filter(call())).toBe(false);
    expect(guestEventFilter({ outletId: "o1", hotelId: "h1", roomId: "r1", orderIds: [] })(call())).toBe(false);
  });

  it("misafir olmayan tipler elenir", () => {
    expect(filter(ev({ type: "order.created", outletId: "o1", payload: { orderId: "ord1" } }))).toBe(false);
    expect(filter(ev({ type: "notification.created", outletId: "o1" }))).toBe(false);
    expect(filter(ev({ type: "scan.table", outletId: "o1" }))).toBe(false);
  });

  it("oda akışındaki sipariş olayı oda, outlet, otel ve istenen sipariş kimliğine uymalıdır", () => {
    const scope = { outletId: "o1", hotelId: "h1", roomId: "r1", orderIds: ["ord1", "ord2"] };
    const roomFilter = guestEventFilter(scope);
    const onway = ev({
      type: "order.onway", outletId: "o1", hotelId: "h1",
      payload: { orderId: "ord1", roomId: "r1" },
    });

    expect(roomFilter(onway)).toBe(true);
    expect(roomFilter({ ...onway, roomId: "r1", payload: { orderId: "ord1" } })).toBe(true);
    expect(roomFilter({ ...onway, payload: { orderId: "ord2", roomId: "r2" } })).toBe(false);
    expect(roomFilter({ ...onway, payload: { orderId: "ord1" } })).toBe(false);
    expect(roomFilter({ ...onway, roomId: "r2" })).toBe(false);
    expect(roomFilter({ ...onway, payload: { orderId: "ord3", roomId: "r1" } })).toBe(false);
    expect(roomFilter({ ...onway, outletId: "o2" })).toBe(false);
    expect(roomFilter({ ...onway, hotelId: "h2" })).toBe(false);
    expect(roomFilter({ ...onway, outletId: undefined })).toBe(false);
    expect(roomFilter({ ...onway, hotelId: undefined })).toBe(false);
    expect(guestEventFilter({ ...scope, outletId: undefined })(onway)).toBe(false);
  });

  it("order.* yalnız verilen orderIds için", () => {
    expect(filter(ev({ type: "order.approved", outletId: "o1", payload: { orderId: "ord1" } }))).toBe(true);
    expect(filter(ev({ type: "order.approved", outletId: "o1", payload: { orderId: "ord2" } }))).toBe(false);
    expect(filter(ev({ type: "order.ready", outletId: "o1" }))).toBe(false);
    expect(filter(ev({ type: "order.ready", outletId: "o2", payload: { orderId: "ord1" } }))).toBe(false);
  });
});

describe("sanitizeGuestEvent", () => {
  it("order.* payload beyaz listeye iner: byUserId ve diğerleri düşer", () => {
    const e = {
      type: "order.approved", hotelId: "h", outletId: "o", at: "2026-11-03T10:00:00.000Z",
      payload: { orderId: "x", orderNo: 5, status: "ONAYLANDI", from: "GONDERILDI", kind: "MASA", tableId: "t",
        byUserId: "staff1", note: "gizli", assignedWaiterId: "u2" },
    } as MeritEvent;
    const out = sanitizeGuestEvent(e);
    expect(out.payload).toEqual({ orderId: "x", orderNo: 5, status: "ONAYLANDI", from: "GONDERILDI", kind: "MASA", tableId: "t" });
    expect((e.payload as { byUserId?: string }).byUserId).toBe("staff1");
  });
  it("personelin yazdığı ret/iptal gerekçesi misafire ham gitmez, genel metne döner", () => {
    const mk = (payload: Record<string, unknown>) =>
      sanitizeGuestEvent({ type: "order.rejected", hotelId: "h", outletId: "o", at: "x", payload } as MeritEvent).payload as Record<string, unknown>;
    const rejected = mk({ orderId: "x", status: "REDDEDILDI", rejectReason: "Misafir kara listede" });
    expect(rejected.rejectReason).toBe("Siparişiniz işleme alınamadı. Ayrıntı için lütfen görevlimize danışın.");
    expect(JSON.stringify(rejected)).not.toContain("kara liste");
    const cancelled = mk({ orderId: "x", status: "IPTAL", cancelReason: "Garson hatası" });
    expect(cancelled.cancelReason).toBeUndefined();
    expect(JSON.stringify(cancelled)).not.toContain("Garson hatası");
    expect(cancelled.rejectReason).toBeDefined();
    expect(mk({ orderId: "x", status: "ONAYLANDI" }).rejectReason).toBeUndefined();
  });
  it("order dışı olaylara dokunmaz", () => {
    const e = { type: "menu.changed", at: "x", payload: { a: 1 } } as MeritEvent;
    expect(sanitizeGuestEvent(e)).toBe(e);
  });
});
