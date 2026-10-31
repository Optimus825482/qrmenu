import type {
  LogoutReason,
  Prisma,
  RoleKind,
  SessionStatus,
  UserSession,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { audit } from "./audit";

const ACTIVE_STATUSES: SessionStatus[] = ["ONLINE", "UYARI"];
const MINUTE_MS = 60_000;
/** Who receives `session.changed` (the online-users window). */
const SESSION_WATCHERS: RoleKind[] = ["SISTEM", "YONETIM"];

const sessionWithNames = {
  include: { user: { select: { fullName: true } }, role: { select: { code: true } } },
} as const;

type NamedSession = Prisma.UserSessionGetPayload<typeof sessionWithNames>;

/** Live row for the online-users window. Delivered on commit, scoped to the session hotel. */
async function publishSessionChanged(tx: Prisma.TransactionClient, session: NamedSession): Promise<void> {
  const payload: Record<string, unknown> = {
    sessionId: session.id,
    userId: session.userId,
    fullName: session.user.fullName,
    status: session.status,
    hotelId: session.hotelId,
    roleCode: session.role.code,
    loginAt: session.loginAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  };
  if (session.outletId) payload.outletId = session.outletId;
  await publish(
    {
      type: "session.changed",
      hotelId: session.hotelId,
      roleKinds: SESSION_WATCHERS,
      payload,
    },
    tx,
  );
}

export type CreateSessionInput = {
  userId: string;
  hotelId: string;
  outletId?: string;
  roleId: string;
  ip?: string;
  userAgent?: string;
  deviceLabel?: string;
};

/** The role's own limit, else the Minibar or general setting. */
async function maxOnlineMinutes(
  role: { kind: string; maxOnlineMinutes: number | null },
  hotelId: string,
) {
  if (role.maxOnlineMinutes != null) return role.maxOnlineMinutes;
  return getSetting(
    role.kind === "MINIBAR" ? "session.minibarMaxOnlineMinutes" : "session.maxOnlineMinutes",
    hotelId,
  );
}

/**
 * Opens a UserSession. With session.singleDevice on (default) the user's other open sessions are
 * closed with TEK_CIHAZ in the same transaction; the user row is locked first so concurrent
 * logins of one user serialize and exactly one session stays open.
 */
export async function createSession(input: CreateSessionInput): Promise<UserSession> {
  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new DomainError("NOT_FOUND", "Rol bulunamadı");
  const minutes = await maxOnlineMinutes(role, input.hotelId);
  const singleDevice = await getSetting("session.singleDevice", input.hotelId);

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${input.userId} AND is_active = true FOR UPDATE`;
    if (locked.length === 0) throw new DomainError("UNAUTHORIZED", "Kullanıcı etkin değil");

    const now = new Date();

    if (singleDevice) {
      const open = await tx.userSession.findMany({
        where: { userId: input.userId, status: { in: ACTIVE_STATUSES } },
        select: { id: true },
      });
      for (const { id } of open) {
        await closeSessionInTx(tx, id, "TEK_CIHAZ", undefined, input.ip);
      }
    }

    const session = await tx.userSession.create({
      data: {
        userId: input.userId,
        hotelId: input.hotelId,
        outletId: input.outletId,
        roleId: input.roleId,
        deviceLabel: input.deviceLabel,
        status: "ONLINE",
        loginAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + minutes * MINUTE_MS),
        ip: input.ip ?? "unknown",
        userAgent: input.userAgent ?? "unknown",
      },
    });
    await tx.sessionEvent.create({ data: { sessionId: session.id, event: "LOGIN" } });
    await audit(tx, {
      userId: input.userId,
      hotelId: input.hotelId,
      action: "LOGIN",
      entity: "UserSession",
      entityId: session.id,
      after: { outletId: input.outletId, roleId: input.roleId },
      ip: input.ip,
    });
    const named = await tx.userSession.findUniqueOrThrow({ where: { id: session.id }, ...sessionWithNames });
    await publishSessionChanged(tx, named);
    return session;
  });
}

/** Records activity on an open session. Callers throttle (requireUser: at most once a minute). */
export async function touchSession(id: string): Promise<void> {
  await prisma.userSession.updateMany({
    where: { id, status: { in: ACTIVE_STATUSES } },
    data: { lastSeenAt: new Date() },
  });
}

/**
 * Ends an open session with status CIKTI for every reason (closed by the user or the system).
 * DUSURULDU is reserved for a dropped connection/device and is never set here. ZORUNLU (forced
 * by an administrator) is recorded as a FORCE_LOGOUT event/audit. Returns false when the session
 * was not open (already closed is a no-op).
 */
export async function closeSession(
  id: string,
  reason: LogoutReason,
  byUserId?: string,
): Promise<boolean> {
  return prisma.$transaction((tx) => closeSessionInTx(tx, id, reason, byUserId));
}

/**
 * Marks one ONLINE session UYARI (the sweeper). Conditional, so overlapping sweeps cannot both
 * win. Publishes `session.changed` with status UYARI. Returns false when another pass won.
 */
export async function warnSession(id: string, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.userSession.updateMany({
      where: { id, status: "ONLINE", warnedAt: null },
      data: { status: "UYARI", warnedAt: now },
    });
    if (count === 0) return false;
    await tx.sessionEvent.create({ data: { sessionId: id, event: "WARN" } });
    const named = await tx.userSession.findUniqueOrThrow({ where: { id }, ...sessionWithNames });
    await publishSessionChanged(tx, named);
    return true;
  });
}

/**
 * Closes every open session of a user inside the caller's transaction (deactivation, password
 * reset): each gets status CIKTI, `reason` and its own `session.closed` event so SSE streams end.
 */
export async function closeUserSessionsInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  reason: LogoutReason,
  byUserId?: string,
): Promise<number> {
  const open = await tx.userSession.findMany({
    where: { userId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  let closed = 0;
  for (const { id } of open) {
    if (await closeSessionInTx(tx, id, reason, byUserId)) closed += 1;
  }
  return closed;
}

/**
 * The close itself, inside the caller's transaction: status, SessionEvent, audit and the
 * `session.closed` event (delivered on commit). Shared by closeSession and the single-device
 * displacement in createSession. Returns false when the session was not open (no-op).
 */
async function closeSessionInTx(
  tx: Prisma.TransactionClient,
  id: string,
  reason: LogoutReason,
  byUserId?: string,
  ip?: string,
): Promise<boolean> {
  const { count } = await tx.userSession.updateMany({
    where: { id, status: { in: ACTIVE_STATUSES } },
    data: { status: "CIKTI", logoutReason: reason, logoutAt: new Date() },
  });
  if (count === 0) return false;

  const session = await tx.userSession.findUniqueOrThrow({ where: { id }, ...sessionWithNames });
  const event = reason === "ZORUNLU" ? "FORCE_LOGOUT" : "LOGOUT";
  await tx.sessionEvent.create({
    data: { sessionId: id, event, detail: { reason, byUserId: byUserId ?? null } },
  });
  await audit(tx, {
    userId: byUserId ?? session.userId,
    hotelId: session.hotelId,
    action: event,
    entity: "UserSession",
    entityId: id,
    after: { reason, sessionUserId: session.userId },
    ip,
  });
  // Ends this session's SSE stream (on commit); the user's other sessions are unaffected.
  await publish(
    {
      type: "session.closed",
      userIds: [session.userId],
      hotelId: session.hotelId,
      payload: { sessionId: id },
    },
    tx,
  );
  await publishSessionChanged(tx, session);
  return true;
}
