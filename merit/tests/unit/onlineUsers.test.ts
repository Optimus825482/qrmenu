import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { createSession } = await import("@/modules/core/server/sessions");
const { sweepSessions } = await import("@/modules/core/server/sessionSweeper");
const onlineUsers = await import("@/modules/core/server/admin/onlineUsers");

const MIN = 60_000;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  publishMock.mockReset();
  publishMock.mockResolvedValue(undefined);
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function open(username: string, roleCode: string, hotelCode: string) {
  const user = await makeUser({ username, roleCode, hotelCode });
  const session = await createSession({
    userId: user.id,
    hotelId: await hotelId(hotelCode),
    roleId: user.roleId,
    ip: "10.0.0.8",
  });
  return { user, session };
}

describe("online kullanıcı takibi", () => {
  it("createSession session.changed yayınlar (ONLINE, SISTEM/YONETIM)", async () => {
    const mr = await hotelId("MR");
    const { user, session } = await open("gar1", "R-GAR", "MR");

    const changed = publishMock.mock.calls
      .map((call) => call[0] as { type: string; hotelId?: string; roleKinds?: string[]; payload?: { status?: string; sessionId?: string; fullName?: string; roleCode?: string } })
      .filter((event) => event.type === "session.changed");
    expect(changed).toEqual([
      expect.objectContaining({
        type: "session.changed",
        hotelId: mr,
        roleKinds: ["SISTEM", "YONETIM"],
        payload: expect.objectContaining({
          sessionId: session.id,
          userId: user.id,
          fullName: user.fullName,
          status: "ONLINE",
          hotelId: mr,
          roleCode: "R-GAR",
        }),
      }),
    ]);
  });

  it("forceLogout oturumu CIKTI/ZORUNLU kapatır, FORCE_LOGOUT ve audit byUserId yazar", async () => {
    const admin = await makeUser({ username: "admin1", roleCode: "R-SYS", hotelCode: "MR" });
    const { user, session } = await open("gar1", "R-GAR", "MR");
    await onlineUsers.forceLogout(await ctxFor(admin, { hotelCode: "MR" }), session.id);

    const closed = await testDb.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(closed.status).toBe("CIKTI");
    expect(closed.logoutReason).toBe("ZORUNLU");
    const events = await testDb.sessionEvent.findMany({ where: { sessionId: session.id, event: "FORCE_LOGOUT" } });
    expect(events).toHaveLength(1);
    expect(events[0]?.detail).toMatchObject({ reason: "ZORUNLU", byUserId: admin.id });
    const audit = await testDb.auditLog.findMany({ where: { action: "FORCE_LOGOUT", entityId: session.id } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ userId: admin.id, entity: "UserSession" });
    expect(user.id).not.toBe(admin.id);
  });

  it("R-OTM kendi otelinin oturumunu kapatır, başka otelin oturumunda FORBIDDEN", async () => {
    const otm = await makeUser({ username: "mudur", roleCode: "R-OTM", hotelCode: "MR" });
    const ctx = await ctxFor(otm, { hotelCode: "MR" });
    const own = await open("gar1", "R-GAR", "MR");
    const other = await open("gar2", "R-GAR", "MRP");

    await expect(onlineUsers.forceLogout(ctx, other.session.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: other.session.id } })).status).toBe("ONLINE");

    await onlineUsers.forceLogout(ctx, own.session.id);
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: own.session.id } })).status).toBe("CIKTI");
  });

  it("endIdle yalnız eşiği aşanları kapatır", async () => {
    const admin = await makeUser({ username: "admin1", roleCode: "R-SYS", hotelCode: "MR" });
    const ctx = await ctxFor(admin, { hotelCode: "MR" });
    const stale = await open("gar1", "R-GAR", "MR");
    const fresh = await open("gar2", "R-GAR", "MR");
    const other = await open("gar3", "R-GAR", "MRP");
    const now = Date.now();
    const idleMin = 45;
    await testDb.userSession.update({
      where: { id: stale.session.id },
      data: { lastSeenAt: new Date(now - idleMin * MIN) },
    });
    await testDb.userSession.update({
      where: { id: fresh.session.id },
      data: { lastSeenAt: new Date(now - (idleMin - 1) * MIN) },
    });
    await testDb.userSession.update({
      where: { id: other.session.id },
      data: { lastSeenAt: new Date(now - 120 * MIN) },
    });

    expect(await onlineUsers.endIdle(ctx, await hotelId("MR"))).toBe(1);
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: stale.session.id } })).logoutReason).toBe(
      "HAREKETSIZLIK",
    );
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: fresh.session.id } })).status).toBe("ONLINE");
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: other.session.id } })).status).toBe("ONLINE");

    const listed = await onlineUsers.list(ctx, await hotelId("MR"));
    expect(listed.counts.autoLogoutToday).toBe(1);
    expect(listed.rows.map((row) => row.user.username)).toEqual(["gar2"]);
  });

  it("süpürücü UYARI session.changed status UYARI yayınlar", async () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const { session } = await open("gar1", "R-GAR", "MR");
    await testDb.userSession.update({
      where: { id: session.id },
      data: {
        status: "ONLINE",
        warnedAt: null,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + 59 * MIN),
      },
    });
    publishMock.mockClear();

    const result = await sweepSessions(now, {
      warnMinutes: 60,
      idleMinutes: 45,
      notifier: vi.fn(async () => {}),
    });

    expect(result.warned).toBe(1);
    const changed = publishMock.mock.calls
      .map((call) => call[0] as { type: string; payload?: { status?: string; sessionId?: string } })
      .filter((event) => event.type === "session.changed");
    expect(changed).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ sessionId: session.id, status: "UYARI" }),
      }),
    ]);
  });
});
