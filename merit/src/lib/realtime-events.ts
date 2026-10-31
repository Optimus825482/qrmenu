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

/** Event type names are written into SSE `event:` lines, so they are restricted to a safe alphabet. */
export const EVENT_TYPE_RE = /^[\w.:-]{1,64}$/;

/** Event types the shell listens to by default. Later modules append their own. */
export const SSE_EVENT_TYPES: readonly string[] = [
  "notification.created",
  "settings.changed",
  "session.closed",
  "definition.changed",
  "session.changed",
  "audit.created",
  "realtime.resync",
  "reconnect",
  // P5: QR menu and ordering
  "menu.availability",
  "menu.changed",
  "price.display",
  "ordering.changed",
  "order.created",
  "order.approved",
  "order.rejected",
  "order.prep",
  "order.ready",
  "order.served",
  "order.cancelled",
  "order.escalated",
  "call.created",
  "call.resolved",
  "assignment.changed",
  "print.queued",
  "print.printed",
  "print.failed",
  "printer.status",
  "scan.table",
];

/** Event types a guest (QR menu visitor) stream may carry. */
export const GUEST_EVENT_TYPES: readonly string[] = [
  "menu.availability",
  "menu.changed",
  "price.display",
  "ordering.changed",
  "order.approved",
  "order.rejected",
  "order.prep",
  "order.ready",
  "order.served",
  "order.cancelled",
  "call.resolved",
];
