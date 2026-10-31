import type { LogoutReason, SessionStatus, UserSession } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { DomainError } from "@/lib/result";
// Interim source of the session.* settings; Task 9 replaces sessionSetting() with the real service.
import { DEFAULT_SETTINGS } from "../../../../prisma/seed/settings";
import { audit } from "./audit";

const ACTIVE_STATUSES: SessionStatus[] = ["ONLINE", "UYARI"];
const MINUTE_MS = 60_000;

/** The single place the session.* settings are read from (swapped for getSetting in Task 9). */
export async function sessionSetting<T extends number | boolean>(key: string): Promise<T> {
  return DEFAULT_SETTINGS[key] as T;
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
async function maxOnlineMinutes(role: { kind: string; maxOnlineMinutes: number | null }) {
  if (role.maxOnlineMinutes != null) return role.maxOnlineMinutes;
  return role.kind === "MINIBAR"
    ? sessionSetting<number>("session.minibarMaxOnlineMinutes")
    : sessionSetting<number>("session.maxOnlineMinutes");
}

/**
 * Opens a UserSession. With session.singleDevice on (default) the user's other open sessions are
 * closed with TEK_CIHAZ in the same transaction; the user row is locked first so concurrent
 * logins of one user serialize and exactly one session stays open.
 */
export async function createSession(input: CreateSessionInput): Promise<UserSession> {
  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new DomainError("NOT_FOUND", "Rol bulunamadı");
  const minutes = await maxOnlineMinutes(role);
  const singleDevice = await sessionSetting<boolean>("session.singleDevice");

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${input.userId} AND is_active = true FOR UPDATE`;
    if (locked.length === 0) throw new DomainError("UNAUTHORIZED", "Kullanıcı etkin değil");

    const now = new Date();

    if (singleDevice) {
      const open = await tx.userSession.findMany({
        where: { userId: input.userId, status: { in: ACTIVE_STATUSES } },
        select: { id: true, hotelId: true },
      });
      if (open.length > 0) {
        await tx.userSession.updateMany({
          where: { id: { in: open.map((s) => s.id) } },
          data: { status: "CIKTI", logoutReason: "TEK_CIHAZ", logoutAt: now },
        });
        await tx.sessionEvent.createMany({
          data: open.map((s) => ({
            sessionId: s.id,
            event: "LOGOUT",
            detail: { reason: "TEK_CIHAZ" },
          })),
        });
        for (const s of open) {
          await audit(tx, {
            userId: input.userId,
            hotelId: s.hotelId,
            action: "LOGOUT",
            entity: "UserSession",
            entityId: s.id,
            after: { reason: "TEK_CIHAZ" },
            ip: input.ip,
          });
        }
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
 * by an administrator) is recorded as a FORCE_LOGOUT event/audit. Closing an already closed
 * session is a no-op.
 */
export async function closeSession(
  id: string,
  reason: LogoutReason,
  byUserId?: string,
): Promise<void> {
  const forced = reason === "ZORUNLU";
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.userSession.updateMany({
      where: { id, status: { in: ACTIVE_STATUSES } },
      data: { status: "CIKTI", logoutReason: reason, logoutAt: new Date() },
    });
    if (count === 0) return;

    const session = await tx.userSession.findUniqueOrThrow({ where: { id } });
    const event = forced ? "FORCE_LOGOUT" : "LOGOUT";
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
  });
}
