import type { LogoutReason } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { closeSession, warnSession } from "./sessions";

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

const ACTIVE = ["ONLINE", "UYARI"] as const;

/** Closes each session on its own; one failing row is logged and skipped. Returns how many closed. */
async function closeAll(sessions: { id: string }[], reason: LogoutReason): Promise<number> {
  let closed = 0;
  for (const { id } of sessions) {
    try {
      if (await closeSession(id, reason)) closed++;
    } catch (err) {
      console.error(`[session.sweep] oturum kapatılamadı (${reason})`, id, err);
    }
  }
  return closed;
}

/**
 * One pass over the open sessions (run every minute by the `session.sweep` job):
 *  1. expiresAt <= now          -> closed with SURE_ASIMI
 *  2. lastSeenAt <= now - idle  -> closed with HAREKETSIZLIK (expiry wins when both apply)
 *  3. ONLINE, <= warnMinutes left, not yet warned -> UYARI + WARN event + one notification
 * Closing goes first so a session about to be closed is never warned. A session is warned at
 * most once: the status flip is a conditional update, so overlapping sweeps cannot both win.
 */
export async function sweepSessions(now: Date, deps: SweepDeps): Promise<SweepResult> {
  const expired = await closeAll(
    await prisma.userSession.findMany({
      where: { status: { in: [...ACTIVE] }, expiresAt: { lte: now } },
      select: { id: true },
    }),
    "SURE_ASIMI",
  );

  const idleBefore = new Date(now.getTime() - deps.idleMinutes * MINUTE_MS);
  const idle = await closeAll(
    await prisma.userSession.findMany({
      where: { status: { in: [...ACTIVE] }, lastSeenAt: { lte: idleBefore } },
      select: { id: true },
    }),
    "HAREKETSIZLIK",
  );

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
    const won = await warnSession(s.id, now);
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

  return { warned, expired, idle };
}
