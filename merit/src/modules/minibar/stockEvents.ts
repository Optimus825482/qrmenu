/**
 * Realtime event names of the stock / stock-request flow (published with `publish`).
 * Hand-off: Task 1 adds these strings to `SSE_EVENT_TYPES` (src/lib/realtime-events.ts) and may move
 * them into `events.ts` (owned by another task at the time of writing).
 */
export const MINIBAR_EVENTS = {
  stockChanged: "stock.changed",
  stockRequestCreated: "stockrequest.created",
  stockRequestUpdated: "stockrequest.updated",
} as const;
