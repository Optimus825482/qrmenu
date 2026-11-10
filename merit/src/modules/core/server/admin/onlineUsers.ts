import type { Prisma, RoleKind, SessionStatus } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, assertCan } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDateStart } from "@/lib/time";
import { audit } from "@/modules/core/server/audit";
import { closeSession } from "@/modules/core/server/sessions";

const SCREEN = "CR-ONL";
const MINUTE_MS = 60_000;
const ACTIVE: SessionStatus[] = ["ONLINE", "UYARI"];
/** Closures the "today" counter treats as automatic (not a person signing out or being forced). */
const AUTO_REASONS = ["SURE_ASIMI", "HAREKETSIZLIK"] as const;

const isSystem = (ctx: Ctx) => ctx.user.roleKind === "SISTEM";

/** Records the attempt (audit failures never mask the denial) and refuses. */
async function deny(ctx: Ctx, message: string, detail: Record<string, unknown>): Promise<never> {
  try {
    await audit(prisma, {
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
      action: "YETKISIZ_DENEME",
      entity: SCREEN,
      after: detail,
    });
  } catch (error) {
    console.error("onlineUsers: YETKISIZ_DENEME denetim kaydı yazılamadı", { error });
  }
  throw new DomainError("FORBIDDEN", message);
}

/** Session rows whose user or session role is of one of `kinds` (the user's current role counts too). */
const roleKindIn = (kinds: RoleKind[]): Prisma.UserSessionWhereInput => ({
  OR: [{ role: { kind: { in: kinds } } }, { user: { role: { kind: { in: kinds } } } }],
});

export type OnlineStatus = "ONLINE" | "UYARI";

export type OnlineSessionRow = {
  id: string;
  user: { fullName: string; username: string; roleName: string };
  outletName: string | null;
  loginAt: string;
  lastSeenAt: string;
  expiresAt: string;
  remainingMin: number;
  status: OnlineStatus;
};

export type OnlineCounts = {
  total: number;
  online: number;
  warned: number;
  autoLogoutToday: number;
};

export type OnlineList = {
  rows: OnlineSessionRow[];
  counts: OnlineCounts;
  /** CR-ONL approve: force logout and ending idle sessions. Viewers still see the list. */
  canForce: boolean;
};

export type OnlineFilter = {
  outletId?: string;
  status?: OnlineStatus;
};

const rowSelect = {
  id: true,
  loginAt: true,
  lastSeenAt: true,
  expiresAt: true,
  status: true,
  user: { select: { fullName: true, username: true } },
  role: { select: { name: true } },
  outlet: { select: { name: true } },
} as const;

type Listed = Prisma.UserSessionGetPayload<{ select: typeof rowSelect }>;

function toRow(row: Listed, now: number): OnlineSessionRow {
  return {
    id: row.id,
    user: { fullName: row.user.fullName, username: row.user.username, roleName: row.role.name },
    outletName: row.outlet?.name ?? null,
    loginAt: row.loginAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    remainingMin: Math.max(0, Math.floor((row.expiresAt.getTime() - now) / MINUTE_MS)),
    status: row.status === "UYARI" ? "UYARI" : "ONLINE",
  };
}

/**
 * Open sessions of one hotel, plus the counter cards. `status` filters the rows only; the counters
 * stay the hotel (and optional outlet) totals so the cards do not collapse when the grid is filtered.
 */
export async function list(ctx: Ctx, hotelId: string, filter: OnlineFilter = {}): Promise<OnlineList> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const scope: Prisma.UserSessionWhereInput = {
    hotelId,
    ...(filter.outletId ? { outletId: filter.outletId } : {}),
  };
  const dayStart = businessDateStart(businessDate());
  const now = Date.now();
  // Same hierarchy for rows and counters: non-SISTEM callers must not learn that SISTEM sessions exist.
  const visible: Prisma.UserSessionWhereInput = isSystem(ctx) ? {} : { NOT: roleKindIn(["SISTEM"]) };
  const [listed, online, warned, autoLogoutToday, canForce] = await Promise.all([
    prisma.userSession.findMany({
      where: {
        ...scope,
        status: filter.status ?? { in: ACTIVE },
        ...visible,
      },
      select: rowSelect,
      orderBy: { loginAt: "desc" },
    }),
    prisma.userSession.count({ where: { ...scope, ...visible, status: "ONLINE" } }),
    prisma.userSession.count({ where: { ...scope, ...visible, status: "UYARI" } }),
    prisma.userSession.count({
      where: {
        ...scope,
        ...visible,
        status: "CIKTI",
        logoutReason: { in: [...AUTO_REASONS] },
        logoutAt: { gte: dayStart },
      },
    }),
    can(ctx, SCREEN, "A", hotelId),
  ]);
  return {
    rows: listed.map((row) => toRow(row, now)),
    counts: { total: online + warned, online, warned, autoLogoutToday },
    canForce,
  };
}

/** Closes one open session as ZORUNLU. The audit user is the operator (`byUserId`). */
export async function forceLogout(ctx: Ctx, sessionId: string): Promise<void> {
  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
    select: {
      hotelId: true,
      status: true,
      userId: true,
      role: { select: { kind: true } },
      user: { select: { role: { select: { kind: true } } } },
    },
  });
  // Authorisation first: an unpermitted caller must not learn whether a session id exists or is open.
  await assertCan(ctx, SCREEN, "A", session?.hotelId);
  if (!session || !ACTIVE.includes(session.status)) {
    throw new DomainError("NOT_FOUND", "Açık oturum bulunamadı");
  }
  if (!isSystem(ctx)) {
    const kinds = [session.role.kind, session.user.role.kind];
    if (kinds.includes("SISTEM")) {
      return deny(ctx, "Sistem yöneticisi oturumunu kapatma yetkiniz yok", {
        action: "A", sessionId, userId: session.userId, reason: "SISTEM_ROLE_TARGET",
      });
    }
    if (kinds.includes("YONETIM") && session.userId !== ctx.user.id) {
      return deny(ctx, "Yönetici oturumunu yalnızca sistem yöneticisi kapatabilir", {
        action: "A", sessionId, userId: session.userId, reason: "YONETIM_TARGET",
      });
    }
  }
  const closed = await closeSession(sessionId, "ZORUNLU", ctx.user.id);
  if (!closed) throw new DomainError("NOT_FOUND", "Açık oturum bulunamadı");
}

/**
 * Closes this hotel's open sessions whose lastSeenAt is at least `session.idleMinutes` old
 * (same threshold as the sweeper). Returns how many were closed.
 */
export async function endIdle(ctx: Ctx, hotelId: string): Promise<number> {
  await assertCan(ctx, SCREEN, "A", hotelId);
  const idleMinutes = await getSetting("session.idleMinutes", hotelId);
  const threshold = new Date(Date.now() - idleMinutes * MINUTE_MS);
  const idle = await prisma.userSession.findMany({
    where: {
      hotelId,
      status: { in: ACTIVE },
      lastSeenAt: { lte: threshold },
      ...(isSystem(ctx) ? {} : { NOT: roleKindIn(["SISTEM", "YONETIM"]) }),
    },
    select: { id: true },
  });
  let closed = 0;
  for (const { id } of idle) {
    if (await closeSession(id, "HAREKETSIZLIK", ctx.user.id)) closed += 1;
  }
  return closed;
}
