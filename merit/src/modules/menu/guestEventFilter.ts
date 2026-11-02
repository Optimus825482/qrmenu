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

/** Payload fields of an `order.*` event a guest may see; everything else (staff ids, notes ...) is dropped. */
const GUEST_ORDER_FIELDS = [
  "orderId", "orderNo", "status", "rejectReason", "cancelReason", "tableId", "roomId", "from", "kind",
] as const;

/**
 * Guest delivery sanitiser: `order.*` payloads are reduced to a white list (staff `byUserId` etc. never
 * reach the guest). Returns a copy; the shared event is untouched. Applied in the guest events route,
 * not in the shared `publish`.
 */
export function sanitizeGuestEvent(e: MeritEvent): MeritEvent {
  if (!e.type.startsWith("order.")) return e;
  const src = (typeof e.payload === "object" && e.payload !== null ? e.payload : {}) as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const k of GUEST_ORDER_FIELDS) if (src[k] !== undefined) payload[k] = src[k];
  return { ...e, payload };
}
