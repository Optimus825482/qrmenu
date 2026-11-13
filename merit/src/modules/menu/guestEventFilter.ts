import { GUEST_EVENT_TYPES, type MeritEvent } from "@/lib/realtime-events";

export type GuestStreamScope = {
  /** Absent for a room without a room-service outlet (a MyBar-only stream). */
  outletId?: string;
  hotelId: string;
  orderIds: readonly string[];
  /** Room of a room QR: its own `mybar.*` and requested `order.*` events reach the stream. */
  roomId?: string;
  /** Table of a table QR: its own `call.*` events reach the stream. */
  tableId?: string;
};

/**
 * Which realtime events a guest stream may carry: guest types only; the outlet's own events (or, when
 * an event names no outlet, its hotel's; an event with no hotel is system-wide, e.g. `price.display`
 * from the system setting, and reaches every outlet); `call.resolved` only for the guest's own table (after the outlet/hotel match); `order.*` only for the guest's own orders;
 * order events also require the matching hotel, outlet and table/room of the token; `mybar.*` only for the guest's own room.
 */
export function guestEventFilter(scope: GuestStreamScope): (e: MeritEvent) => boolean {
  return (e) => {
    if (!GUEST_EVENT_TYPES.includes(e.type)) return false;
    if (e.type.startsWith("mybar.")) {
      return scope.roomId !== undefined && e.roomId === scope.roomId && e.hotelId === scope.hotelId;
    }
    if (e.outletId !== undefined) {
      if (scope.outletId === undefined || e.outletId !== scope.outletId) return false;
    } else if (e.hotelId !== undefined && e.hotelId !== scope.hotelId) {
      return false;
    }
    if (e.type === "call.resolved") {
      // Table-scoped only: hotel/outlet were matched above; a room stream or another table never sees it.
      if (e.hotelId !== undefined && e.hotelId !== scope.hotelId) return false;
      const p = e.payload as { tableId?: unknown } | undefined;
      return scope.tableId !== undefined && p?.tableId === scope.tableId;
    }
    if (e.type.startsWith("order.")) {
      const payload = e.payload as { orderId?: unknown; roomId?: unknown; tableId?: unknown } | undefined;
      if (
        scope.tableId !== undefined &&
        (scope.outletId === undefined || e.outletId !== scope.outletId ||
          e.hotelId !== scope.hotelId || payload?.tableId !== scope.tableId)
      ) {
        return false;
      }
      if (
        scope.roomId !== undefined &&
        (scope.outletId === undefined || e.outletId !== scope.outletId ||
          e.hotelId !== scope.hotelId || (e.roomId ?? payload?.roomId) !== scope.roomId)
      ) {
        return false;
      }
      const orderId = payload?.orderId;
      return typeof orderId === "string" && scope.orderIds.includes(orderId);
    }
    return true;
  };
}

/** Same generic text as the guest order view (guestOrder.ts): staff-typed reasons never reach the guest. */
const GUEST_REJECT_TEXT = "Siparişiniz işleme alınamadı. Ayrıntı için lütfen görevlimize danışın.";

/** Payload fields of an `order.*` event a guest may see; everything else (staff ids, notes ...) is dropped. */
const GUEST_ORDER_FIELDS = [
  "orderId", "orderNo", "status", "tableId", "roomId", "from", "kind",
] as const;

/**
 * Guest delivery sanitiser: `order.*` payloads are reduced to a white list (staff `byUserId` etc. never
 * reach the guest). Returns a copy; the shared event is untouched. Applied in the guest events route,
 * not in the shared `publish`.
 */
export function sanitizeGuestEvent(e: MeritEvent): MeritEvent {
  if (e.type.startsWith("mybar.")) {
    // Only the request id: no staff ids, wait times or closing flags; the page re-reads its own status.
    const requestId = (e.payload as { requestId?: unknown } | undefined)?.requestId;
    return { ...e, payload: typeof requestId === "string" ? { requestId } : {} };
  }
  if (e.type === "call.resolved") {
    const src = (typeof e.payload === "object" && e.payload !== null ? e.payload : {}) as Record<string, unknown>;
    return {
      ...e,
      payload: {
        tableId: src.tableId,
        status: src.status,
        waiterName: typeof src.waiterName === "string" ? src.waiterName : undefined,
      },
    };
  }
  if (!e.type.startsWith("order.")) return e;
  const src = (typeof e.payload === "object" && e.payload !== null ? e.payload : {}) as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const k of GUEST_ORDER_FIELDS) if (src[k] !== undefined) payload[k] = src[k];
  if (src.rejectReason || src.cancelReason) payload.rejectReason = GUEST_REJECT_TEXT;
  return { ...e, payload };
}
