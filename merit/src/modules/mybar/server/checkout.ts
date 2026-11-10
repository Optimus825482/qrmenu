import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { businessDate, businessDateStart, businessDay } from "@/lib/time";
import { DEFAULT_ARRIVAL_TIME, DEFAULT_DEPARTURE_TIME } from "@/modules/minibar/constants";
import { addDays, nicosiaInstant } from "@/modules/minibar/server/dates";
import { applyCancel, loadRequestForUpdate } from "./requests";

/*
 * Guest checkout -> the room's open MyBar requests are cancelled by the system, so a room handed to a new guest
 * (same day included) neither shows nor serves the previous guest's request. There is no PMS: checkout is read
 * from the occupancy uploads, and only from uploads without row errors (status TAMAMLANDI, errorRows 0).
 *
 *  - DEPARTURE: the room's DEPARTURE record of today (or yesterday, catch-up after downtime) once its departure
 *    time (Dep.Time, else DEFAULT_DEPARTURE_TIME) has passed. The record is a plan made at upload time, so the
 *    cancel waits for that instant. Not when a newer IN_HOUSE upload shows the same stay going on past it.
 *  - NEW_STAY: the room's current IN_HOUSE / ARRIVAL stay (covers today) began on a later day than the request;
 *    a stay arriving today counts once its arrival time (Arr.Time, else DEFAULT_ARRIVAL_TIME) has passed.
 *
 * "Open" is BEKLEMEDE (seen or not; partly delivered or not). TAMAMLANDI / IPTAL never change.
 */

export const CHECKOUT_CANCEL_REASON = "Misafir çıkış yaptı; talep sistem tarafından otomatik iptal edildi.";
export const CHECKOUT_CANCEL_AUDIT = "MYBAR_CHECKOUT_CANCEL";

export type CheckoutSource = "DEPARTURE" | "NEW_STAY";
/** Requests created before `at` belong to a stay that has ended. */
export type CheckoutBoundary = { at: Date; source: CheckoutSource };

type Reader = Pick<Prisma.TransactionClient, "guestRecord">;

const dayStr = (d: Date): string => d.toISOString().slice(0, 10);
const instant = (day: string, time: string | null, fallback: string): Date =>
  (time ? nicosiaInstant(day, time) : null) ?? nicosiaInstant(day, fallback)!;

/** The latest stay boundary of each room at `now` (rooms without a known checkout are absent). */
export async function checkoutBoundaries(
  db: Reader,
  roomIds: string[],
  now: Date,
): Promise<Map<string, CheckoutBoundary>> {
  const out = new Map<string, CheckoutBoundary>();
  const ids = [...new Set(roomIds)];
  if (ids.length === 0) return out;
  const today = businessDate(now);
  const todayDate = businessDay(today);
  const records = await db.guestRecord.findMany({
    where: {
      roomId: { in: ids },
      upload: { is: { status: "TAMAMLANDI", errorRows: 0 } },
      OR: [
        { kind: "DEPARTURE", departureDate: { gte: businessDay(addDays(today, -1)), lte: todayDate } },
        { kind: { in: ["IN_HOUSE", "ARRIVAL"] }, arrivalDate: { lte: todayDate }, departureDate: { gte: todayDate } },
      ],
    },
    select: {
      roomId: true,
      kind: true,
      arrivalDate: true,
      arrivalTime: true,
      departureDate: true,
      departureTime: true,
      upload: { select: { createdAt: true } },
    },
  });

  const byRoom = new Map<string, typeof records>();
  for (const r of records) byRoom.set(r.roomId, [...(byRoom.get(r.roomId) ?? []), r]);

  for (const [roomId, recs] of byRoom) {
    let best: CheckoutBoundary | null = null;
    const consider = (b: CheckoutBoundary) => {
      if (!best || b.at.getTime() > best.at.getTime()) best = b;
    };
    const stays = recs.filter((r) => r.kind !== "DEPARTURE");
    for (const d of recs.filter((r) => r.kind === "DEPARTURE")) {
      const at = instant(dayStr(d.departureDate), d.departureTime, DEFAULT_DEPARTURE_TIME);
      if (now.getTime() < at.getTime()) continue;
      // Same stay (same arrival) reported later as staying past this departure: extended, not checked out.
      const extended = stays.some(
        (r) =>
          r.kind === "IN_HOUSE" &&
          r.arrivalDate.getTime() === d.arrivalDate.getTime() &&
          r.departureDate.getTime() > d.departureDate.getTime() &&
          (r.upload?.createdAt.getTime() ?? 0) > (d.upload?.createdAt.getTime() ?? 0),
      );
      if (!extended) consider({ at, source: "DEPARTURE" });
    }
    for (const r of stays) {
      const arrival = dayStr(r.arrivalDate);
      if (arrival === today && now.getTime() < instant(today, r.arrivalTime, DEFAULT_ARRIVAL_TIME).getTime()) continue;
      consider({ at: businessDateStart(arrival), source: "NEW_STAY" });
    }
    if (best) out.set(roomId, best);
  }
  return out;
}

