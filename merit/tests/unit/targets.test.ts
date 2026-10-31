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

const { listTargets } = await import("@/modules/core/server/targets");

describe("listTargets (gerçek test DB)", () => {
  beforeAll(resetReferenceData);
  beforeEach(resetTestData);
  afterAll(async () => {
    await dropReferenceData();
    await testDb.$disconnect();
  });

  it("R-KAT kullanıcısı (otel MR) tek MINIBAR hedefi alır", async () => {
    const user = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "MR" });
    const targets = await listTargets(user.id);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      kind: "MINIBAR",
      hotelId: await hotelId("MR"),
      hotelName: "Merit Royal",
      label: "Minibar · Merit Royal",
      roleId: user.roleId,
    });
    expect(targets[0].outletId).toBeUndefined();
  });

  it("R-DEP (UserHotel MR, MRP) iki MINIBAR hedefi alır; User.hotelId ile birleşimde tekrar yok", async () => {
    const user = await makeUser({
      username: "dep1",
      roleCode: "R-DEP",
      extraHotelCodes: ["MR", "MRP"],
    });
    const targets = await listTargets(user.id);
    expect(targets.map((t) => t.kind)).toEqual(["MINIBAR", "MINIBAR"]);
    expect(targets.map((t) => t.hotelName).sort()).toEqual(["Merit Royal", "Merit Royal Premium"]);

    const both = await makeUser({
      username: "dep2",
      roleCode: "R-DEP",
      hotelCode: "MR",
      extraHotelCodes: ["MR", "MRP"],
    });
    expect(await listTargets(both.id)).toHaveLength(2);
  });

  it("R-GAR iki OutletMember için iki OUTLET hedefi alır", async () => {
    const user = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" });
    const o1 = await makeOutlet("MR", "Havuz Bar", "BAR");
    const o2 = await makeOutlet("MRP", "Ana Salon", "SALON");
    await addMember(user.id, o1.id);
    await addMember(user.id, o2.id);
    const targets = await listTargets(user.id);
    expect(targets).toHaveLength(2);
    expect(targets.every((t) => t.kind === "OUTLET")).toBe(true);
    expect(targets.map((t) => t.outletId).sort()).toEqual([o1.id, o2.id].sort());
    expect(targets.find((t) => t.outletId === o1.id)).toMatchObject({
      hotelId: await hotelId("MR"),
      hotelName: "Merit Royal",
      label: "Havuz Bar · Merit Royal",
      roleId: user.roleId,
    });
  });

  it("pasif OutletMember, pasif outlet ve pasif otel sayılmaz", async () => {
    const user = await makeUser({ username: "gar2", roleCode: "R-GAR", hotelCode: "MR" });
    const active = await makeOutlet("MR", "Aktif Bar", "BAR");
    const inactiveMember = await makeOutlet("MR", "Pasif Üye Bar", "BAR");
    const inactiveOutlet = await testDb.outlet.create({
      data: { hotelId: await hotelId("MR"), name: "Kapalı Bar", type: "BAR", isActive: false },
    });
    const inactiveHotelOutlet = await makeOutlet("MRP", "Pasif Otel Bar", "BAR");
    await addMember(user.id, active.id);
    await addMember(user.id, inactiveMember.id, false);
    await addMember(user.id, inactiveOutlet.id);
    await addMember(user.id, inactiveHotelOutlet.id);
    await testDb.hotel.update({ where: { code: "MRP" }, data: { isActive: false } });

    const targets = await listTargets(user.id);
    expect(targets.map((t) => t.outletId)).toEqual([active.id]);
  });

  it("pasif otel minibar hedeflerinden düşer", async () => {
    const user = await makeUser({
      username: "dep3",
      roleCode: "R-DEP",
      extraHotelCodes: ["MR", "MRP"],
    });
    await testDb.hotel.update({ where: { code: "MRP" }, data: { isActive: false } });
    const targets = await listTargets(user.id);
    expect(targets.map((t) => t.hotelName)).toEqual(["Merit Royal"]);
  });

  it("OutletMember.roleId hedefin rolünü geçersiz kılar", async () => {
    const user = await makeUser({ username: "gar3", roleCode: "R-GAR", hotelCode: "MR" });
    const sef = await testDb.role.findUniqueOrThrow({ where: { code: "R-SGF" } });
    const outlet = await makeOutlet("MR", "Salon", "SALON");
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
      hotelId: await hotelId("MRD"),
      hotelName: "Merit Royal Diamond",
      roleId: user.roleId,
    });
  });

  it("YONETIM rolü kendi oteliyle tek ADMIN hedefi alır", async () => {
    const user = await makeUser({ username: "otm1", roleCode: "R-OTM", hotelCode: "MR" });
    const targets = await listTargets(user.id);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ kind: "ADMIN", hotelId: await hotelId("MR") });
  });

  it("pasif kullanıcı ve bilinmeyen kullanıcı için boş liste", async () => {
    const user = await makeUser({
      username: "kat9",
      roleCode: "R-KAT",
      hotelCode: "MR",
      isActive: false,
    });
    expect(await listTargets(user.id)).toEqual([]);
    expect(await listTargets("yok")).toEqual([]);
  });

  it("OUTLET rolünde hiç üyelik yoksa boş liste", async () => {
    const user = await makeUser({ username: "gar9", roleCode: "R-GAR", hotelCode: "MR" });
    expect(await listTargets(user.id)).toEqual([]);
  });
});
