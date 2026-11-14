import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES, actionsFor } from "../../prisma/seed/roles";
import { buildNav } from "@/components/staff/navModel";
import { businessDate, businessDay } from "@/lib/time";
import { screenForPath } from "@/modules/core/screenPaths";
import { SCREENS } from "@/modules/core/screens";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { floorWatch, pickFloorWatchHotel } = await import("@/modules/minibar/server/floorWatch");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.roomCheck.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const NOW = new Date("2026-03-10T12:00:00+02:00");

async function room(hotelCode: string, number: string) {
  const hid = await hotelId(hotelCode);
  const floor =
    (await testDb.floor.findFirst({ where: { hotelId: hid, number: 1 } })) ??
    (await testDb.floor.create({ data: { hotelId: hid, name: "1. KAT", number: 1 } }));
  return (
    (await testDb.room.findFirst({ where: { hotelId: hid, number } })) ??
    (await testDb.room.create({ data: { hotelId: hid, floorId: floor.id, number, isActive: true } }))
  );
}

async function viewer(roleCode: string, username = "izleyen") {
  const user = await makeUser({ username, roleCode, hotelCode: "ROYAL" });
  return ctxFor(user, { hotelCode: "ROYAL" });
}

async function check(roomId: string, userId: string, endedAt: Date) {
  return testDb.roomCheck.create({
    data: { roomId, userId, checkDate: businessDay(businessDate(NOW)), startedAt: new Date(endedAt.getTime() - 60_000), endedAt, type: "SARFIYAT_YOK" },
  });
}

const roomOf = (data: Awaited<ReturnType<typeof floorWatch.get>>, roomId: string) =>
  data.floors.flatMap((f) => f.rooms).find((r) => r.roomId === roomId);

describe("Minibar Takip (RO-MBT): okuma", () => {
  it("oda servisi personeli kontrol saatini ve kontrol edenin adını görür", async () => {
    const r = await room("ROYAL", "9101");
    const kat = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const endedAt = new Date("2026-03-10T10:15:00+02:00");
    await check(r.id, kat.id, endedAt);

    const data = await floorWatch.get(await viewer("R-ODS"), undefined, NOW);
    expect(data.hotel.code).toBe("ROYAL");
    expect(data.day).toBe("2026-03-10");
    const cell = roomOf(data, r.id);
    expect(cell?.checkedToday).toEqual({ type: "SARFIYAT_YOK", at: endedAt.toISOString(), userId: kat.id });
    // R-ODS is an OUTLET role: the radar hides names from it, this page shows them on purpose.
    expect(data.people[kat.id]).toBe(kat.fullName);
    expect(data.staff.map((s) => s.userId)).toEqual([kat.id]);
  });

  it("oturum oteli dışındaki oteli de açar (kod ya da id ile), bilinmeyen değer oturum otelidir", async () => {
    const other = await room("DIAMOND", "9201");
    const ctx = await viewer("R-ODS");
    expect(ctx.hotelIds).not.toContain(other.hotelId);

    const byCode = await floorWatch.get(ctx, "DIAMOND", NOW);
    expect(byCode.hotel.code).toBe("DIAMOND");
    expect(roomOf(byCode, other.id)?.number).toBe("9201");
    expect((await floorWatch.get(ctx, other.hotelId, NOW)).hotel.code).toBe("DIAMOND");
    expect((await floorWatch.get(ctx, "YOK", NOW)).hotel.code).toBe("ROYAL");
    expect(byCode.hotels.map((h) => h.code)).toEqual(expect.arrayContaining(["ROYAL", "DIAMOND"]));
  });

  it("minibar modülü kapalı ya da pasif otel listede yoktur", async () => {
    const diamond = await hotelId("DIAMOND");
    await testDb.hotelModule.updateMany({ where: { hotelId: diamond, moduleKey: "MINIBAR" }, data: { enabled: false } });
    const ctx = await viewer("R-ODS");
    const data = await floorWatch.get(ctx, "DIAMOND", NOW);
    expect(data.hotel.code).toBe("ROYAL");
    expect(data.hotels.map((h) => h.code)).not.toContain("DIAMOND");
  });

  it("RO-MBT yetkisi olmayan rol FORBIDDEN alır", async () => {
    await expect(floorWatch.get(await viewer("R-GAR"), undefined, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(floorWatch.get(await viewer("R-KAT", "kat2"), undefined, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Minibar Takip: yetki matrisi ve menü", () => {
  const acts = (role: string) =>
    [...actionsFor(ROLES.find((r) => r.code === role)!, SCREENS.find((s) => s.code === "RO-MBT")!)].join("");

  it("yalnız görüntüleme: R-ODS, R-OSS, R-FBM, R-FBY; R-SYS tam; diğerlerinde satır yok", () => {
    for (const role of ["R-ODS", "R-OSS", "R-FBM", "R-FBY"]) expect(acts(role), role).toBe("V");
    expect(acts("R-SYS")).toBe("VODAR");
    for (const role of ROLES.map((r) => r.code).filter((c) => !["R-SYS", "R-ODS", "R-OSS", "R-FBM", "R-FBY"].includes(c))) {
      expect(acts(role), role).toBe("");
    }
  });

  it("oda servisi menüsünde 'Minibar Takip' RO-MBT görünürken çıkar", () => {
    const visible = new Set(["RO-TAL", "RO-TES", "RO-MBT"]);
    const nav = buildNav(visible, { pathname: "/oda-servisi" });
    const item = nav.more.find((i) => i.href === "/oda-servisi/minibar-takip");
    expect(item?.label).toBe("Minibar Takip");
    expect(screenForPath("/oda-servisi/minibar-takip")?.code).toBe("RO-MBT");
    const without = buildNav(new Set(["RO-TAL", "RO-TES"]), { pathname: "/oda-servisi" });
    expect([...without.primary, ...without.more].map((i) => i.href)).not.toContain("/oda-servisi/minibar-takip");
  });

  it("pickFloorWatchHotel: istenen, yoksa oturum oteli, o da yoksa ilk otel", () => {
    const list = [
      { id: "a", code: "A", name: "A" },
      { id: "b", code: "B", name: "B" },
    ];
    expect(pickFloorWatchHotel(list, "B", "a")?.id).toBe("b");
    expect(pickFloorWatchHotel(list, undefined, "b")?.id).toBe("b");
    expect(pickFloorWatchHotel(list, "x", "z")?.id).toBe("a");
    expect(pickFloorWatchHotel([], "x", "z")).toBeUndefined();
  });
});