/**
 * Cancels the open (BEKLEMEDE) requests of `roomIds` created before `before`, as the system, with the shared
 * cancel rule (`applyCancel`: partly delivered lines go back to the pool as IADE). Rows are locked in id order and
 * re-checked, so a concurrent staff action or a second run cancels nothing twice. Staff screens update through
 * the regular `mybar.cancelled` event; no new notification is sent (open ones are marked read).
 * Returns the cancelled request ids.
 */
export async function cancelPendingOnCheckout(
  tx: Prisma.TransactionClient,
  opts: {
    hotelId: string;
    roomIds: string[];
    before: Date;
    now: Date;
    source: CheckoutSource;
    reason?: string;
  },
): Promise<string[]> {
  if (opts.roomIds.length === 0) return [];
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM mybar_requests
    WHERE hotel_id = ${opts.hotelId} AND room_id = ANY(${opts.roomIds}) AND status = 'BEKLEMEDE'
      AND created_at < ${opts.before}
    ORDER BY id
    FOR UPDATE`;
  const cancelled: string[] = [];
  for (const { id } of locked) {
    const req = await loadRequestForUpdate(tx, id);
    if (req.status !== "BEKLEMEDE") continue;
    await applyCancel(tx, req, {
      actorId: null,
      reason: opts.reason ?? CHECKOUT_CANCEL_REASON,
      now: opts.now,
      auditAction: CHECKOUT_CANCEL_AUDIT,
      auditAfter: { system: true, source: opts.source, boundary: opts.before.toISOString() },
      notificationTypes: ["mybar.created", "mybar.stale"],
    });
    cancelled.push(id);
  }
  return cancelled;
}

/**
 * Applies the checkout rule to every open request (optionally of one hotel): one transaction per room whose
 * boundary is later than its oldest open request. Idempotent; run every minute and right after an occupancy
 * upload. A failing room is logged and the others still run. Returns the number of cancelled requests.
 */
export async function mybarCheckoutSweep(now: Date = new Date(), opts: { hotelId?: string } = {}): Promise<number> {
  const pending = await prisma.mybarRequest.findMany({
    where: { status: "BEKLEMEDE", ...(opts.hotelId ? { hotelId: opts.hotelId } : {}) },
    select: { hotelId: true, roomId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });
  const rooms = new Map<string, { hotelId: string; oldest: Date }>();
  for (const p of pending) if (!rooms.has(p.roomId)) rooms.set(p.roomId, { hotelId: p.hotelId, oldest: p.createdAt });
  const bounds = await checkoutBoundaries(prisma, [...rooms.keys()], now);

  let cancelled = 0;
  for (const [roomId, b] of bounds) {
    const room = rooms.get(roomId)!;
    if (room.oldest.getTime() >= b.at.getTime()) continue;
    try {
      const ids = await prisma.$transaction((tx) =>
        cancelPendingOnCheckout(tx, { hotelId: room.hotelId, roomIds: [roomId], before: b.at, now, source: b.source }),
      );
      cancelled += ids.length;
    } catch (error) {
      console.error("[mybar.checkout] oda iptali başarısız", { roomId, error });
    }
  }
  return cancelled;
}
