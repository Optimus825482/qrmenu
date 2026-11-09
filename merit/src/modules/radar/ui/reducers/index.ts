import { compareRadarEvents } from "../../events";
import type { RadarEvent } from "../../types";
import type { RadarState } from "../../state";
import {
  reduceCall,
  reduceOrderEscalated,
  reduceOrderStatus,
  reduceOutletOrdering,
  reducePrinterHealth,
  reducePrintJob,
  reduceTableAssigned,
  reduceTableCleared,
  reduceTableScanned,
} from "./order";
import {
  reduceDndMarked,
  reduceDndMissed,
  reduceMybar,
  reduceRoomChecked,
  reduceRoomCheckChanged,
  reduceStockLevel,
  reduceTaskGenerated,
  reduceTaskUpdated,
  reduceUploadStatus,
} from "./minibar";
import { reduceOrderSla } from "./roomService";
import { reducePresence } from "./staff";
import { reduceMailFailed } from "./system";

/** Pure `(state, event) => state`; unchanged state keeps its identity. Never throws. */
export function reduce(state: RadarState, e: RadarEvent): RadarState {
  if (e.hotelId !== state.hotelId) return state;
  switch (e.type) {
    case "order.status":
      return reduceOrderStatus(state, e);
    case "order.escalated":
      return reduceOrderEscalated(state, e);
    case "order.sla":
      return reduceOrderSla(state, e);
    case "call.opened":
    case "call.closed":
      return reduceCall(state, e);
    case "table.scanned":
      return reduceTableScanned(state, e);
    case "table.cleared":
      return reduceTableCleared(state, e);
    case "table.assigned":
      return reduceTableAssigned(state, e);
    case "print.job":
      return reducePrintJob(state, e);
    case "printer.health":
      return reducePrinterHealth(state, e);
    case "outlet.ordering":
      return reduceOutletOrdering(state, e);
    case "room.checked":
      return reduceRoomChecked(state, e);
    case "room.check.changed":
      return reduceRoomCheckChanged(state, e);
    case "room.scanned":
      return state;
    case "dnd.marked":
      return reduceDndMarked(state, e);
    case "dnd.missed":
      return reduceDndMissed(state, e);
    case "mybar.opened":
    case "mybar.seen":
    case "mybar.closed":
      return reduceMybar(state, e);
    case "task.updated":
      return reduceTaskUpdated(state, e);
    case "task.generated":
      return reduceTaskGenerated(state);
    case "stock.level":
      return reduceStockLevel(state, e);
    case "upload.status":
      return reduceUploadStatus(state, e);
    case "presence":
      return reducePresence(state, e);
    case "mail.failed":
      return reduceMailFailed(state, e);
    default:
      return state;
  }
}

/** Applies events in the given order. */
export function applyEvents(state: RadarState, events: readonly RadarEvent[]): RadarState {
  let cur = state;
  for (const e of events) cur = reduce(cur, e);
  return cur;
}

/** Sorts with the shared total order, then applies. */
export function applyOrdered(state: RadarState, events: readonly RadarEvent[]): RadarState {
  return applyEvents(state, [...events].sort(compareRadarEvents));
}
