import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import {
  addMember,
  ctxFor,
  dropReferenceData,
  hotelId,
  makeOutlet,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { ensureRoomServiceMembership } = await import("@/modules/core/server/roomServiceTeam");
const { listTargets } = await import("@/modules/core/server/targets");
const members = await import("@/modules/core/server/admin/members");

/** The room-service outlet the reference data gives the hotel. */
async function roomServiceOutlet(hotelCode: string) {
  return testDb.outlet.findFirstOrThrow({ where: { hotelId: await hotelId(hotelCode), type: "ODA_SERVISI" } });
}

const ensure = (userId: string, actorId?: string) =>
  testDb.$transaction((tx) => ensureRoomServiceMembership(tx, userId, actorId));

describe("ensureRoomServiceMembership (gerçek test DB)", () => {
  beforeAll(resetReferenceData);
  beforeEach(resetTestData);
  afterAll(async () => {
    await dropReferenceData();
    await testDb.$disconnect();
  });

  it("ekibi olmayan oda servisi kullanıcısı otelin oda servisi ekibine eklenir ve giriş hedefi kazanır", async () => {
    const rs = await roomServiceOutlet("ROYAL");
    const user = await makeUser({ username: "ods1", roleCode: "R-ODS", hotelCode: "ROYAL" });
    expect(await listTargets(user.id)).toHaveLength(0);

    const admin = await makeUser({ username: "yonetici1", roleCode: "R-FBM", hotelCode: "ROYAL" });
    expect(await ensure(user.id, admin.id)).toEqual([rs.id]);

    const member = await testDb.outletMember.findUniqueOrThrow({ where: { userId_outletId: { userId: user.id, outletId: rs.id } } });
    expect(member).toMatchObject({ isActive: true, roleId: null });
    const targets = await listTargets(user.id);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ kind: "OUTLET", outletId: rs.id, hotelId: await hotelId("ROYAL") });
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "MEMBER_ASSIGN", entityId: member.id } });
    expect(log.userId).toBe(admin.id);
    expect(log.after).toMatchObject({ auto: "ROOM_SERVICE" });
  });

  it("ikinci çağrı bir şey eklemez", async () => {
    const user = await makeUser({ username: "ods2", roleCode: "R-ODS", hotelCode: "ROYAL" });
    expect(await ensure(user.id)).toHaveLength(1);
    expect(await ensure(user.id)).toEqual([]);
    expect(await testDb.outletMember.count({ where: { userId: user.id } })).toBe(1);
  });

  it("otelde zaten bir ekip üyeliği olan kullanıcıya dokunmaz (pasif üyelik dahil)", async () => {
    const bar = await makeOutlet("ROYAL", "Havuz Bar", "BAR");
    const user = await makeUser({ username: "ods3", roleCode: "R-ODS", hotelCode: "ROYAL" });
    await addMember(user.id, bar.id, false);
    expect(await ensure(user.id)).toEqual([]);
    expect(await testDb.outletMember.count({ where: { userId: user.id } })).toBe(1);
  });

  it("yöneticinin ekipten çıkardığı kullanıcı girişte ya da kayıtta yeniden eklenmez", async () => {
    const rs = await roomServiceOutlet("ROYAL");
    const admin = await makeUser({ username: "yonetici2", roleCode: "R-SYS" });
    const user = await makeUser({ username: "ods5", roleCode: "R-ODS", hotelCode: "ROYAL" });
    expect(await ensure(user.id)).toEqual([rs.id]);
    const member = await testDb.outletMember.findFirstOrThrow({ where: { userId: user.id } });
    await members.remove(await ctxFor(admin, { hotelCode: "ROYAL" }), member.id);
    expect(await testDb.outletMember.count({ where: { userId: user.id } })).toBe(0);

    expect(await ensure(user.id)).toEqual([]);
    expect(await listTargets(user.id)).toHaveLength(0);
  });

  it("oda servisi ekranı olmayan garson ve minibar rolleri eklenmez", async () => {
    const waiter = await makeUser({ username: "gar9", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const floor = await makeUser({ username: "kat9", roleCode: "R-KAT", hotelCode: "ROYAL" });
    expect(await ensure(waiter.id)).toEqual([]);
    expect(await ensure(floor.id)).toEqual([]);
    expect(await testDb.outletMember.count()).toBe(0);
  });

  it("oda servisi modülü otelde kapalıysa ya da outlet pasifse eklenmez", async () => {
    const rs = await roomServiceOutlet("ROYAL");
    const user = await makeUser({ username: "ods4", roleCode: "R-ODS", hotelCode: "ROYAL" });
    await testDb.outlet.update({ where: { id: rs.id }, data: { isActive: false } });
    expect(await ensure(user.id)).toEqual([]);
    await testDb.outlet.update({ where: { id: rs.id }, data: { isActive: true } });
    const royal = await hotelId("ROYAL");
    await testDb.hotelModule.updateMany({ where: { hotelId: royal, moduleKey: "ROOM_SERVICE" }, data: { enabled: false } });
    expect(await ensure(user.id)).toEqual([]);
    await testDb.hotelModule.updateMany({ where: { hotelId: royal, moduleKey: "ROOM_SERVICE" }, data: { enabled: true } });
    expect(await ensure(user.id)).toEqual([rs.id]);
  });
});
