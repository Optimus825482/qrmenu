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
  roleByCode,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { usersEntitledTo } = await import("@/modules/core/server/entitlements");

beforeAll(resetReferenceData);
beforeEach(resetTestData);
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("usersEntitledTo: üye override'ı", () => {
  it("temel kapsamdaki otelde override varsa yalnız override rolü sayılır", async () => {
    const mr = await hotelId("ROYAL");
    const outlet = await makeOutlet("ROYAL", "Havuz Bar", "BAR");
    const gar = await roleByCode("R-GAR");
    // Base role R-SGF with base hotel MR, but at the MR outlet acts as R-GAR.
    const demoted = await makeUser({ username: "sef.dusuk", roleCode: "R-SGF", hotelCode: "ROYAL" });
    await testDb.outletMember.create({
      data: { userId: demoted.id, outletId: outlet.id, roleId: gar.id },
    });

    expect(await usersEntitledTo(mr, ["R-SGF"])).toEqual([]);
    expect(await usersEntitledTo(mr, ["R-GAR"])).toEqual([demoted.id]);
  });

  it("override yükseltme: temel rol R-GAR, üyelikte R-SGF; temel rolle artık sayılmaz", async () => {
    const mr = await hotelId("ROYAL");
    const outlet = await makeOutlet("ROYAL", "Havuz Bar", "BAR");
    const sgf = await roleByCode("R-SGF");
    const promoted = await makeUser({ username: "gar.sef", roleCode: "R-GAR", hotelCode: "ROYAL" });
    await testDb.outletMember.create({
      data: { userId: promoted.id, outletId: outlet.id, roleId: sgf.id },
    });

    expect(await usersEntitledTo(mr, ["R-SGF"])).toEqual([promoted.id]);
    expect(await usersEntitledTo(mr, ["R-GAR"])).toEqual([]);
  });

  it("override'sız üyelik temel rolü korur; pasif üyelik veya pasif outlet override'ı devre dışı bırakır", async () => {
    const mr = await hotelId("ROYAL");
    const outlet = await makeOutlet("ROYAL", "Salon", "SALON");
    const gar = await roleByCode("R-GAR");

    const plain = await makeUser({ username: "sef.duz", roleCode: "R-SGF", hotelCode: "ROYAL" });
    await addMember(plain.id, outlet.id);

    const inactiveMember = await makeUser({ username: "sef.pasif", roleCode: "R-SGF", hotelCode: "ROYAL" });
    await testDb.outletMember.create({
      data: { userId: inactiveMember.id, outletId: outlet.id, roleId: gar.id, isActive: false },
    });

    const closed = await makeOutlet("ROYAL", "Kapalı", "BAR");
    await testDb.outlet.update({ where: { id: closed.id }, data: { isActive: false } });
    const inClosed = await makeUser({ username: "sef.kapali", roleCode: "R-SGF", hotelCode: "ROYAL" });
    await testDb.outletMember.create({
      data: { userId: inClosed.id, outletId: closed.id, roleId: gar.id },
    });

    expect((await usersEntitledTo(mr, ["R-SGF"])).sort()).toEqual(
      [plain.id, inactiveMember.id, inClosed.id].sort(),
    );
    expect(await usersEntitledTo(mr, ["R-GAR"])).toEqual([]);
  });

  it("başka otelin override'ı bu oteldeki temel hakkı etkilemez", async () => {
    const mr = await hotelId("ROYAL");
    const other = await makeOutlet("PREMIUM", "Plaj Bar", "BAR");
    const gar = await roleByCode("R-GAR");
    const user = await makeUser({
      username: "sef.iki",
      roleCode: "R-SGF",
      hotelCode: "ROYAL",
      extraHotelCodes: ["PREMIUM"],
    });
    await testDb.outletMember.create({
      data: { userId: user.id, outletId: other.id, roleId: gar.id },
    });

    expect(await usersEntitledTo(mr, ["R-SGF"])).toEqual([user.id]);
    expect(await usersEntitledTo(await hotelId("PREMIUM"), ["R-SGF"])).toEqual([]);
    expect(await usersEntitledTo(await hotelId("PREMIUM"), ["R-GAR"])).toEqual([user.id]);
  });
});
