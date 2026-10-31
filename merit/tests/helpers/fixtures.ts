import type { OutletType } from "@/generated/prisma/client";
import { runSeed } from "../../prisma/seed";
import { testDb, truncate } from "./db";

/** Empties and re-seeds the reference data (hotels, roles, screens, settings). Call once per file. */
export async function resetReferenceData(): Promise<void> {
  await truncate("hotels", "roles", "app_screens", "settings", "users");
  await runSeed(testDb);
}

/** Removes everything a test creates (users and what hangs off them, extra outlets) and reactivates hotels. */
export async function resetTestData(): Promise<void> {
  await truncate("users");
  await testDb.outlet.deleteMany({ where: { type: { not: "ODA_SERVISI" } } });
  await testDb.hotel.updateMany({ data: { isActive: true } });
}

export async function dropReferenceData(): Promise<void> {
  await truncate("hotels", "roles", "app_screens", "settings", "users");
}

export async function hotelId(code: string): Promise<string> {
  return (await testDb.hotel.findUniqueOrThrow({ where: { code } })).id;
}

export async function roleByCode(code: string) {
  return testDb.role.findUniqueOrThrow({ where: { code } });
}

export async function makeUser(opts: {
  username: string;
  roleCode: string;
  hotelCode?: string;
  extraHotelCodes?: string[];
  passwordHash?: string;
  isActive?: boolean;
}) {
  const role = await roleByCode(opts.roleCode);
  const user = await testDb.user.create({
    data: {
      username: opts.username,
      passwordHash: opts.passwordHash ?? "x",
      fullName: `Test ${opts.username}`,
      roleId: role.id,
      hotelId: opts.hotelCode ? await hotelId(opts.hotelCode) : null,
      isActive: opts.isActive ?? true,
    },
  });
  for (const code of opts.extraHotelCodes ?? []) {
    await testDb.userHotel.create({ data: { userId: user.id, hotelId: await hotelId(code) } });
  }
  return user;
}

export async function makeOutlet(hotelCode: string, name: string, type: OutletType = "SALON") {
  return testDb.outlet.create({ data: { hotelId: await hotelId(hotelCode), name, type } });
}

export async function addMember(userId: string, outletId: string, isActive = true) {
  return testDb.outletMember.create({ data: { userId, outletId, isActive } });
}
