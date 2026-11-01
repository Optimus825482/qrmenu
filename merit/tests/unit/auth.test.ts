import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import {
  addMember,
  dropReferenceData,
  hotelId,
  makeOutlet,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

// A minimal cookie jar standing in for next/headers cookies().
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "UA/test", "x-forwarded-for": "10.9.9.9" }),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));

const { requireUser, writeSessionCookie, SESSION_COOKIE_NAME } = await import("@/lib/auth");
const { createSession, closeSession } = await import("@/modules/core/server/sessions");
const { selectTargetAction } = await import("@/modules/core/server/loginAction");
const { proxy, config } = await import("@/proxy");
const { env } = await import("@/lib/env");

async function cookieFor(data: object) {
  jar.set(SESSION_COOKIE_NAME, await sealData(data, { password: env.SESSION_SECRET }));
}

beforeAll(resetReferenceData);
beforeEach(async () => {
  jar.clear();
  await resetTestData();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("requireUser (gerçek test DB)", () => {
  async function login(username = "gar1") {
    const user = await makeUser({ username, roleCode: "R-GAR", hotelCode: "ROYAL" });
    const outlet = await makeOutlet("PREMIUM", "Havuz Bar", "BAR");
    await addMember(user.id, outlet.id);
    const session = await createSession({
      userId: user.id,
      hotelId: outlet.hotelId,
      outletId: outlet.id,
      roleId: user.roleId,
      ip: "10.0.0.1",
    });
    await cookieFor({ userId: user.id, sessionId: session.id, roleCode: "R-GAR" });
    return { user, outlet, session };
  }

  it("açık outlet oturumu için Ctx üretir; hotelIds yalnız oturum (outlet) oteli", async () => {
    const { user, outlet, session } = await login();
    const ctx = await requireUser();
    expect(ctx.user).toMatchObject({
      id: user.id,
      username: "gar1",
      roleCode: "R-GAR",
      roleKind: "OUTLET",
      hotelId: await hotelId("ROYAL"),
    });
    expect(ctx.session).toEqual({ id: session.id, hotelId: outlet.hotelId, outletId: outlet.id });
    // Spec §4.1: outlet roles see the active session's outlet only, not their base hotel.
    expect(ctx.hotelIds).toEqual([outlet.hotelId]);
  });

  it("R-GAR (temel otel DIAMOND) MR outletinde: hotelIds = [MR]; can(…, DIAMOND) false", async () => {
    const { can } = await import("@/lib/rbac");
    const user = await makeUser({ username: "gar5", roleCode: "R-GAR", hotelCode: "DIAMOND" });
    const outlet = await makeOutlet("ROYAL", "Sahil Bar", "BAR");
    await addMember(user.id, outlet.id);
    const session = await createSession({
      userId: user.id,
      hotelId: outlet.hotelId,
      outletId: outlet.id,
      roleId: user.roleId,
    });
    await cookieFor({ userId: user.id, sessionId: session.id, roleCode: "R-GAR" });
    const ctx = await requireUser();
    expect(ctx.hotelIds).toEqual([await hotelId("ROYAL")]);
    expect(await can(ctx, "QS-KUY", "V", await hotelId("ROYAL"))).toBe(true);
    expect(await can(ctx, "QS-KUY", "V", await hotelId("DIAMOND"))).toBe(false);
  });

  it("MINIBAR oturumunda hotelIds kapsam ∪ oturum oteli kalır", async () => {
    const user = await makeUser({
      username: "dep5",
      roleCode: "R-DEP",
      hotelCode: "ROYAL",
      extraHotelCodes: ["PREMIUM"],
    });
    const session = await createSession({
      userId: user.id,
      hotelId: await hotelId("PREMIUM"),
      roleId: user.roleId,
    });
    await cookieFor({ userId: user.id, sessionId: session.id, roleCode: "R-DEP" });
    expect([...(await requireUser()).hotelIds].sort()).toEqual(
      [await hotelId("ROYAL"), await hotelId("PREMIUM")].sort(),
    );
  });

  it("SISTEM rolünde hotelIds tüm aktif oteller", async () => {
    const user = await makeUser({ username: "sys1", roleCode: "R-SYS" });
    const session = await createSession({
      userId: user.id,
      hotelId: await hotelId("DIAMOND"),
      roleId: user.roleId,
    });
    await cookieFor({ userId: user.id, sessionId: session.id, roleCode: "R-SYS" });
    expect((await requireUser()).hotelIds).toHaveLength(3);
  });

  it("lastSeenAt en çok dakikada bir güncellenir", async () => {
    const { session } = await login();
    const before = (await testDb.userSession.findUniqueOrThrow({ where: { id: session.id } }))
      .lastSeenAt;
    await requireUser();
    const afterFirst = await testDb.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(afterFirst.lastSeenAt.getTime()).toBe(before.getTime()); // < 60 s: untouched

    const old = new Date(Date.now() - 120_000);
    await testDb.userSession.update({ where: { id: session.id }, data: { lastSeenAt: old } });
    await requireUser();
    const touched = await testDb.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(touched.lastSeenAt.getTime()).toBeGreaterThan(old.getTime() + 100_000);
  });

  it("46 dk hareketsiz oturum UNAUTHORIZED olur ve CIKTI/HAREKETSIZLIK ile kapanır", async () => {
    const { session } = await login();
    await testDb.userSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(Date.now() - 46 * 60_000) },
    });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const after = await testDb.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(after.status).toBe("CIKTI");
    expect(after.logoutReason).toBe("HAREKETSIZLIK");
  });

  it("44 dk hareketsiz oturum geçer ve lastSeenAt güncellenir", async () => {
    const { session } = await login();
    const old = new Date(Date.now() - 44 * 60_000);
    await testDb.userSession.update({ where: { id: session.id }, data: { lastSeenAt: old } });
    await expect(requireUser()).resolves.toBeDefined();
    const after = await testDb.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(after.status).toBe("ONLINE");
    expect(after.lastSeenAt.getTime()).toBeGreaterThan(old.getTime() + 60_000);
  });

  it("çerez yok / bekleyen çerez / bilinmeyen oturum → UNAUTHORIZED", async () => {
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await cookieFor({ userId: "u1", pendingTargets: true });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await cookieFor({ userId: "u1", sessionId: "yok" });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("süresi dolmuş oturum UNAUTHORIZED döner (kapatma süpürücünün işi, burada ONLINE kalır)", async () => {
    const { session } = await login();
    await testDb.userSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe(
      "ONLINE",
    );
  });

  it("kapatılmış oturum UNAUTHORIZED döner", async () => {
    const { session } = await login();
    await expect(requireUser()).resolves.toBeDefined();
    await closeSession(session.id, "MANUEL");
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("pasif kullanıcı: oturum CIKTI/SISTEM olur, yeniden etkinleştirmek çerezi canlandırmaz", async () => {
    const { user, session } = await login();
    await expect(requireUser()).resolves.toBeDefined();

    await testDb.user.update({ where: { id: user.id }, data: { isActive: false } });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const row = await testDb.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(row).toMatchObject({ status: "CIKTI", logoutReason: "SISTEM" });

    await testDb.user.update({ where: { id: user.id }, data: { isActive: true } });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("pasif otel: oturum CIKTI/SISTEM olur, yeniden etkinleştirmek çerezi canlandırmaz", async () => {
    const { session } = await login();
    await testDb.hotel.update({ where: { id: session.hotelId }, data: { isActive: false } });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const row = await testDb.userSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(row).toMatchObject({ status: "CIKTI", logoutReason: "SISTEM" });

    await testDb.hotel.update({ where: { id: session.hotelId }, data: { isActive: true } });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("başka kullanıcıya ait çerez/oturum eşleşmesi reddedilir", async () => {
    const { session } = await login();
    await cookieFor({ userId: "baska", sessionId: session.id });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("requireUser oturum yetkisini yeniden doğrular (gerçek test DB)", () => {
  async function outletLogin() {
    const user = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const outlet = await makeOutlet("ROYAL", "Havuz Bar", "BAR");
    const member = await addMember(user.id, outlet.id);
    const session = await createSession({
      userId: user.id,
      hotelId: outlet.hotelId,
      outletId: outlet.id,
      roleId: user.roleId,
    });
    await cookieFor({ userId: user.id, sessionId: session.id, roleCode: "R-GAR" });
    return { user, outlet, member, session };
  }

  async function expectClosedBySystem(sessionId: string) {
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const row = await testDb.userSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(row).toMatchObject({ status: "CIKTI", logoutReason: "SISTEM" });
    expect(row.logoutAt).toBeInstanceOf(Date);
  }

  it("(c) geçerli oturum geçer ve kapatılmaz", async () => {
    const { session } = await outletLogin();
    await expect(requireUser()).resolves.toBeDefined();
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe(
      "ONLINE",
    );
  });

  it("(a) OutletMember pasifleştirilince oturum CIKTI/SISTEM olur", async () => {
    const { member, session } = await outletLogin();
    await testDb.outletMember.update({ where: { id: member.id }, data: { isActive: false } });
    await expectClosedBySystem(session.id);
  });

  it("outlet pasifleştirilince oturum CIKTI/SISTEM olur", async () => {
    const { outlet, session } = await outletLogin();
    await testDb.outlet.update({ where: { id: outlet.id }, data: { isActive: false } });
    await expectClosedBySystem(session.id);
  });

  it("OutletMember rol geçersiz kılması değişince oturum CIKTI/SISTEM olur", async () => {
    const user = await makeUser({ username: "gar2", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const sef = await testDb.role.findUniqueOrThrow({ where: { code: "R-SGF" } });
    const outlet = await makeOutlet("ROYAL", "Salon", "SALON");
    const member = await testDb.outletMember.create({
      data: { userId: user.id, outletId: outlet.id, roleId: sef.id },
    });
    const session = await createSession({
      userId: user.id,
      hotelId: outlet.hotelId,
      outletId: outlet.id,
      roleId: sef.id,
    });
    await cookieFor({ userId: user.id, sessionId: session.id, roleCode: "R-SGF" });
    await expect(requireUser()).resolves.toMatchObject({ user: { roleCode: "R-SGF" } });

    await testDb.outletMember.update({ where: { id: member.id }, data: { roleId: null } });
    await expectClosedBySystem(session.id);
  });

  it("temel rolle açılmış outlet oturumu: sonradan eklenen OutletMember.roleId (R-GAR→R-OUT) oturumu kapatır", async () => {
    const { member, session } = await outletLogin();
    await expect(requireUser()).resolves.toMatchObject({ user: { roleCode: "R-GAR" } });

    const lower = await testDb.role.findUniqueOrThrow({ where: { code: "R-OUT" } });
    await testDb.outletMember.update({ where: { id: member.id }, data: { roleId: lower.id } });
    await expectClosedBySystem(session.id);
  });

  it("kullanıcının rolü değişince (oturum rolü artık uymuyor) oturum CIKTI/SISTEM olur", async () => {
    const { user, session } = await outletLogin();
    const bar = await testDb.role.findUniqueOrThrow({ where: { code: "R-BAR" } });
    await testDb.user.update({ where: { id: user.id }, data: { roleId: bar.id } });
    await expectClosedBySystem(session.id);
  });

  it("(b) depo kullanıcısının oteli UserHotel'den çıkarılınca oturum CIKTI/SISTEM olur", async () => {
    const user = await makeUser({
      username: "dep1",
      roleCode: "R-DEP",
      extraHotelCodes: ["ROYAL", "PREMIUM"],
    });
    const session = await createSession({
      userId: user.id,
      hotelId: await hotelId("PREMIUM"),
      roleId: user.roleId,
    });
    await cookieFor({ userId: user.id, sessionId: session.id, roleCode: "R-DEP" });
    await expect(requireUser()).resolves.toMatchObject({
      session: { hotelId: await hotelId("PREMIUM") },
    });

    await testDb.userHotel.deleteMany({ where: { userId: user.id, hotelId: await hotelId("PREMIUM") } });
    await expectClosedBySystem(session.id);
    expect(await testDb.auditLog.count({ where: { action: "LOGOUT", userId: user.id } })).toBe(1);
  });
});

describe("bekleyen hedef-seçim çerezi (/secim) erişim vermez", () => {
  it("requireUser: userId + pendingTargets var, geçerli sessionId yok → UNAUTHORIZED", async () => {
    const user = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "ROYAL" });
    await cookieFor({ userId: user.id, pendingTargets: true });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await cookieFor({ userId: user.id, pendingTargets: true, sessionId: "gecersiz" });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("selectTargetAction: oturumsuz çerez reddedilir, etkin oturum başka hedef seçebilir", async () => {
    const user = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });

    const noCookie = await selectTargetAction(0);
    expect(noCookie).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    await cookieFor({ userId: user.id });
    expect(await selectTargetAction(0)).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    await cookieFor({ userId: user.id, pendingTargets: false });
    expect(await selectTargetAction(0)).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    // An authenticated session may switch outlets without re-entering credentials.
    const session = await createSession({
      userId: user.id,
      hotelId: await hotelId("ROYAL"),
      roleId: user.roleId,
    });
    await cookieFor({ userId: user.id, sessionId: session.id, roleCode: "R-KAT" });
    expect(await selectTargetAction(0)).toMatchObject({ ok: true, data: { next: "/kat" } });
    expect(await testDb.userSession.count()).toBe(2);
  });

  it("selectTargetAction: süresi kapanmış tam oturum hedef seçemez", async () => {
    const user = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const session = await createSession({
      userId: user.id,
      hotelId: await hotelId("ROYAL"),
      roleId: user.roleId,
    });
    await testDb.userSession.update({ where: { id: session.id }, data: { status: "CIKTI" } });
    await cookieFor({ userId: user.id, sessionId: session.id, roleCode: "R-KAT" });

    expect(await selectTargetAction(0)).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(await testDb.userSession.count()).toBe(1);
  });

  it("selectTargetAction: bekleyen çerezle oturum açılır ve çerez tam oturumla değişir", async () => {
    const user = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });
    await cookieFor({ userId: user.id, pendingTargets: true });
    const res = await selectTargetAction(0);
    expect(res).toMatchObject({ ok: true, data: { next: "/kat" } });

    const row = await testDb.userSession.findFirstOrThrow({ where: { userId: user.id } });
    const ctx = await requireUser(); // the new cookie now grants access
    expect(ctx.session.id).toBe(row.id);
    const { getSession } = await import("@/lib/auth");
    expect((await getSession()).pendingTargets).toBeUndefined();
  });
});

describe("writeSessionCookie", () => {
  it("yeni yükü eskisinin yerine yazar (eski anahtarlar kalmaz)", async () => {
    await writeSessionCookie({ userId: "u1", pendingTargets: true }, { ttlSeconds: 300 });
    expect(jar.has(SESSION_COOKIE_NAME)).toBe(true);
    await writeSessionCookie({ userId: "u1", sessionId: "s1", roleCode: "R-GAR" });
    const { getSession } = await import("@/lib/auth");
    const data = await getSession();
    expect({ ...data }).toEqual({ userId: "u1", sessionId: "s1", roleCode: "R-GAR" });
  });
});

describe("proxy", () => {
  const req = (path: string, cookie?: string) =>
    new NextRequest(`http://localhost:3000${path}`, {
      headers: cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {},
    });

  it("çerezsiz istek /giris?next=… adresine yönlenir", () => {
    const res = proxy(req("/garson/masalar?x=1"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/giris");
    expect(location.searchParams.get("next")).toBe("/garson/masalar?x=1");
  });

  it("çerezli istek geçer", () => {
    const res = proxy(req("/admin", "abc"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("çerez adı auth.ts ile aynıdır ve matcher kısa kataloğu kapsar", () => {
    expect(SESSION_COOKIE_NAME).toBe("merit_session");
    expect(config.matcher).toEqual([
      "/admin/:path*",
      "/kat/:path*",
      "/depo/:path*",
      "/garson/:path*",
      "/kasa/:path*",
      "/kds/:path*",
      "/oda-servisi/:path*",
      "/secim",
    ]);
  });
});
