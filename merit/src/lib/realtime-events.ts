// Client-safe: shared by the server (lib/realtime.ts, which imports pg) and the browser (useSse).
// Keep this file free of server imports.
import type { RoleKind } from "@/generated/prisma/client";

export type MeritEvent = {
  type: string;
  hotelId?: string;
  outletId?: string;
  roomId?: string;
  userIds?: string[];
  roleKinds?: RoleKind[];
  payload?: unknown;
  /** Set when `payload` was dropped to fit pg_notify's 8000-byte limit; refetch instead. */
  payloadTruncated?: boolean;
  at: string;
};

export const REALTIME_CHANNEL = "merit_events";

/** Event types the shell listens to by default. Later modules append their own. */
export const SSE_EVENT_TYPES: readonly string[] = [
  "notification.created",
  "settings.changed",
];
