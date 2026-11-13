/**
 * Prisma-free SLA constants and pure helpers: safe to import from client components (SlaTimer) and
 * server code alike. `sla.ts` re-exports everything here.
 */
import type { OrderStatus } from "@/generated/prisma/client";

/** Share of `rs.slaMinutes` after which an order is warned. */
export const SLA_WARN_RATIO = 0.8;

/**
 * Room-service orders the radar shows as open: everything still in progress. GONDERILDI is in
 * (the SLA sweep times it).
 */
export const RADAR_ROOM_OPEN_STATUSES: readonly OrderStatus[] = ["GONDERILDI", "ONAYLANDI", "HAZIR", "YOLDA"];

/** Display/report state of a room-service order against its SLA. */
export type SlaState = "OK" | "WARN" | "BREACH" | "DONE_ON_TIME" | "DONE_LATE" | "CANCELLED";

/** SLA clock start (single source of truth): the order's creation time. */
export function slaStart(o: { createdAt: Date }): Date {
  return o.createdAt;
}

/** Instant the SLA is breached: `slaStart + slaMinutes`. */
export function slaDue(o: { createdAt: Date }, slaMinutes: number): Date {
  return new Date(slaStart(o).getTime() + slaMinutes * 60_000);
}

/**
 * SLA state at `now`. Open orders: elapsed >= 100 % BREACH, >= 80 % WARN (same boundaries as the
 * sweep), else OK. Delivered: on time when it took strictly less than the SLA. IPTAL/REDDEDILDI: CANCELLED.
 */
export function slaStateOf(
  o: { status: OrderStatus; createdAt: Date; deliveredAt: Date | null },
  now: Date,
  slaMinutes: number,
): SlaState {
  if (o.status === "IPTAL" || o.status === "REDDEDILDI") return "CANCELLED";
  const startMs = slaStart(o).getTime();
  const limitMs = slaMinutes * 60_000;
  if (o.status === "TESLIM_EDILDI") {
    const endMs = (o.deliveredAt ?? now).getTime();
    return endMs - startMs < limitMs ? "DONE_ON_TIME" : "DONE_LATE";
  }
  const elapsed = now.getTime() - startMs;
  if (elapsed >= limitMs) return "BREACH";
  return elapsed >= limitMs * SLA_WARN_RATIO ? "WARN" : "OK";
}
