/**
 * Realtime event types of the minibar module (published with `publish`, registered in
 * `src/lib/realtime-events.ts › SSE_EVENT_TYPES`). Every event carries `hotelId`. Payload contracts:
 *  - stock.changed      { productId, remainingQty, status }
 *  - stock.critical     { productId, productName, remainingQty, criticalLevel }   (roleKinds SISTEM, YONETIM, MINIBAR)
 *  - roomcheck.done     { roomId, kind: "IKAME" | "SARFIYAT_YOK", userId }
 *  - dnd.*              { roomId, roomNumber, count, required, status }
 *  - task.updated       { taskIds, roomIds, day }
 *  - task.generated     { day, added }
 *  - occupancy.uploaded { kind, code, okRows, errorRows }  (+ uploadId)
 *  - occupancy.missing  { date, missingKinds, slot }
 *  - stockrequest.*     { id, status }
 * `scan.room` is a P5 event and already registered there.
 */
export const STOCK_CHANGED = "stock.changed";
export const STOCK_CRITICAL = "stock.critical";
export const STOCKREQUEST_CREATED = "stockrequest.created";
export const STOCKREQUEST_UPDATED = "stockrequest.updated";
export const ROOMCHECK_DONE = "roomcheck.done";
export const DND_MARKED = "dnd.marked";
export const DND_COMPLETED = "dnd.completed";
export const DND_REMINDER = "dnd.reminder";
export const DND_MISSED = "dnd.missed";
export const TASK_GENERATED = "task.generated";
export const TASK_UPDATED = "task.updated";
export const OCCUPANCY_UPLOADED = "occupancy.uploaded";
export const OCCUPANCY_MISSING = "occupancy.missing";

export const MINIBAR_EVENTS = [
  STOCK_CHANGED,
  STOCK_CRITICAL,
  STOCKREQUEST_CREATED,
  STOCKREQUEST_UPDATED,
  ROOMCHECK_DONE,
  DND_MARKED,
  DND_COMPLETED,
  DND_REMINDER,
  DND_MISSED,
  TASK_GENERATED,
  TASK_UPDATED,
  OCCUPANCY_UPLOADED,
  OCCUPANCY_MISSING,
] as const;
