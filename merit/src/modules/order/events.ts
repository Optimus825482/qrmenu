/** Realtime event types of the QR order module. */
export const ORDER_EVENTS = [
  "order.created",
  "order.approved",
  "order.rejected",
  "order.prep",
  "order.ready",
  "order.served",
  "order.cancelled",
  "order.escalated",
] as const;
export type OrderEventType = (typeof ORDER_EVENTS)[number];
