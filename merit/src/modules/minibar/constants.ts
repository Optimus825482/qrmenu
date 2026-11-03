import type { GuestRecordKind, TaskType } from "@/generated/prisma/client";

/** The three occupancy files a hotel uploads every day, in display order (= GuestRecordKind). */
export const UPLOAD_KINDS = ["IN_HOUSE", "ARRIVAL", "DEPARTURE"] as const satisfies readonly GuestRecordKind[];

export const TASK_TYPE_FOR_KIND: Record<GuestRecordKind, TaskType> = {
  IN_HOUSE: "INHOUSE_KONTROL",
  ARRIVAL: "ARRIVAL_KONTROL",
  DEPARTURE: "DEPARTURE_KONTROL",
};

export const KIND_LABEL_TR: Record<GuestRecordKind, string> = {
  IN_HOUSE: "In House",
  ARRIVAL: "Arrivals",
  DEPARTURE: "Departures",
};

/** A second DND mark on the same room within this many seconds is ignored (double tap). */
export const DND_MIN_GAP_SECONDS = 30;
/** Two arrivals/departures closer than this on the same room are a critical clash (priority plan). */
export const CLASH_CRITICAL_MINUTES = 180;
/** Priority plan: a room should be checked this long before the guest arrives / after departure. */
export const ARRIVAL_LEAD_MINUTES = 15;
export const DEPARTURE_LAG_MINUTES = 60;
/** Times assumed when the occupancy file carries none. */
export const DEFAULT_DEPARTURE_TIME = "12:00";
export const DEFAULT_ARRIVAL_TIME = "14:00";
/** Occupancy upload size limit (.xlsx only). */
export const OCCUPANCY_MAX_BYTES = 10 * 1024 * 1024;
/** UI only: the "+N" quick buttons stop here; the server rule is the setup capacity. */
export const QTY_BUTTON_MAX = 4;
