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
    const user = await makeUser({ username, roleCode: "R-GAR", hotelCode: "MR" });
    const outlet = await makeOutlet("MRP", "Havuz Bar", "BAR");
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

  it("açık oturum için Ctx üretir; hotelIds kapsam ∪ oturum oteli", async () => {
    const { user, outlet, session } = await login();
    const ctx = await requireUser();
    expect(ctx.user).toMatchObject({
      id: user.id,
      username: "gar1",
      roleCode: "R-GAR",
      roleKind: "OUTLET",
      hotelId: await hotelId("MR"),
    });
    expect(ctx.session).toEqual({ id: session.id, hotelId: outlet.hotelId, outletId: outlet.id });
    expect([...ctx.hotelIds].sort()).toEqual([await hotelId("MR"), outlet.hotelId].sort());
  });

  it("SISTEM rolünde hotelIds tüm aktif oteller", async () => {
    const user = await makeUser({ username: "sys1", roleCode: "R-SYS" });
    const session = await createSession({
      userId: user.id,
      hotelId: await hotelId("MRD"),
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

  it("çerez yok / bekleyen çerez / bilinmeyen oturum → UNAUTHORIZED", async () => {
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await cookieFor({ userId: "u1", pendingTargets: true });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await cookieFor({ userId: "u1", sessionId: "yok" });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("kapatılmış, süresi dolmuş oturum; pasif kullanıcı; pasif otel → UNAUTHORIZED", async () => {
    const { user, session } = await login();
    await testDb.userSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await testDb.userSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + 3600_000) },
    });
    await expect(requireUser()).resolves.toBeDefined();

    await testDb.user.update({ where: { id: user.id }, data: { isActive: false } });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await testDb.user.update({ where: { id: user.id }, data: { isActive: true } });

    await testDb.hotel.update({ where: { id: session.hotelId }, data: { isActive: false } });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await testDb.hotel.update({ where: { id: session.hotelId }, data: { isActive: true } });

    await closeSession(session.id, "MANUEL");
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("başka kullanıcıya ait çerez/oturum eşleşmesi reddedilir", async () => {
    const { session } = await login();
    await cookieFor({ userId: "baska", sessionId: session.id });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("bekleyen hedef-seçim çerezi (/secim) erişim vermez", () => {
  it("requireUser: userId + pendingTargets var, geçerli sessionId yok → UNAUTHORIZED", async () => {
    const user = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" });
    await cookieFor({ userId: user.id, pendingTargets: true });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await cookieFor({ userId: user.id, pendingTargets: true, sessionId: "gecersiz" });
    await expect(requireUser()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("selectTargetAction: bekleyen bayrağı olmayan çerez reddedilir, oturum açılmaz", async () => {
    const user = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "MR" });

    const noCookie = await selectTargetAction(0);
    expect(noCookie).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    await cookieFor({ userId: user.id });
    expect(await selectTargetAction(0)).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    await cookieFor({ userId: user.id, pendingTargets: false });
    expect(await selectTargetAction(0)).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });

    // a full session cookie is not a selection ticket either
    const session = await createSession({
      userId: user.id,
      hotelId: await hotelId("MR"),
      roleId: user.roleId,
    });
    await cookieFor({ userId: user.id, sessionId: session.id, roleCode: "R-KAT" });
    expect(await selectTargetAction(0)).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(await testDb.userSession.count()).toBe(1);
  });

  it("selectTargetAction: bekleyen çerezle oturum açılır ve çerez tam oturumla değişir", async () => {
    const user = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "MR" });
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
