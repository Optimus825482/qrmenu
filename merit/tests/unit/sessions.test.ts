import { pbkdf2Sync } from "node:crypto";
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

const { createSession, touchSession, closeSession } = await import(
  "@/modules/core/server/sessions"
);
const { performLogin, performSelectTarget, resetRateLimit } = await import(
  "@/modules/core/server/login"
);
const { hashPassword } = await import("@/lib/password");

const PASSWORD = "Parola1!";
let passwordHash: string;

async function newSession(userId: string, hotel: string, roleId: string) {
  return createSession({ userId, hotelId: await hotelId(hotel), roleId, ip: "10.0.0.1" });
}

beforeAll(async () => {
  await resetReferenceData();
  passwordHash = await hashPassword(PASSWORD);
});
beforeEach(async () => {
  await resetTestData();
  resetRateLimit();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("createSession / closeSession (gerçek test DB)", () => {
  it("ikinci oturum ilkini CIKTI/TEK_CIHAZ ile kapatır ve olay yazar", async () => {
    const user = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" });
    const first = await newSession(user.id, "MR", user.roleId);
    const second = await newSession(user.id, "MR", user.roleId);

    const closed = await testDb.userSession.findUniqueOrThrow({ where: { id: first.id } });
    expect(closed.status).toBe("CIKTI");
    expect(closed.logoutReason).toBe("TEK_CIHAZ");
    expect(closed.logoutAt).toBeInstanceOf(Date);
    const open = await testDb.userSession.findUniqueOrThrow({ where: { id: second.id } });
    expect(open.status).toBe("ONLINE");
    expect(open.logoutAt).toBeNull();

    const events = await testDb.sessionEvent.findMany({ where: { sessionId: first.id } });
    expect(events.map((e) => e.event).sort()).toEqual(["LOGIN", "LOGOUT"]);
  });

  it("başka kullanıcının oturumuna dokunmaz", async () => {
    const a = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" });
    const b = await makeUser({ username: "gar2", roleCode: "R-GAR", hotelCode: "MR" });
    const sa = await newSession(a.id, "MR", a.roleId);
    await newSession(b.id, "MR", b.roleId);
    expect((await testDb.userSession.findUniqueOrThrow({ where: { id: sa.id } })).status).toBe(
      "ONLINE",
    );
  });

  it("5 eşzamanlı createSession sonunda tek ONLINE oturum kalır", async () => {
    const user = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" });
    const hid = await hotelId("MR");
    await Promise.all(
      Array.from({ length: 5 }, () =>
        createSession({ userId: user.id, hotelId: hid, roleId: user.roleId, ip: "10.0.0.1" }),
      ),
    );
    const sessions = await testDb.userSession.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(5);
    expect(sessions.filter((s) => s.status === "ONLINE")).toHaveLength(1);
    expect(
      sessions.filter((s) => s.status === "CIKTI" && s.logoutReason === "TEK_CIHAZ"),
    ).toHaveLength(4);
  });

  it("expiresAt: R-KAT 600 dk (rol), R-GAR 480 dk (ayar), R-DEP 600 dk (minibar ayarı)", async () => {
    const kat = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "MR" });
    const gar = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" });
    const dep = await makeUser({ username: "dep1", roleCode: "R-DEP", hotelCode: "MR" });
    const minutes = async (userId: string, roleId: string) => {
      const s = await newSession(userId, "MR", roleId);
      return (s.expiresAt.getTime() - s.loginAt.getTime()) / 60000;
    };
    expect(await minutes(kat.id, kat.roleId)).toBe(600);
    expect(await minutes(gar.id, gar.roleId)).toBe(480);
    expect(await minutes(dep.id, dep.roleId)).toBe(600);
  });

  it("LOGIN audit satırı yazar; ip/userAgent kaydedilir", async () => {
    const user = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" });
    const s = await createSession({
      userId: user.id,
      hotelId: await hotelId("MR"),
      roleId: user.roleId,
      ip: "10.1.2.3",
      userAgent: "UA/1.0",
    });
    expect(s).toMatchObject({ ip: "10.1.2.3", userAgent: "UA/1.0", status: "ONLINE" });
    const rows = await testDb.auditLog.findMany({ where: { action: "LOGIN" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: user.id, entity: "UserSession", entityId: s.id });
  });

  it("pasif kullanıcı için UNAUTHORIZED", async () => {
    const user = await makeUser({
      username: "gar1",
      roleCode: "R-GAR",
      hotelCode: "MR",
      isActive: false,
    });
    await expect(newSession(user.id, "MR", user.roleId)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(await testDb.userSession.count()).toBe(0);
  });

  it("closeSession(ZORUNLU, adminId) oturumu CIKTI yapar ve audit satırı yazar; ikinci çağrı etkisiz", async () => {
    const admin = await makeUser({ username: "sys1", roleCode: "R-SYS" });
    const user = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" });
    const s = await newSession(user.id, "MR", user.roleId);

    await closeSession(s.id, "ZORUNLU", admin.id);
    await closeSession(s.id, "ZORUNLU", admin.id);

    const row = await testDb.userSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.status).toBe("CIKTI");
    expect(row.logoutReason).toBe("ZORUNLU");
    expect(row.logoutAt).toBeInstanceOf(Date);

    const audits = await testDb.auditLog.findMany({ where: { action: "FORCE_LOGOUT" } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ userId: admin.id, entity: "UserSession", entityId: s.id });
    const events = await testDb.sessionEvent.findMany({
      where: { sessionId: s.id, event: "FORCE_LOGOUT" },
    });
    expect(events).toHaveLength(1);
  });

  it("closeSession hiçbir nedenle DUSURULDU üretmez: her LogoutReason CIKTI", async () => {
    const reasons = ["MANUEL", "SURE_ASIMI", "HAREKETSIZLIK", "ZORUNLU", "TEK_CIHAZ", "SISTEM"] as const;
    for (const reason of reasons) {
      const user = await makeUser({ username: `gar-${reason}`, roleCode: "R-GAR", hotelCode: "MR" });
      const s = await newSession(user.id, "MR", user.roleId);
      await closeSession(s.id, reason);
      const row = await testDb.userSession.findUniqueOrThrow({ where: { id: s.id } });
      expect(row).toMatchObject({ status: "CIKTI", logoutReason: reason });
    }
  });

  it("closeSession(MANUEL) CIKTI yapar ve LOGOUT olayı/audit yazar", async () => {
    const user = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" });
    const s = await newSession(user.id, "MR", user.roleId);
    await closeSession(s.id, "MANUEL");
    const row = await testDb.userSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row).toMatchObject({ status: "CIKTI", logoutReason: "MANUEL" });
    expect(await testDb.auditLog.count({ where: { action: "LOGOUT", userId: user.id } })).toBe(1);
  });

  it("touchSession lastSeenAt değerini ilerletir", async () => {
    const user = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" });
    const s = await newSession(user.id, "MR", user.roleId);
    await testDb.userSession.update({
      where: { id: s.id },
      data: { lastSeenAt: new Date(Date.now() - 3600_000) },
    });
    await touchSession(s.id);
    const row = await testDb.userSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(Date.now() - row.lastSeenAt.getTime()).toBeLessThan(5000);
  });
});

