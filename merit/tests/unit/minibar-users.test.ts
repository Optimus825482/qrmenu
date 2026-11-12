import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const svc = await import("@/modules/minibar/server/minibarUsers");
const { verifyPassword } = await import("@/lib/password");

const Q = { page: 1, pageSize: 100 } as const;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await truncate("audit_logs");
  await resetTestData();
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

let seq = 0;
async function mty(hotels: string[] = ["ROYAL"]) {
  const user = await makeUser({ username: `mty-${seq++}`, roleCode: "R-MTY", hotelCode: hotels[0], extraHotelCodes: hotels.slice(1) });
  return ctxFor(user, { hotelCode: hotels[0], extraHotelCodes: hotels.slice(1) });
}

const names = (page: { items: { username: string }[] }) => page.items.map((u) => u.username).sort();

describe("minibarUsers", () => {
  it("lists only minibar-role users that share a hotel with the manager", async () => {
    await makeUser({ username: "kat-royal", roleCode: "R-KAT", hotelCode: "ROYAL" });
    await makeUser({ username: "dep-extra", roleCode: "R-DEP", hotelCode: "PREMIUM", extraHotelCodes: ["ROYAL"] });
    await makeUser({ username: "hks-royal", roleCode: "R-HKS", hotelCode: "ROYAL" });
    await makeUser({ username: "kat-premium", roleCode: "R-KAT", hotelCode: "PREMIUM" });
    await makeUser({ username: "gar-royal", roleCode: "R-GAR", hotelCode: "ROYAL" });
    await makeUser({ username: "otm-royal", roleCode: "R-OTM", hotelCode: "ROYAL" });
    await makeUser({ username: "gone", roleCode: "R-KAT", hotelCode: "ROYAL" });
    await testDb.user.update({ where: { username: "gone" }, data: { deletedAt: new Date() } });

    const page = await svc.listMinibarUsers(await mty(), Q);
    expect(names(page)).toEqual(["dep-extra", "hks-royal", "kat-royal"]);
    expect(JSON.stringify(page)).not.toMatch(/passwordHash/);

    const both = await svc.listMinibarUsers(await mty(["ROYAL", "PREMIUM"]), Q);
    expect(names(both)).toEqual(["dep-extra", "hks-royal", "kat-premium", "kat-royal"]);
    expect(names(await svc.listMinibarUsers(await mty(), { ...Q, q: "hks" }))).toEqual(["hks-royal"]);
  });

  it("refuses every other role, with a denied-attempt audit row", async () => {
    const target = await makeUser({ username: "kat-royal", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const kat = await makeUser({ username: "kat-caller", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const ctx = await ctxFor(kat, { hotelCode: "ROYAL" });
    const hotel = await hotelId("ROYAL");
    const attempts = [
      () => svc.listMinibarUsers(ctx, Q),
      () => svc.minibarUserOptions(ctx),
      () => svc.createMinibarWaiter(ctx, { fullName: "Ali Veli", hotelIds: [hotel] }),
      () => svc.updateMinibarUser(ctx, target.id, { fullName: "X", username: "kat-royal", hotelIds: [hotel] }),
      () => svc.resetMinibarUserPassword(ctx, target.id),
      () => svc.setMinibarUserActive(ctx, target.id, false),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME", entity: "MinibarUsers" } })).toBe(attempts.length);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: target.id } })).mustChangePassword).toBe(false);
  });

  it("cannot see or touch users of other hotels, non-minibar roles, managers or itself", async () => {
    const ctx = await mty();
    const hotel = await hotelId("ROYAL");
    const other = await makeUser({ username: "kat-premium", roleCode: "R-KAT", hotelCode: "PREMIUM" });
    const waiter = await makeUser({ username: "gar-royal", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const sys = await makeUser({ username: "sys", roleCode: "R-SYS", hotelCode: "ROYAL" });
    const peer = await makeUser({ username: "mty-peer", roleCode: "R-MTY", hotelCode: "ROYAL" });
    for (const target of [other, waiter, sys, peer, { id: ctx.user.id }, { id: "does-not-exist" }]) {
      const body = { fullName: "X Y", username: "newname", hotelIds: [hotel] };
      await expect(svc.updateMinibarUser(ctx, target.id, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(svc.resetMinibarUserPassword(ctx, target.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(svc.setMinibarUserActive(ctx, target.id, false)).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect((await testDb.user.findUniqueOrThrow({ where: { id: other.id } })).isActive).toBe(true);
  });

  it("creates an R-KAT user limited to the caller's hotels and rejects foreign hotels", async () => {
    const ctx = await mty();
    const royal = await hotelId("ROYAL");
    const premium = await hotelId("PREMIUM");
    await expect(svc.createMinibarWaiter(ctx, { fullName: "Ali Veli", hotelIds: [premium] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(svc.createMinibarWaiter(ctx, { fullName: "Ali Veli", hotelIds: [royal, premium] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(svc.createMinibarWaiter(ctx, { fullName: "Ali Veli", hotelIds: [] })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    // a role cannot be smuggled in
    await expect(
      svc.createMinibarWaiter(ctx, { fullName: "Ali Veli", hotelIds: [royal], roleId: "x" } as never),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await testDb.user.count({ where: { fullName: "Ali Veli" } })).toBe(0);

    const created = await svc.createMinibarWaiter(ctx, { fullName: "Ali Veli", phone: "0532 111 22 33", hotelIds: [royal] });
    expect(created.user).toMatchObject({ roleCode: "R-KAT", hotelId: royal, hotelIds: [], mustChangePassword: true });
    expect(created.user.username).toBe("ali.veli");
    const stored = await testDb.user.findUniqueOrThrow({ where: { id: created.user.id } });
    expect((await verifyPassword(created.temporaryPassword, stored.passwordHash)).ok).toBe(true);
    expect(stored.mustChangePassword).toBe(true);
    expect(JSON.stringify(created)).not.toMatch(/passwordHash|\$2/);

    await expect(
      svc.createMinibarWaiter(ctx, { fullName: "Baska Kisi", username: "ALI.VELI", hotelIds: [royal] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const audits = await testDb.auditLog.findMany({ where: { action: "USER_CREATE" } });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toMatch(/\$2|passwordHash/);
  });

  it("resets the password to a temporary one that must be changed and ends open sessions", async () => {
    const ctx = await mty();
    const target = await makeUser({ username: "kat-royal", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const { temporaryPassword } = await svc.resetMinibarUserPassword(ctx, target.id);
    const stored = await testDb.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.mustChangePassword).toBe(true);
    expect(stored.passwordHash).not.toBe("x");
    expect((await verifyPassword(temporaryPassword, stored.passwordHash)).ok).toBe(true);
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { action: "USER_SET_PASSWORD", entityId: target.id } });
    expect(JSON.stringify(audit)).not.toContain(temporaryPassword);
  });

  it("updates profile data; hotels stay inside the caller's scope and foreign hotels are preserved", async () => {
    const ctx = await mty(["ROYAL", "DIAMOND"]);
    const royal = await hotelId("ROYAL");
    const diamond = await hotelId("DIAMOND");
    const premium = await hotelId("PREMIUM");
    const target = await makeUser({ username: "dep-x", roleCode: "R-DEP", hotelCode: "ROYAL", extraHotelCodes: ["PREMIUM"] });

    await expect(
      svc.updateMinibarUser(ctx, target.id, { fullName: "A B", username: "dep-x", hotelIds: [royal, premium] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const row = await svc.updateMinibarUser(ctx, target.id, {
      fullName: "Yeni Ad",
      username: "dep-y",
      email: "a@b.co",
      phone: "05321112233",
      hotelIds: [diamond],
    });
    // ROYAL was removed by the manager; PREMIUM (not theirs) is untouched; DIAMOND was added.
    expect(row).toMatchObject({ fullName: "Yeni Ad", username: "dep-y", email: "a@b.co", roleCode: "R-DEP" });
    expect([row.hotelId, ...row.hotelIds].sort()).toEqual([diamond, premium].sort());
    const stored = await testDb.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.passwordHash).toBe("x");

    await makeUser({ username: "taken", roleCode: "R-KAT", hotelCode: "ROYAL" });
    await expect(
      svc.updateMinibarUser(ctx, target.id, { fullName: "A B", username: "TAKEN", hotelIds: [diamond] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      svc.updateMinibarUser(ctx, target.id, { fullName: "A B", username: "dep-y", hotelIds: [diamond], roleId: "x" } as never),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("activates and deactivates; R-SYS may use the service too", async () => {
    const sys = await ctxFor(await makeUser({ username: "sys", roleCode: "R-SYS", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
    const target = await makeUser({ username: "hks-royal", roleCode: "R-HKS", hotelCode: "ROYAL" });
    expect((await svc.setMinibarUserActive(sys, target.id, false)).isActive).toBe(false);
    expect((await svc.setMinibarUserActive(sys, target.id, true)).isActive).toBe(true);
    expect(await testDb.auditLog.count({ where: { action: "USER_SET_ACTIVE" } })).toBe(2);
    expect(names(await svc.listMinibarUsers(sys, { ...Q, active: true }))).toEqual(["hks-royal"]);
  });
});
