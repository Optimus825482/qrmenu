// Fixtures of the live-radar snapshot tests: two hotels (ROYAL, PREMIUM) with floors, rooms, ordering outlets with
// areas and tables, plus one request context per role under test.
import { randomUUID } from "node:crypto";
import type { Floor, Outlet, OutletTable, Room } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { testDb, truncate } from "./db";
import { ctxFor, hotelId, makeUser } from "./fixtures";
import { resetMinibarData } from "./minibarFixtures";
import { resetTestData } from "./fixtures";

export type RadarHotelWorld = {
  hotelId: string;
  code: string;
  floors: Floor[];
  rooms: Room[];
  outlets: { outlet: Outlet; areaId: string; tables: OutletTable[] }[];
};

export type RadarWorld = {
  royal: RadarHotelWorld;
  premium: RadarHotelWorld;
  diamondId: string;
  /** R-SYS across all three hotels. */
  sys: Ctx;
  /** R-OTM (YONETIM) of ROYAL only. */
  otmRoyal: Ctx;
  /** R-FBM (YONETIM) of ROYAL only. */
  fbmRoyal: Ctx;
  /** R-KAT (MINIBAR kind, no CR-RAD). */
  katRoyal: Ctx;
  /** Custom YONETIM role with CR-RAD but without MB-KAT view. */
  customNoKat: Ctx;
  /** Custom MINIBAR-kind role with CR-RAD and every layer gate: sees layers but never names. */
  floorWatcher: Ctx;
};

export type RadarWorldOptions = {
  /** Rooms per hotel (spread over floors of 4 rooms). Default 12. */
  rooms?: number;
  /** Tables per ordering outlet. Default 3. */
  tables?: number;
  /** Ordering outlets per hotel. Default 1. */
  outlets?: number;
};

/** Empties everything the radar tests create; reference data (hotels, roles, screens) stays. */
export async function resetRadarData(): Promise<void> {
  await resetMinibarData();
  await resetTestData();
  await truncate("operation_events", "user_sessions", "email_logs", "audit_logs");
  await testDb.outlet.deleteMany({ where: { name: { startsWith: "Radar RS" } } });
  await truncate("print_jobs");
  await testDb.printer.deleteMany();
  await testDb.setting.deleteMany({ where: { hotelId: { not: null } } });
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  await testDb.role.deleteMany({ where: { code: { startsWith: "T-RADAR-" } } });
}

const uniq = (p: string) => `${p}-${randomUUID().slice(0, 8)}`;

async function buildHotel(code: string, opts: Required<RadarWorldOptions>): Promise<RadarHotelWorld> {
  const hid = await hotelId(code);
  const floorCount = Math.max(1, Math.ceil(opts.rooms / 4));
  const floorsData = Array.from({ length: floorCount }, (_, i) => ({ hotelId: hid, number: i + 1, name: `Kat ${i + 1}` }));
  await testDb.floor.createMany({ data: floorsData });
  const floors = await testDb.floor.findMany({ where: { hotelId: hid }, orderBy: { number: "asc" } });
  await testDb.room.createMany({
    data: Array.from({ length: opts.rooms }, (_, i) => ({
      hotelId: hid,
      floorId: floors[Math.floor(i / 4)]!.id,
      number: String(100 * (Math.floor(i / 4) + 1) + (i % 4) + 1),
    })),
  });
  const rooms = await testDb.room.findMany({ where: { hotelId: hid }, orderBy: { number: "asc" } });

  const outlets: RadarHotelWorld["outlets"] = [];
  for (let o = 0; o < opts.outlets; o++) {
    const outlet = await testDb.outlet.create({
      data: { hotelId: hid, name: `Outlet ${o + 1} ${code}`, type: "SALON", hasMenu: true, hasOrdering: true, orderingEnabled: true },
    });
    const area = await testDb.outletAreaDefinition.create({ data: { outletId: outlet.id, type: "KAPALI" } });
    await testDb.outletTable.createMany({
      data: Array.from({ length: opts.tables }, (_, t) => ({
        outletId: outlet.id,
        areaId: area.id,
        label: `M${t + 1}`,
        number: t + 1,
      })),
    });
    const tables = await testDb.outletTable.findMany({ where: { outletId: outlet.id }, orderBy: { number: "asc" } });
    outlets.push({ outlet, areaId: area.id, tables });
  }
  return { hotelId: hid, code, floors, rooms, outlets };
}

/** A custom role: module access on every module, view+report on every screen except `exceptView`. */
async function customRole(kind: "YONETIM" | "MINIBAR", exceptView: string[]): Promise<string> {
  const role = await testDb.role.create({ data: { code: uniq("T-RADAR"), name: "Radar test rolü", kind } });
  for (const moduleKey of ["CORE", "MINIBAR", "QR_MENU", "QR_ORDER", "ROOM_SERVICE"] as const) {
    await testDb.roleModuleAccess.create({ data: { roleId: role.id, hotelId: null, moduleKey, enabled: true } });
  }
  const screens = await testDb.appScreen.findMany({ select: { id: true, code: true } });
  await testDb.roleScreenPermission.createMany({
    data: screens
      .filter((s) => !exceptView.includes(s.code))
      .map((s) => ({ roleId: role.id, screenId: s.id, hotelId: null, canView: true, canReport: true })),
  });
  return role.id;
}

export async function makeRadarWorld(opts: RadarWorldOptions = {}): Promise<RadarWorld> {
  const o: Required<RadarWorldOptions> = { rooms: opts.rooms ?? 12, tables: opts.tables ?? 3, outlets: opts.outlets ?? 1 };
  const royal = await buildHotel("ROYAL", o);
  const premium = await buildHotel("PREMIUM", o);
  const diamondId = await hotelId("DIAMOND");

  const sysUser = await makeUser({ username: uniq("sys"), roleCode: "R-SYS", hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND", "PREMIUM"] });
  const otmUser = await makeUser({ username: uniq("otm"), roleCode: "R-OTM", hotelCode: "ROYAL" });
  const fbmUser = await makeUser({ username: uniq("fbm"), roleCode: "R-FBM", hotelCode: "ROYAL" });
  const katUser = await makeUser({ username: uniq("kat"), roleCode: "R-KAT", hotelCode: "ROYAL" });

  const noKatRoleId = await customRole("YONETIM", ["MB-KAT"]);
  const noKatRole = await testDb.role.findUniqueOrThrow({ where: { id: noKatRoleId } });
  const noKatUser = await makeUser({ username: uniq("nokat"), roleCode: noKatRole.code, hotelCode: "ROYAL" });
  const watcherRoleId = await customRole("MINIBAR", []);
  const watcherRole = await testDb.role.findUniqueOrThrow({ where: { id: watcherRoleId } });
  const watcherUser = await makeUser({ username: uniq("watch"), roleCode: watcherRole.code, hotelCode: "ROYAL" });

  return {
    royal,
    premium,
    diamondId,
    sys: await ctxFor(sysUser, { hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND", "PREMIUM"] }),
    otmRoyal: await ctxFor(otmUser, { hotelCode: "ROYAL" }),
    fbmRoyal: await ctxFor(fbmUser, { hotelCode: "ROYAL" }),
    katRoyal: await ctxFor(katUser, { hotelCode: "ROYAL" }),
    customNoKat: await ctxFor(noKatUser, { hotelCode: "ROYAL" }),
    floorWatcher: await ctxFor(watcherUser, { hotelCode: "ROYAL" }),
  };
}
