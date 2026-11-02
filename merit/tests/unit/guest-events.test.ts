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

  it("misafir olmayan tipler elenir", () => {
    expect(filter(ev({ type: "order.created", outletId: "o1", payload: { orderId: "ord1" } }))).toBe(false);
    expect(filter(ev({ type: "notification.created", outletId: "o1" }))).toBe(false);
    expect(filter(ev({ type: "scan.table", outletId: "o1" }))).toBe(false);
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
  it("order dışı olaylara dokunmaz", () => {
    const e = { type: "menu.changed", at: "x", payload: { a: 1 } } as MeritEvent;
    expect(sanitizeGuestEvent(e)).toBe(e);
  });
});
