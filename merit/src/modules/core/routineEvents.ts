import type { RoutineAuto } from "./screenGuide";

/**
 * Realtime event types that can flip an automatic routine item (client-safe: the card subscribes
 * to the union of the kinds it shows and reloads on any of them).
 */
export const ROUTINE_REFRESH_EVENTS: Record<RoutineAuto, readonly string[]> = {
  queueEmpty: ["order.created", "order.approved", "order.rejected", "order.cancelled"],
  printerOk: ["printer.status", "print.failed", "print.printed"],
  mybarAllSeen: ["mybar.created", "mybar.seen", "mybar.completed", "mybar.cancelled"],
  dndOpenZero: ["dnd.marked", "dnd.completed", "dnd.missed"],
  tasksDone: ["task.updated", "task.generated", "roomcheck.done"],
  uploadsDone: ["occupancy.uploaded"],
};

/** Safety net when no event arrives (a dropped stream, a clock-driven change such as a printer going quiet). */
export const ROUTINE_POLL_MS = 60_000;
