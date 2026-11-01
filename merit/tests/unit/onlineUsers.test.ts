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
    const mr = await hotelId("ROYAL");
    const { user, session } = await open("gar1", "R-GAR", "ROYAL");

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
    const admin = await makeUser({ username: "admin1", roleCode: "R-SYS", hotelCode: "ROYAL" });
    const { user, session } = await open("gar1", "R-GAR", "ROYAL");
    await onlineUsers.forceLogout(await ctxFor(admin, { hotelCode: "ROYAL" }), session.id);

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
    const otm = await makeUser({ username: "mudur", roleCode: "R-OTM", hotelCode: "ROYAL" });
    const ctx = await ctxFor(otm, { hotelCode: "ROYAL" });
    const own = await open("gar1", "R-GAR", "ROYAL");
    const other = await open("gar2", "R-GAR", "PREMIUM");

    await expect(onlineUsers.forceLogout(ctx, other.session.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: other.session.id } })).status).toBe("ONLINE");

    await onlineUsers.forceLogout(ctx, own.session.id);
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: own.session.id } })).status).toBe("CIKTI");
  });

  it("endIdle yalnız eşiği aşanları kapatır", async () => {
    const admin = await makeUser({ username: "admin1", roleCode: "R-SYS", hotelCode: "ROYAL" });
    const ctx = await ctxFor(admin, { hotelCode: "ROYAL" });
    const stale = await open("gar1", "R-GAR", "ROYAL");
    const fresh = await open("gar2", "R-GAR", "ROYAL");
    const other = await open("gar3", "R-GAR", "PREMIUM");
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

    expect(await onlineUsers.endIdle(ctx, await hotelId("ROYAL"))).toBe(1);
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: stale.session.id } })).logoutReason).toBe(
      "HAREKETSIZLIK",
    );
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: fresh.session.id } })).status).toBe("ONLINE");
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: other.session.id } })).status).toBe("ONLINE");

    const listed = await onlineUsers.list(ctx, await hotelId("ROYAL"));
    expect(listed.counts.autoLogoutToday).toBe(1);
    expect(listed.rows.map((row) => row.user.username)).toEqual(["gar2"]);
  });

  it("süpürücü UYARI session.changed status UYARI yayınlar", async () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const { session } = await open("gar1", "R-GAR", "ROYAL");
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

  describe("rol hiyerarşisi (YONETIM çağıran)", () => {
    async function setup() {
      const mgr = await makeUser({ username: "mudur", roleCode: "R-OTM", hotelCode: "ROYAL" });
      const ctx = await ctxFor(mgr, { hotelCode: "ROYAL" });
      const mgrSession = await createSession({
        userId: mgr.id, hotelId: await hotelId("ROYAL"), roleId: mgr.roleId, ip: "10.0.0.8",
      });
      return { ctx, mgr, mgrSession };
    }
    const status = async (id: string) => (await testDb.userSession.findUniqueOrThrow({ where: { id } })).status;

    it("SISTEM oturumunu kapatamaz: FORBIDDEN + YETKISIZ_DENEME", async () => {
      const { ctx, mgr } = await setup();
      const admin = await open("admin1", "R-SYS", "ROYAL");
      await expect(onlineUsers.forceLogout(ctx, admin.session.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await status(admin.session.id)).toBe("ONLINE");
      const rows = await testDb.auditLog.findMany({ where: { action: "YETKISIZ_DENEME", userId: mgr.id } });
      expect(rows).toHaveLength(1);
    });

    it("başka yöneticinin oturumunu kapatamaz", async () => {
      const { ctx } = await setup();
      const other = await open("mudur2", "R-OTM", "ROYAL");
      await expect(onlineUsers.forceLogout(ctx, other.session.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await status(other.session.id)).toBe("ONLINE");
    });

    it("kendi oturumunu ve kat.mr oturumunu kapatabilir", async () => {
      const { ctx, mgrSession } = await setup();
      const kat = await open("kat.mr", "R-KAT", "ROYAL");
      await onlineUsers.forceLogout(ctx, kat.session.id);
      expect(await status(kat.session.id)).toBe("CIKTI");
      await onlineUsers.forceLogout(ctx, mgrSession.id);
      expect(await status(mgrSession.id)).toBe("CIKTI");
    });

    it("endIdle SISTEM/YONETIM oturumlarını atlar", async () => {
      const { ctx, mgrSession } = await setup();
      const admin = await open("admin1", "R-SYS", "ROYAL");
      const kat = await open("kat.mr", "R-KAT", "ROYAL");
      const old = new Date(Date.now() - 120 * MIN);
      for (const id of [admin.session.id, kat.session.id, mgrSession.id]) {
        await testDb.userSession.update({ where: { id }, data: { lastSeenAt: old } });
      }
      expect(await onlineUsers.endIdle(ctx, await hotelId("ROYAL"))).toBe(1);
      expect(await status(kat.session.id)).toBe("CIKTI");
      expect(await status(admin.session.id)).toBe("ONLINE");
      expect(await status(mgrSession.id)).toBe("ONLINE");
    });

    it("list SISTEM oturumlarını gizler; SISTEM çağıran hepsini görür", async () => {
      const { ctx } = await setup();
      const admin = await open("admin1", "R-SYS", "ROYAL");
      await open("mudur2", "R-OTM", "ROYAL");
      const mr = await hotelId("ROYAL");
      const names = (await onlineUsers.list(ctx, mr)).rows.map((r) => r.user.username).sort();
      expect(names).toEqual(["mudur", "mudur2"]);
      const sysCtx = await ctxFor(admin.user, { hotelCode: "ROYAL" });
      const all = (await onlineUsers.list(sysCtx, mr)).rows.map((r) => r.user.username).sort();
      expect(all).toEqual(["admin1", "mudur", "mudur2"]);
    });

    it("sayaçlar SISTEM oturumunu YONETIM çağırana saklar; SISTEM çağıran sayar", async () => {
      const { ctx } = await setup();
      const admin = await open("admin1", "R-SYS", "ROYAL");
      await open("gar1", "R-GAR", "ROYAL");
      const mr = await hotelId("ROYAL");
      const mgrCounts = (await onlineUsers.list(ctx, mr)).counts;
      expect(mgrCounts).toMatchObject({ total: 2, online: 2 });
      const sysCtx = await ctxFor(admin.user, { hotelCode: "ROYAL" });
      const sysCounts = (await onlineUsers.list(sysCtx, mr)).counts;
      expect(sysCounts).toMatchObject({ total: 3, online: 3 });
    });

    it("başka yöneticiyi kapatma denemesi YETKISIZ_DENEME yazar", async () => {
      const { ctx, mgr } = await setup();
      const other = await open("mudur2", "R-OTM", "ROYAL");
      await expect(onlineUsers.forceLogout(ctx, other.session.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
      const rows = await testDb.auditLog.findMany({ where: { action: "YETKISIZ_DENEME", userId: mgr.id } });
      expect(rows).toHaveLength(1);
    });

    it("SISTEM çağıran yönetici oturumunu kapatır ve boştakileri sonlandırır", async () => {
      const { mgrSession } = await setup();
      const admin = await open("admin1", "R-SYS", "ROYAL");
      const sysCtx = await ctxFor(admin.user, { hotelCode: "ROYAL" });
      await onlineUsers.forceLogout(sysCtx, mgrSession.id);
      expect(await status(mgrSession.id)).toBe("CIKTI");

      const mgr2 = await open("mudur2", "R-OTM", "ROYAL");
      await testDb.userSession.update({
        where: { id: mgr2.session.id },
        data: { lastSeenAt: new Date(Date.now() - 120 * MIN) },
      });
      expect(await onlineUsers.endIdle(sysCtx, await hotelId("ROYAL"))).toBe(1);
      expect(await status(mgr2.session.id)).toBe("CIKTI");
      expect(await status(admin.session.id)).toBe("ONLINE");
    });
  });
});
