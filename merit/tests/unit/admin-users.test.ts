import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeOutlet,
  makeUser,
  resetReferenceData,
  resetTestData,
  roleByCode,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const users = await import("@/modules/core/server/admin/users");
const members = await import("@/modules/core/server/admin/members");
const { createSession } = await import("@/modules/core/server/sessions");
const { performLogin, resetRateLimit } = await import("@/modules/core/server/login");
const { listTargets } = await import("@/modules/core/server/targets");

const Q = { page: 1, pageSize: 100 } as const;
const GOOD = "Parola12345";
const TABLES = ["audit_logs", "outlet_tables"] as const;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await truncate(...TABLES);
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  resetRateLimit();
  publishMock.mockReset();
});
afterAll(async () => {
  await truncate(...TABLES);
  await dropReferenceData();
  await testDb.$disconnect();
});

async function sys() {
  const user = await makeUser({ username: "sys-admin", roleCode: "R-SYS", hotelCode: "MR" });
  return ctxFor(user, { hotelCode: "MR", extraHotelCodes: ["MRP", "MRD"] });
}

/** Hotel manager of MR. Seed already grants YONETIM CR-KUL V,O,D; reset so this test owns the flags. */
async function mgmt() {
  const role = await roleByCode("R-OTM");
  const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "CR-KUL" } });
  await testDb.roleScreenPermission.deleteMany({ where: { roleId: role.id, screenId: screen.id } });
  await testDb.roleScreenPermission.create({
    data: {
      roleId: role.id,
      screenId: screen.id,
      hotelId: null,
      canView: true,
      canCreate: true,
      canEdit: true,
      canApprove: false,
      canReport: false,
    },
  });
  const user = await makeUser({ username: "otm-mr", roleCode: "R-OTM", hotelCode: "MR" });
  return ctxFor(user, { hotelCode: "MR" });
}

async function newUser(ctx: Awaited<ReturnType<typeof sys>>, username: string, extra = {}) {
  const garson = await roleByCode("R-GAR");
  return users.create(ctx, {
    username,
    fullName: `Test ${username}`,
    roleId: garson.id,
    hotelId: await hotelId("MR"),
    hotelIds: [],
    password: GOOD,
    ...extra,
  });
}

