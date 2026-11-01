import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const { listTargets } = await import("@/modules/core/server/targets");

describe("listTargets (gerçek test DB)", () => {
  beforeAll(resetReferenceData);
  beforeEach(resetTestData);
  afterAll(async () => {
    await dropReferenceData();
    await testDb.$disconnect();
  });

  it("R-KAT kullanıcısı (otel MR) tek MINIBAR hedefi alır", async () => {
    const user = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const targets = await listTargets(user.id);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      kind: "MINIBAR",
      hotelId: await hotelId("ROYAL"),
      hotelName: "Merit Royal",
      label: "Minibar · Merit Royal",
      roleId: user.roleId,
    });
    expect(targets[0].outletId).toBeUndefined();
  });

  it("R-DEP (UserHotel MR, PREMIUM) iki MINIBAR hedefi alır; User.hotelId ile birleşimde tekrar yok", async () => {
    const user = await makeUser({
      username: "dep1",
      roleCode: "R-DEP",
      extraHotelCodes: ["ROYAL", "PREMIUM"],
    });
    const targets = await listTargets(user.id);
    expect(targets.map((t) => t.kind)).toEqual(["MINIBAR", "MINIBAR"]);
    expect(targets.map((t) => t.hotelName).sort()).toEqual(["Merit Royal", "Merit Royal Premium"]);

    const both = await makeUser({
      username: "dep2",
      roleCode: "R-DEP",
      hotelCode: "ROYAL",
      extraHotelCodes: ["ROYAL", "PREMIUM"],
    });
    expect(await listTargets(both.id)).toHaveLength(2);
  });

  it("R-GAR iki OutletMember için iki OUTLET hedefi alır", async () => {
    const user = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const o1 = await makeOutlet("ROYAL", "Havuz Bar", "BAR");
    const o2 = await makeOutlet("PREMIUM", "Ana Salon", "SALON");
    await addMember(user.id, o1.id);
    await addMember(user.id, o2.id);
    const targets = await listTargets(user.id);
    expect(targets).toHaveLength(2);
    expect(targets.every((t) => t.kind === "OUTLET")).toBe(true);
    expect(targets.map((t) => t.outletId).sort()).toEqual([o1.id, o2.id].sort());
    expect(targets.find((t) => t.outletId === o1.id)).toMatchObject({
      hotelId: await hotelId("ROYAL"),
      hotelName: "Merit Royal",
      label: "Havuz Bar · Merit Royal",
      roleId: user.roleId,
    });
  });

  it("pasif OutletMember, pasif outlet ve pasif otel sayılmaz", async () => {
    const user = await makeUser({ username: "gar2", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const active = await makeOutlet("ROYAL", "Aktif Bar", "BAR");
    const inactiveMember = await makeOutlet("ROYAL", "Pasif Üye Bar", "BAR");
    const inactiveOutlet = await testDb.outlet.create({
      data: { hotelId: await hotelId("ROYAL"), name: "Kapalı Bar", type: "BAR", isActive: false },
    });
    const inactiveHotelOutlet = await makeOutlet("PREMIUM", "Pasif Otel Bar", "BAR");
    await addMember(user.id, active.id);
    await addMember(user.id, inactiveMember.id, false);
    await addMember(user.id, inactiveOutlet.id);
    await addMember(user.id, inactiveHotelOutlet.id);
    await testDb.hotel.update({ where: { code: "PREMIUM" }, data: { isActive: false } });

    const targets = await listTargets(user.id);
    expect(targets.map((t) => t.outletId)).toEqual([active.id]);
  });

  it("pasif otel minibar hedeflerinden düşer", async () => {
    const user = await makeUser({
      username: "dep3",
      roleCode: "R-DEP",
      extraHotelCodes: ["ROYAL", "PREMIUM"],
    });
    await testDb.hotel.update({ where: { code: "PREMIUM" }, data: { isActive: false } });
    const targets = await listTargets(user.id);
    expect(targets.map((t) => t.hotelName)).toEqual(["Merit Royal"]);
  });

  it("OutletMember.roleId hedefin rolünü geçersiz kılar", async () => {
    const user = await makeUser({ username: "gar3", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const sef = await testDb.role.findUniqueOrThrow({ where: { code: "R-SGF" } });
    const outlet = await makeOutlet("ROYAL", "Salon", "SALON");
    await testDb.outletMember.create({
      data: { userId: user.id, outletId: outlet.id, roleId: sef.id },
    });
    const [target] = await listTargets(user.id);
    expect(target.roleId).toBe(sef.id);
  });

  it("R-SYS tek ADMIN hedefi alır (ilk sistem oteli)", async () => {
    const user = await makeUser({ username: "sys1", roleCode: "R-SYS" });
    const targets = await listTargets(user.id);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      kind: "ADMIN",
      hotelId: await hotelId("DIAMOND"),
      hotelName: "Merit Royal Diamond",
      roleId: user.roleId,
    });
  });

  it("YONETIM rolü kendi oteliyle tek ADMIN hedefi alır", async () => {
    const user = await makeUser({ username: "otm1", roleCode: "R-OTM", hotelCode: "ROYAL" });
    const targets = await listTargets(user.id);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ kind: "ADMIN", hotelId: await hotelId("ROYAL") });
  });

  it("pasif kullanıcı ve bilinmeyen kullanıcı için boş liste", async () => {
    const user = await makeUser({
      username: "kat9",
      roleCode: "R-KAT",
      hotelCode: "ROYAL",
      isActive: false,
    });
    expect(await listTargets(user.id)).toEqual([]);
    expect(await listTargets("yok")).toEqual([]);
  });

  describe("modül kapıları", () => {
    async function setHotelModule(
      hotelCode: string,
      moduleKey: "MINIBAR" | "QR_MENU" | "QR_ORDER" | "ROOM_SERVICE",
      enabled: boolean,
    ) {
      await testDb.hotelModule.update({
        where: { hotelId_moduleKey: { hotelId: await hotelId(hotelCode), moduleKey } },
        data: { enabled },
      });
    }
    afterEach(async () => {
      await testDb.hotelModule.updateMany({ data: { enabled: true } });
      await testDb.roleModuleAccess.deleteMany({ where: { hotelId: { not: null } } });
      await testDb.roleModuleAccess.updateMany({ data: { enabled: true } });
    });

    it("HotelModule(MR, MINIBAR) kapalıysa kat.mr MINIBAR hedefi düşer", async () => {
      const user = await makeUser({ username: "kat.mr", roleCode: "R-KAT", hotelCode: "ROYAL" });
      await setHotelModule("ROYAL", "MINIBAR", false);
      expect(await listTargets(user.id)).toEqual([]);
    });

    it("RoleModuleAccess otel satırı kapalıysa yalnız o otelin MINIBAR hedefi düşer", async () => {
      const user = await makeUser({
        username: "dep4",
        roleCode: "R-DEP",
        extraHotelCodes: ["ROYAL", "PREMIUM"],
      });
      await testDb.roleModuleAccess.create({
        data: {
          roleId: user.roleId,
          hotelId: await hotelId("PREMIUM"),
          moduleKey: "MINIBAR",
          enabled: false,
        },
      });
      const targets = await listTargets(user.id);
      expect(targets.map((t) => t.hotelName)).toEqual(["Merit Royal"]);
    });

    it("sistem geneli RoleModuleAccess(MINIBAR) kapalıysa MINIBAR hedefi yok", async () => {
      const user = await makeUser({ username: "kat4", roleCode: "R-KAT", hotelCode: "ROYAL" });
      await testDb.roleModuleAccess.updateMany({
        where: { roleId: user.roleId, hotelId: null, moduleKey: "MINIBAR" },
        data: { enabled: false },
      });
      expect(await listTargets(user.id)).toEqual([]);
    });

    it("outlet hedefi: açık en az bir modül yeter; outletin tüm modülleri kapalıysa düşer", async () => {
      const user = await makeUser({ username: "gar4", roleCode: "R-GAR", hotelCode: "ROYAL" });
      const outlet = await testDb.outlet.create({
        data: {
          hotelId: await hotelId("ROYAL"),
          name: "Sipariş Bar",
          type: "BAR",
          hasMenu: true,
          hasOrdering: true,
        },
      });
      await addMember(user.id, outlet.id);
      await setHotelModule("ROYAL", "QR_MENU", false);
      expect((await listTargets(user.id)).map((t) => t.outletId)).toEqual([outlet.id]);
      await setHotelModule("ROYAL", "QR_ORDER", false);
      expect(await listTargets(user.id)).toEqual([]);
    });

    it("outlet hedefi etkin rolün modül erişimine bakar (R-ODS QR_MENU outletine giremez)", async () => {
      const user = await makeUser({ username: "ods1", roleCode: "R-ODS", hotelCode: "ROYAL" });
      const salon = await makeOutlet("ROYAL", "Salon", "SALON"); // hasMenu only → QR_MENU
      const roomService = await testDb.outlet.findFirstOrThrow({
        where: { hotelId: await hotelId("ROYAL"), type: "ODA_SERVISI" },
      });
      await addMember(user.id, salon.id);
      await addMember(user.id, roomService.id);
      expect((await listTargets(user.id)).map((t) => t.outletId)).toEqual([roomService.id]);

      // A membership role override with QR_MENU access opens the salon.
      const gar = await testDb.role.findUniqueOrThrow({ where: { code: "R-GAR" } });
      await testDb.outletMember.updateMany({
        where: { userId: user.id, outletId: salon.id },
        data: { roleId: gar.id },
      });
      expect((await listTargets(user.id)).map((t) => t.outletId).sort()).toEqual(
        [roomService.id, salon.id].sort(),
      );
    });

    it("ODA_SERVISI outleti ROOM_SERVICE modülüne bağlıdır", async () => {
      const user = await makeUser({ username: "ods2", roleCode: "R-ODS", hotelCode: "ROYAL" });
      const roomService = await testDb.outlet.findFirstOrThrow({
        where: { hotelId: await hotelId("ROYAL"), type: "ODA_SERVISI" },
      });
      await addMember(user.id, roomService.id);
      await setHotelModule("ROYAL", "ROOM_SERVICE", false);
      expect(await listTargets(user.id)).toEqual([]);
    });
  });

  it("OUTLET rolünde hiç üyelik yoksa boş liste", async () => {
    const user = await makeUser({ username: "gar9", roleCode: "R-GAR", hotelCode: "ROYAL" });
    expect(await listTargets(user.id)).toEqual([]);
  });
});
