// Client-safe: which realtime events change the radar KPI numbers, and the refresh cadence. `useRadarKpi` (T11)
// subscribes to `KPI_EVENT_TYPES` and refetches (debounced); `KPI_FALLBACK_MS` is the safety net when SSE is silent.
import { RADAR_EVENT_TYPES } from "@/modules/radar/events";

/** Fallback poll when no event arrives (SSE down, or a change that publishes no event). */
export const KPI_FALLBACK_MS = 60_000;
/** Events arriving within this window collapse into one refresh. */
export const KPI_DEBOUNCE_MS = 1_000;

/** Radar events that cannot move a counter (scans, heartbeats). */
const NO_EFFECT = new Set(["scan.table", "scan.room", "presence.tick"]);

/** Stock-request and MyBar-fulfil events are not radar events but move `stockRequestsOpen` / `mybarPending` / `mybarApproved`. */
const EXTRA = ["stockrequest.created", "stockrequest.updated", "mybar.fulfilled"];

export const KPI_EVENT_TYPES: readonly string[] = [
  ...new Set([...RADAR_EVENT_TYPES.filter((t) => !NO_EFFECT.has(t)), ...EXTRA]),
];

const SET = new Set(KPI_EVENT_TYPES);

/** Whether an SSE event of this type should refresh the KPIs. */
export const affectsKpi = (type: string): boolean => SET.has(type);