describe("performLogin / performSelectTarget (gerçek test DB)", () => {
  const ctx = { ip: "10.0.0.9", userAgent: "UA/1.0" };
  const creds = (username: string, password = PASSWORD) => ({ username, password, ...ctx });
  const makeDeps = () => ({ setCookie: vi.fn(async () => {}) });

  it("tek hedef: oturum açar, çerez yazar, next = rolün varsayılan ekran yolu", async () => {
    const user = await makeUser({
      username: "kat1",
      roleCode: "R-KAT",
      hotelCode: "MR",
      passwordHash,
    });
    const deps = makeDeps();
    const res = await performLogin(creds("kat1"), deps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.next).toBe("/kat");
    expect(res.data.targets).toHaveLength(1);

    const session = await testDb.userSession.findFirstOrThrow({ where: { userId: user.id } });
    expect(session).toMatchObject({ status: "ONLINE", ip: "10.0.0.9", userAgent: "UA/1.0" });
    expect(deps.setCookie).toHaveBeenCalledTimes(1);
    expect(deps.setCookie).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        sessionId: session.id,
        hotelId: await hotelId("MR"),
        roleCode: "R-KAT",
      }),
    );
    expect((await testDb.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt).not.toBe(
      null,
    );
  });

  it("R-SYS tek ADMIN hedefi: next /admin", async () => {
    await makeUser({ username: "sys1", roleCode: "R-SYS", passwordHash });
    const res = await performLogin(creds("sys1"), makeDeps());
    expect(res).toMatchObject({ ok: true, data: { next: "/admin" } });
  });

  it("yanlış şifre, pasif kullanıcı ve bilinmeyen kullanıcı aynı UNAUTHORIZED mesajını alır", async () => {
    await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR", passwordHash });
    await makeUser({
      username: "gar2",
      roleCode: "R-GAR",
      hotelCode: "MR",
      passwordHash,
      isActive: false,
    });
    const deps = makeDeps();
    const wrong = await performLogin(creds("gar1", "yanlis-sifre"), deps);
    const inactive = await performLogin(creds("gar2"), deps);
    const unknown = await performLogin(creds("yok"), deps);
    for (const r of [wrong, inactive, unknown]) {
      expect(r).toEqual({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Kullanıcı adı veya şifre hatalı" },
      });
    }
    expect(deps.setCookie).not.toHaveBeenCalled();
    expect(await testDb.userSession.count()).toBe(0);
  });

  it("6. deneme RATE_LIMITED; başka IP + başka kullanıcı etkilenmez", async () => {
    await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR", passwordHash });
    await makeUser({ username: "gar2", roleCode: "R-GAR", hotelCode: "MR", passwordHash });
    const deps = makeDeps();
    for (let i = 0; i < 5; i++) {
      const r = await performLogin(creds("gar1", "yanlis"), deps);
      expect(r).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    }
    const sixth = await performLogin(creds("gar1"), deps);
    expect(sixth).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    // the IP is exhausted for any username too
    const sameIp = await performLogin(creds("gar2"), deps);
    expect(sameIp).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    const other = await performLogin({ ...creds("gar2"), ip: "10.0.0.77" }, deps);
    expect(other.ok).toBe(true); // doğru şifre, farklı IP ve kullanıcı: sınırlanmaz
  });

  it("kullanıcı adı bazlı sınır: farklı IP'lerden 6. deneme RATE_LIMITED", async () => {
    await makeUser({ username: "kat.mr", roleCode: "R-KAT", hotelCode: "MR", passwordHash });
    const deps = makeDeps();
    for (const n of [1, 2, 3, 4, 5]) {
      const r = await performLogin({ ...creds("kat.mr", "yanlis"), ip: `${n}.${n}.${n}.${n}` }, deps);
      expect(r).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    }
    const sixth = await performLogin({ ...creds("kat.mr"), ip: "6.6.6.6" }, deps);
    expect(sixth).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    expect(deps.setCookie).not.toHaveBeenCalled();
    // other usernames from the new IP are unaffected, and resetRateLimit clears both maps
    const other = await performLogin({ ...creds("yok"), ip: "6.6.6.6" }, deps);
    expect(other).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    resetRateLimit();
    const after = await performLogin({ ...creds("kat.mr"), ip: "6.6.6.6" }, deps);
    expect(after.ok).toBe(true);
  });

  it("geçersiz girdi VALIDATION döner", async () => {
    const res = await performLogin({ username: "", password: "", ...ctx }, makeDeps());
    expect(res).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });

  it("Werkzeug hash'li kullanıcı girişte bcrypt'e yükseltilir", async () => {
    const hex = pbkdf2Sync(PASSWORD, "tuz", 1000, 32, "sha256").toString("hex");
    const user = await makeUser({
      username: "kat1",
      roleCode: "R-KAT",
      hotelCode: "MR",
      passwordHash: `pbkdf2:sha256:1000$tuz$${hex}`,
    });
    const res = await performLogin(creds("kat1"), makeDeps());
    expect(res.ok).toBe(true);
    const row = await testDb.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash.startsWith("$2")).toBe(true);
    // the upgraded hash keeps working
    const again = await performLogin({ ...creds("kat1"), ip: "10.0.0.50" }, makeDeps());
    expect(again.ok).toBe(true);
  });

  it("çoklu hedef: oturum açılmaz, next /secim, bekleyen çerez yazılır; seçimle oturum açılır", async () => {
    const user = await makeUser({
      username: "gar1",
      roleCode: "R-GAR",
      hotelCode: "MR",
      passwordHash,
    });
    const o1 = await makeOutlet("MR", "Havuz Bar", "BAR");
    const o2 = await makeOutlet("MR", "Ana Salon", "SALON");
    await addMember(user.id, o1.id);
    await addMember(user.id, o2.id);

    const deps = makeDeps();
    const res = await performLogin(creds("gar1"), deps);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.next).toBe("/secim");
    expect(res.data.targets).toHaveLength(2);
    expect(await testDb.userSession.count()).toBe(0);
    expect(deps.setCookie).toHaveBeenCalledWith(
      { userId: user.id, pendingTargets: true },
      { ttlSeconds: 300 },
    );

    const pickDeps = makeDeps();
    const pick = await performSelectTarget({ userId: user.id, targetIndex: 1, ...ctx }, pickDeps);
    expect(pick.ok).toBe(true);
    const session = await testDb.userSession.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.outletId).toBe(res.data.targets[1].outletId);
    expect(pickDeps.setCookie).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, sessionId: session.id, roleCode: "R-GAR" }),
    );
    if (pick.ok) expect(pick.data.next).toBe("/garson");
  });

  it("geçersiz hedef indeksi reddedilir ve oturum açılmaz", async () => {
    const user = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "MR" });
    const res = await performSelectTarget({ userId: user.id, targetIndex: 5, ...ctx }, makeDeps());
    expect(res).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await testDb.userSession.count()).toBe(0);
  });

  it("pasif kullanıcı hedef seçemez", async () => {
    const user = await makeUser({
      username: "kat1",
      roleCode: "R-KAT",
      hotelCode: "MR",
      isActive: false,
    });
    const res = await performSelectTarget({ userId: user.id, targetIndex: 0, ...ctx }, makeDeps());
    expect(res).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
  });

  it("pasif otelin hedefi listelenmez: tek hedef kalan kullanıcı doğrudan girer", async () => {
    const user = await makeUser({
      username: "dep1",
      roleCode: "R-DEP",
      extraHotelCodes: ["MR", "MRP"],
      passwordHash,
    });
    await testDb.hotel.update({ where: { code: "MRP" }, data: { isActive: false } });
    const res = await performLogin(creds("dep1"), makeDeps());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.targets.map((t) => t.hotelName)).toEqual(["Merit Royal"]);
    expect(res.data.next).toBe("/depo/havuz");
    const session = await testDb.userSession.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.hotelId).toBe(await hotelId("MR"));
  });

  it("hedef yok: next /secim, boş liste, oturum yok", async () => {
    await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "MR", passwordHash });
    await testDb.hotel.update({ where: { code: "MR" }, data: { isActive: false } });
    const res = await performLogin(creds("kat1"), makeDeps());
    expect(res).toEqual({ ok: true, data: { next: "/secim", targets: [] } });
    expect(await testDb.userSession.count()).toBe(0);
  });
});
