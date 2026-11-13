import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDate, businessDateStart, businessDay } from "@/lib/time";
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

const { getCommandCenterKpis } = await import("@/modules/core/server/commandCenter");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("audit_logs");
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function sysCtx(extraHotelCodes: string[] = ["DIAMOND", "PREMIUM"]) {
  const user = await makeUser({
    username: "sys1",
    roleCode: "R-SYS",
    hotelCode: "ROYAL",
    extraHotelCodes,
  });
  return { user, ctx: await ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes }) };
}

async function openSession(
  userId: string,
  hotel: string,
  status: "ONLINE" | "UYARI" | "CIKTI",
  roleId: string,
) {
  return testDb.userSession.create({
    data: {
      userId,
      hotelId: await hotelId(hotel),
      roleId,
      status,
      expiresAt: new Date(Date.now() + 3_600_000),
      ip: "10.0.0.1",
      userAgent: "test",
    },
  });
}

async function notification(userId: string, hotel: string | null, createdAt: Date) {
  return testDb.notification.create({
    data: {
      userId,
      hotelId: hotel ? await hotelId(hotel) : null,
      type: "test.note",
      title: "t",
      body: "b",
      createdAt,
    },
  });
}

describe("getCommandCenterKpis (gerçek test DB)", () => {
  it("3 otel; 2 ONLINE/UYARI + 1 CIKTI oturum → onlineUsers 2 (tekil kullanıcı)", async () => {
    const { user, ctx } = await sysCtx();
    const u2 = await makeUser({ username: "u2", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const u3 = await makeUser({ username: "u3", roleCode: "R-GAR", hotelCode: "DIAMOND" });
    // The same user is online in two hotels: counted once overall, once per hotel.
    await openSession(user.id, "ROYAL", "ONLINE", user.roleId);
    await openSession(user.id, "DIAMOND", "UYARI", user.roleId);
    await openSession(u2.id, "ROYAL", "ONLINE", u2.roleId);
    await openSession(u3.id, "DIAMOND", "CIKTI", u3.roleId);

    const kpis = await getCommandCenterKpis(ctx);

    expect(kpis.hotels).toBe(3);
    expect(kpis.onlineUsers).toBe(2);
    const byCode = new Map(kpis.openSessionsByHotel.map((h) => [h.code, h]));
    expect(byCode.get("ROYAL")).toMatchObject({ name: "Merit Royal", online: 2 });
    expect(byCode.get("DIAMOND")?.online).toBe(1);
    expect(byCode.get("PREMIUM")?.online).toBe(0);
    expect(kpis.openSessionsByHotel).toHaveLength(3);
  });

  it("bugün (Nicosia) 2, dün 1 bildirim → notificationsToday 2", async () => {
    const { user, ctx } = await sysCtx();
    const startOfToday = businessDateStart(businessDate());
    await notification(user.id, "ROYAL", new Date());
    await notification(user.id, null, new Date());
    await notification(user.id, "ROYAL", new Date(startOfToday.getTime() - 60 * 60_000));

    expect((await getCommandCenterKpis(ctx)).notificationsToday).toBe(2);
  });

  it("hotelId verilince yalnız o otel sayılır", async () => {
    const { user, ctx } = await sysCtx();
    const u2 = await makeUser({ username: "u2", roleCode: "R-GAR", hotelCode: "DIAMOND" });
    await openSession(user.id, "ROYAL", "ONLINE", user.roleId);
    await openSession(u2.id, "DIAMOND", "ONLINE", u2.roleId);
    await notification(user.id, "ROYAL", new Date());
    await notification(u2.id, "DIAMOND", new Date());
    await notification(u2.id, "DIAMOND", new Date());

    const mr = await getCommandCenterKpis(ctx, await hotelId("ROYAL"));
    expect(mr.hotels).toBe(1);
    expect(mr.onlineUsers).toBe(1);
    expect(mr.notificationsToday).toBe(1);
    expect(mr.openSessionsByHotel).toEqual([
      { hotelId: await hotelId("ROYAL"), code: "ROYAL", name: "Merit Royal", online: 1 },
    ]);

    const mrd = await getCommandCenterKpis(ctx, await hotelId("DIAMOND"));
    expect(mrd.onlineUsers).toBe(1);
    expect(mrd.notificationsToday).toBe(2);
  });

  it("ctx kapsamı dışındaki oteller sayılmaz; kapsam dışı hotelId FORBIDDEN", async () => {
    const { user, ctx } = await sysCtx([]); // scope: MR only
    const other = await makeUser({ username: "u2", roleCode: "R-GAR", hotelCode: "PREMIUM" });
    await openSession(user.id, "ROYAL", "ONLINE", user.roleId);
    await openSession(other.id, "PREMIUM", "ONLINE", other.roleId);
    await notification(other.id, "PREMIUM", new Date());

    const kpis = await getCommandCenterKpis(ctx);
    expect(kpis.hotels).toBe(1);
    expect(kpis.onlineUsers).toBe(1);
    expect(kpis.notificationsToday).toBe(0);
    expect(kpis.openSessionsByHotel.map((h) => h.code)).toEqual(["ROYAL"]);

    await expect(getCommandCenterKpis(ctx, await hotelId("PREMIUM"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("CR-KOM görme yetkisi olmayan rol (R-KAT) → FORBIDDEN", async () => {
    const kat = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const ctx = await ctxFor(kat, { hotelCode: "ROYAL" });
    await expect(getCommandCenterKpis(ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("otel bazlı CR-KOM yetkisi: canView=false olan otel kapsam dışı kalır; hepsi kapalıysa FORBIDDEN", async () => {
    const user = await makeUser({
      username: "otm1",
      roleCode: "R-OTM",
      hotelCode: "ROYAL",
      extraHotelCodes: ["ROYAL", "DIAMOND"],
    });
    const ctx = await ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND"] });
    const other = await makeUser({ username: "u2", roleCode: "R-GAR", hotelCode: "DIAMOND" });
    await openSession(user.id, "ROYAL", "ONLINE", user.roleId);
    await openSession(other.id, "DIAMOND", "ONLINE", other.roleId);
    await notification(user.id, "ROYAL", new Date());
    await notification(other.id, "DIAMOND", new Date());
    await notification(other.id, "DIAMOND", new Date());

    const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "CR-KOM" } });
    const deny = async (code: string) =>
      testDb.roleScreenPermission.create({
        data: { roleId: user.roleId, screenId: screen.id, hotelId: await hotelId(code), canView: false },
      });
    await deny("DIAMOND");
    try {
      const kpis = await getCommandCenterKpis(ctx);
      expect(kpis.hotels).toBe(1);
      expect(kpis.onlineUsers).toBe(1);
      expect(kpis.notificationsToday).toBe(1);
      expect(kpis.openSessionsByHotel.map((h) => h.code)).toEqual(["ROYAL"]);

      await expect(getCommandCenterKpis(ctx, await hotelId("DIAMOND"))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      await deny("ROYAL");
      await expect(getCommandCenterKpis(ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBeGreaterThan(0);
    } finally {
      await testDb.roleScreenPermission.deleteMany({ where: { hotelId: { not: null } } });
    }
  });

  it("doluluk: oda bir kez sayılır, pasif oda ve dünkü çıkış sayılmaz; otel otel ve toplam verilir", async () => {
    const { ctx } = await sysCtx();
    await truncate("guest_records", "rooms");
    const today = businessDay(businessDate());
    const day = (offset: number) => new Date(today.getTime() + offset * 86_400_000);
    const room = async (hotel: string, number: string, isActive = true) => {
      const hid = await hotelId(hotel);
      const floor =
        (await testDb.floor.findFirst({ where: { hotelId: hid } })) ??
        (await testDb.floor.create({ data: { hotelId: hid, number: 1, name: "Kat 1" } }));
      return testDb.room.create({ data: { hotelId: hid, floorId: floor.id, number, isActive } });
    };
    const stay = (r: { id: string; hotelId: string }, from: number, to: number, kind: "IN_HOUSE" | "ARRIVAL" = "IN_HOUSE") =>
      testDb.guestRecord.create({
        data: { hotelId: r.hotelId, roomId: r.id, batchCode: "T", guestCount: 2, arrivalDate: day(from), departureDate: day(to), kind },
      });

    const [r1, r2, , rOff, d1] = [
      await room("ROYAL", "9101"),
      await room("ROYAL", "9102"),
      await room("ROYAL", "9103"),
      await room("ROYAL", "9104", false),
      await room("DIAMOND", "9201"),
    ];
    await room("DIAMOND", "9202");
    // 9101: two records for the same stay (the old count read this as two occupied rooms).
    await stay(r1, -2, 3);
    await stay(r1, -2, 3, "ARRIVAL");
    await stay(r2, -5, -1); // left yesterday
    await stay(rOff, -1, 2); // inactive room
    await stay(d1, 0, 0);

    const kpis = await getCommandCenterKpis(ctx);
    const by = Object.fromEntries(kpis.radar.byHotel.map((h) => [h.code, h]));
    expect(by.ROYAL).toMatchObject({ totalRooms: 3, occupiedRooms: 1, occupancyPercent: 33 });
    expect(by.DIAMOND).toMatchObject({ totalRooms: 2, occupiedRooms: 1, occupancyPercent: 50 });
    expect(by.PREMIUM).toMatchObject({ totalRooms: 0, occupiedRooms: 0, occupancyPercent: 0 });
    expect(kpis.radar).toMatchObject({ totalRooms: 5, occupiedRooms: 2, occupancyPercent: 40 });
    await truncate("guest_records", "rooms");
  });
});
