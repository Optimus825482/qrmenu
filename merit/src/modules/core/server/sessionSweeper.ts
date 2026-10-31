import { prisma } from "@/lib/prisma";
import { closeSession } from "./sessions";

const MINUTE_MS = 60_000;

export type Notifier = (userId: string, title: string, body: string) => Promise<void>;

export type SweepDeps = {
  /** Warn when this many minutes (or fewer) remain until expiresAt. */
  warnMinutes: number;
  /** Close a session whose lastSeenAt is this many minutes (or more) old. */
  idleMinutes: number;
  notifier: Notifier;
};

export type SweepResult = { warned: number; expired: number; idle: number };

/**
 * No-op notifier used until the notification service exists. Task 8 replaces it with the real
 * `notify` in lib/jobs.ts; sweepSessions itself only ever sees the injected function.
 */
export const placeholderNotifier: Notifier = async () => {};

const ACTIVE = ["ONLINE", "UYARI"] as const;

/**
 * One pass over the open sessions (run every minute by the `session.sweep` job):
 *  1. expiresAt <= now          -> closed with SURE_ASIMI
 *  2. lastSeenAt <= now - idle  -> closed with HAREKETSIZLIK (expiry wins when both apply)
 *  3. ONLINE, <= warnMinutes left, not yet warned -> UYARI + WARN event + one notification
 * Closing goes first so a session about to be closed is never warned. A session is warned at
 * most once: the status flip is a conditional update, so overlapping sweeps cannot both win.
 */
export async function sweepSessions(now: Date, deps: SweepDeps): Promise<SweepResult> {
  const expired = await prisma.userSession.findMany({
    where: { status: { in: [...ACTIVE] }, expiresAt: { lte: now } },
    select: { id: true },
  });
  for (const { id } of expired) await closeSession(id, "SURE_ASIMI");

  const idleBefore = new Date(now.getTime() - deps.idleMinutes * MINUTE_MS);
  const idle = await prisma.userSession.findMany({
    where: { status: { in: [...ACTIVE] }, lastSeenAt: { lte: idleBefore } },
    select: { id: true },
  });
  for (const { id } of idle) await closeSession(id, "HAREKETSIZLIK");

  const candidates = await prisma.userSession.findMany({
    where: {
      status: "ONLINE",
      warnedAt: null,
      expiresAt: { gt: now, lte: new Date(now.getTime() + deps.warnMinutes * MINUTE_MS) },
    },
    select: { id: true, userId: true, expiresAt: true },
  });

  let warned = 0;
  for (const s of candidates) {
    const won = await prisma.$transaction(async (tx) => {
      const { count } = await tx.userSession.updateMany({
        where: { id: s.id, status: "ONLINE", warnedAt: null },
        data: { status: "UYARI", warnedAt: now },
      });
      if (count === 0) return false;
      await tx.sessionEvent.create({ data: { sessionId: s.id, event: "WARN" } });
      return true;
    });
    if (!won) continue;
    warned++;

    const minutes = Math.ceil((s.expiresAt.getTime() - now.getTime()) / MINUTE_MS);
    try {
      await deps.notifier(
        s.userId,
        "Oturum süreniz bitiyor",
        `Oturumunuz ${minutes} dakika içinde kapanacak`,
      );
    } catch (err) {
      // The session is already UYARI; a failed notification must not stop the sweep.
      console.error("[session.sweep] uyarı bildirimi gönderilemedi", s.id, err);
    }
  }

  return { warned, expired: expired.length, idle: idle.length };
}
