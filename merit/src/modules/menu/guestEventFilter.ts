import { GUEST_EVENT_TYPES, type MeritEvent } from "@/lib/realtime-events";

export type GuestStreamScope = { outletId: string; hotelId: string; orderIds: readonly string[] };

/**
 * Which realtime events a guest stream may carry: guest types only; the outlet's own events (or, when
 * an event names no outlet, its hotel's; an event with no hotel is system-wide, e.g. `price.display`
 * from the system setting, and reaches every outlet); `order.*` only for the guest's own orders.
 */
export function guestEventFilter(scope: GuestStreamScope): (e: MeritEvent) => boolean {
  return (e) => {
    if (!GUEST_EVENT_TYPES.includes(e.type)) return false;
    if (e.outletId !== undefined) {
      if (e.outletId !== scope.outletId) return false;
    } else if (e.hotelId !== undefined && e.hotelId !== scope.hotelId) {
      return false;
    }
    if (e.type.startsWith("order.")) {
      const orderId = (e.payload as { orderId?: unknown } | undefined)?.orderId;
      return typeof orderId === "string" && scope.orderIds.includes(orderId);
    }
    return true;
  };
}