describe("users: oluşturma ve güncelleme", () => {
  it("oluşturur (hash saklanır, satırda yok), listeler, günceller; audit + definition.changed bırakır", async () => {
    const ctx = await sys();
    const mrp = await hotelId("MRP");
    const created = await newUser(ctx, "test.garson", { hotelIds: [mrp] });
    expect(created).toMatchObject({
      username: "test.garson",
      roleCode: "R-GAR",
      isActive: true,
      hotelIds: [mrp],
    });
    expect(JSON.stringify(created)).not.toMatch(/passwordHash|\$2/);

    const stored = await testDb.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.passwordHash).not.toBe(GOOD);
    expect(stored.passwordHash.startsWith("$2")).toBe(true);
    expect(await testDb.userHotel.count({ where: { userId: created.id } })).toBe(1);

    const updated = await users.update(ctx, created.id, {
      username: "test.garson",
      fullName: "Yeni Ad",
      email: "a@b.co",
      roleId: created.roleId,
      hotelId: created.hotelId ?? undefined,
      hotelIds: [],
    });
    expect(updated).toMatchObject({ fullName: "Yeni Ad", email: "a@b.co", hotelIds: [] });
    expect(await testDb.userHotel.count({ where: { userId: created.id } })).toBe(0);
    // update never touches the password
    expect((await testDb.user.findUniqueOrThrow({ where: { id: created.id } })).passwordHash).toBe(
      stored.passwordHash,
    );

    const page = await users.list(ctx, { ...Q, q: "test.garson" });
    expect(page.items.map((u) => u.username)).toEqual(["test.garson"]);
    expect(JSON.stringify(page)).not.toMatch(/passwordHash/);

    const audits = await testDb.auditLog.findMany({
      where: { action: { startsWith: "USER_" } },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map((a) => a.action)).toEqual(["USER_CREATE", "USER_UPDATE"]);
    expect(JSON.stringify(audits)).not.toMatch(/\$2|passwordHash|Parola12345/);
    const events = publishMock.mock.calls
      .map((c) => c[0])
      .filter((e) => e.type === "definition.changed");
    expect(events.length).toBeGreaterThanOrEqual(2);
    for (const e of events) expect(e.payload).toMatchObject({ entity: "user", id: created.id });
  });

  it("zayıf şifre VALIDATION (alan hatası password); kayıt yazılmaz", async () => {
    const ctx = await sys();
    for (const password of ["kisa1A", "kucukharf12345", "BUYUKHARF12345", "HarfHarfHarfHarf"]) {
      await expect(newUser(ctx, "zayif", { password })).rejects.toMatchObject({
        code: "VALIDATION",
        fieldErrors: { password: expect.any(Array) },
      });
    }
    expect(await testDb.user.count({ where: { username: "zayif" } })).toBe(0);
  });

  it("aynı kullanıcı adı CONFLICT (Türkçe)", async () => {
    const ctx = await sys();
    await newUser(ctx, "ayni.kisi");
    await expect(newUser(ctx, "ayni.kisi")).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("kullanıcı adı"),
    });
  });

  it("SISTEM otelsiz (sistem kapsamı) kullanıcı açabilir; YONETIM açamaz", async () => {
    const ctx = await sys();
    const role = await roleByCode("R-ITT");
    const created = await users.create(ctx, {
      username: "itt.destek",
      fullName: "Destek",
      roleId: role.id,
      hotelIds: [],
      password: GOOD,
    });
    expect(created.hotelId).toBeNull();

    const m = await mgmt();
    const gar = await roleByCode("R-GAR");
    await expect(
      users.create(m, { username: "x.y", fullName: "X", roleId: gar.id, hotelIds: [], password: GOOD }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("users: YONETIM kapsamı", () => {
  it("R-SYS / R-ITT atamak FORBIDDEN; kapsam dışı otel FORBIDDEN; kapsamındaki rol serbest", async () => {
    const m = await mgmt();
    const mr = await hotelId("MR");
    const mrp = await hotelId("MRP");
    for (const code of ["R-SYS", "R-ITT"]) {
      const role = await roleByCode(code);
      await expect(
        users.create(m, {
          username: `x-${code}`,
          fullName: "X",
          roleId: role.id,
          hotelId: mr,
          hotelIds: [],
          password: GOOD,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    const gar = await roleByCode("R-GAR");
    await expect(
      users.create(m, { username: "disari", fullName: "X", roleId: gar.id, hotelId: mrp, hotelIds: [], password: GOOD }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      users.create(m, { username: "ek-otel", fullName: "X", roleId: gar.id, hotelId: mr, hotelIds: [mrp], password: GOOD }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await testDb.user.count({ where: { username: { in: ["disari", "ek-otel", "x-R-SYS", "x-R-ITT"] } } }),
    ).toBe(0);

    const ok = await users.create(m, { username: "ic.garson", fullName: "X", roleId: gar.id, hotelId: mr, hotelIds: [], password: GOOD });
    expect(ok.username).toBe("ic.garson");
  });

  it("yalnız kendi otellerine bağlı, SISTEM olmayan kullanıcıları görür ve yönetir", async () => {
    const s = await sys();
    const m = await mgmt();
    const mrp = await hotelId("MRP");
    const inside = await newUser(s, "mr.garson");
    const outside = await newUser(s, "mrp.garson", { hotelId: mrp });
    const shared = await newUser(s, "ortak.garson", { hotelIds: [mrp] });

    const seen = (await users.list(m, Q)).items.map((u) => u.username).sort();
    expect(seen).toEqual(["mr.garson", "ortak.garson", "otm-mr"]);

    await expect(users.setActive(m, outside.id, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // shared with a hotel outside the manager's scope: not manageable from here
    await expect(users.setPassword(m, shared.id, GOOD + "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const sysUser = await testDb.user.findUniqueOrThrow({ where: { username: "sys-admin" } });
    await expect(users.setActive(m, sysUser.id, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      users.update(m, inside.id, {
        username: "mr.garson",
        fullName: "Y",
        roleId: (await roleByCode("R-SYS")).id,
        hotelId: inside.hotelId ?? undefined,
        hotelIds: [],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(users.setActive(m, inside.id, false)).resolves.toMatchObject({ isActive: false });
  });

  it("hiyerarşi: YONETIM yönetici rolü atayamaz, başka yöneticiyi yönetemez; kendi şifresini değiştirir, kendi rol/otelini değiştiremez; SISTEM etkilenmez", async () => {
    const s = await sys();
    const m = await mgmt();
    const mr = await hotelId("MR");
    const mrp = await hotelId("MRP");
    const otm = await roleByCode("R-OTM");
    const gar = await roleByCode("R-GAR");

    await expect(
      users.create(m, { username: "yeni.mudur", fullName: "X", roleId: otm.id, hotelId: mr, hotelIds: [], password: GOOD }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.user.count({ where: { username: "yeni.mudur" } })).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBeGreaterThan(0);

    const other = await newUser(s, "baska.mudur", { roleId: otm.id });
    await expect(users.setPassword(m, other.id, GOOD + "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(users.setActive(m, other.id, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      users.update(m, other.id, { username: "baska.mudur", fullName: "Z", roleId: otm.id, hotelId: mr, hotelIds: [] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // YONETIM may promote nobody: assigning a manager role in update is refused too
    const low = await newUser(s, "alt.kisi");
    await expect(
      users.update(m, low.id, { username: "alt.kisi", fullName: "A", roleId: otm.id, hotelId: mr, hotelIds: [] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // self: password allowed; profile fields allowed; role / hotels not
    await expect(users.setPassword(m, m.user.id, "YeniSifre987")).resolves.toBeUndefined();
    await expect(
      users.update(m, m.user.id, { username: "otm-mr", fullName: "Yeni Ad", roleId: otm.id, hotelId: mr, hotelIds: [] }),
    ).resolves.toMatchObject({ fullName: "Yeni Ad" });
    await expect(
      users.update(m, m.user.id, { username: "otm-mr", fullName: "Yeni Ad", roleId: gar.id, hotelId: mr, hotelIds: [] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      users.update(m, m.user.id, { username: "otm-mr", fullName: "Yeni Ad", roleId: otm.id, hotelId: mr, hotelIds: [mrp] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      users.update(m, m.user.id, { username: "otm-mr", fullName: "Yeni Ad", roleId: otm.id, hotelId: mrp, hotelIds: [] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // SISTEM unaffected
    await expect(users.setPassword(s, other.id, GOOD + "y")).resolves.toBeUndefined();
    await expect(
      users.update(s, low.id, { username: "alt.kisi", fullName: "A", roleId: otm.id, hotelId: mr, hotelIds: [] }),
    ).resolves.toMatchObject({ roleCode: "R-OTM" });
  });

  it("R-GAR yetkisiz: list FORBIDDEN", async () => {
    const user = await makeUser({ username: "gar", roleCode: "R-GAR", hotelCode: "MR" });
    const ctx = await ctxFor(user, { hotelCode: "MR" });
    await expect(users.list(ctx, Q)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("users: pasife alma ve şifre belirleme oturumları kapatır", () => {
  async function openSession(userId: string, roleId: string) {
    return createSession({ userId, hotelId: await hotelId("MR"), roleId, ip: "10.0.0.1" });
  }

  it("setActive(false): açık oturum CIKTI/SISTEM, session.closed yayınlanır, audit; girişe izin yok; tekrar aktif edilebilir", async () => {
    const ctx = await sys();
    const user = await newUser(ctx, "pasif.olacak");
    const session = await openSession(user.id, user.roleId);
    publishMock.mockReset();

    const off = await users.setActive(ctx, user.id, false);
    expect(off.isActive).toBe(false);
    expect(await testDb.userSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({
      status: "CIKTI",
      logoutReason: "SISTEM",
    });
    const closed = publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === "session.closed");
    expect(closed).toHaveLength(1);
    expect(closed[0]).toMatchObject({ userIds: [user.id], payload: { sessionId: session.id } });
    expect(await testDb.auditLog.count({ where: { action: "USER_SET_ACTIVE", entityId: user.id } })).toBe(1);

    const login = await performLogin(
      { username: "pasif.olacak", password: GOOD, ip: "10.0.0.2", userAgent: "UA" },
      { setCookie: vi.fn(async () => {}) },
    );
    expect(login.ok).toBe(false);

    await expect(users.setActive(ctx, user.id, true)).resolves.toMatchObject({ isActive: true });
  });

  it("kendini pasife alamaz", async () => {
    const ctx = await sys();
    await expect(users.setActive(ctx, ctx.user.id, false)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("setPassword: eski oturum kapanır, eski şifre geçmez, yeni şifreyle performLogin başarılı; hash sızmaz", async () => {
    const ctx = await sys();
    const user = await newUser(ctx, "sifre.degis");
    const session = await openSession(user.id, user.roleId);
    publishMock.mockReset();

    const NEW = "YeniSifre987";
    await expect(users.setPassword(ctx, user.id, "zayif")).rejects.toMatchObject({ code: "VALIDATION" });
    await users.setPassword(ctx, user.id, NEW);

    expect(await testDb.userSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({
      status: "CIKTI",
      logoutReason: "SISTEM",
    });
    expect(publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === "session.closed")).toHaveLength(1);
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { action: "USER_SET_PASSWORD" } });
    expect(JSON.stringify(audit)).not.toMatch(/\$2|YeniSifre987/);

    const deps = { setCookie: vi.fn(async () => {}) };
    const bad = await performLogin({ username: "sifre.degis", password: GOOD, ip: "10.0.0.3", userAgent: "UA" }, deps);
    expect(bad.ok).toBe(false);
    const good = await performLogin({ username: "sifre.degis", password: NEW, ip: "10.0.0.4", userAgent: "UA" }, deps);
    expect(good.ok).toBe(true);
  });
});

describe("members", () => {
  async function setup() {
    const ctx = await sys();
    const outlet = await makeOutlet("MR", "Havuz Bar", "BAR");
    const user = await newUser(ctx, "uye.garson");
    return { ctx, outlet, user };
  }

  it("assign / list / setActive / remove: audit + definition.changed(member); listTargets yeni üyeliği gösterir", async () => {
    const { ctx, outlet, user } = await setup();
    publishMock.mockReset();

    const row = await members.assign(ctx, { userId: user.id, outletId: outlet.id });
    expect(row).toMatchObject({ userId: user.id, outletId: outlet.id, isActive: true });
    const targets = await listTargets(user.id);
    expect(targets.some((t) => t.outletId === outlet.id)).toBe(true);

    const page = await members.list(ctx, outlet.id, Q);
    expect(page.items.map((m) => m.username)).toEqual(["uye.garson"]);

    await members.setActive(ctx, row.id, false);
    expect((await listTargets(user.id)).some((t) => t.outletId === outlet.id)).toBe(false);
    await members.setActive(ctx, row.id, true);
    await members.remove(ctx, row.id);
    expect(await testDb.outletMember.count({ where: { outletId: outlet.id } })).toBe(0);

    const actions = (
      await testDb.auditLog.findMany({ where: { action: { startsWith: "MEMBER_" } }, orderBy: { createdAt: "asc" } })
    ).map((a) => a.action);
    expect(actions).toEqual(["MEMBER_ASSIGN", "MEMBER_SET_ACTIVE", "MEMBER_SET_ACTIVE", "MEMBER_REMOVE"]);
    const events = publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === "definition.changed");
    expect(events).toHaveLength(4);
    for (const e of events) expect(e.payload).toMatchObject({ entity: "member", id: row.id });
  });

  it("rol override: MINIBAR rolü VALIDATION; OUTLET rolü kabul; aynı kullanıcı ikinci kez CONFLICT", async () => {
    const { ctx, outlet, user } = await setup();
    const kat = await roleByCode("R-KAT");
    await expect(
      members.assign(ctx, { userId: user.id, outletId: outlet.id, roleId: kat.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await testDb.outletMember.count()).toBe(0);

    const sef = await roleByCode("R-SGF");
    const row = await members.assign(ctx, { userId: user.id, outletId: outlet.id, roleId: sef.id });
    expect(row.roleId).toBe(sef.id);
    await expect(members.assign(ctx, { userId: user.id, outletId: outlet.id })).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("zaten"),
    });
  });

  it("YONETIM kendi otelinin outletine atar; başka otelin outletine FORBIDDEN", async () => {
    const { outlet, user } = await setup();
    const m = await mgmt();
    const row = await members.assign(m, { userId: user.id, outletId: outlet.id });
    expect(row.outletId).toBe(outlet.id);

    const other = await makeOutlet("MRP", "Premium Bar", "BAR");
    await expect(members.assign(m, { userId: user.id, outletId: other.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
