import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDate, businessDateStart } from "@/lib/time";
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

async function sysCtx(extraHotelCodes: string[] = ["MRD", "MRP"]) {
  const user = await makeUser({
    username: "sys1",
    roleCode: "R-SYS",
    hotelCode: "MR",
    extraHotelCodes,
  });
  return { user, ctx: await ctxFor(user, { hotelCode: "MR", extraHotelCodes }) };
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
    const u2 = await makeUser({ username: "u2", roleCode: "R-GAR", hotelCode: "MR" });
    const u3 = await makeUser({ username: "u3", roleCode: "R-GAR", hotelCode: "MRD" });
    // The same user is online in two hotels: counted once overall, once per hotel.
    await openSession(user.id, "MR", "ONLINE", user.roleId);
    await openSession(user.id, "MRD", "UYARI", user.roleId);
    await openSession(u2.id, "MR", "ONLINE", u2.roleId);
    await openSession(u3.id, "MRD", "CIKTI", u3.roleId);

    const kpis = await getCommandCenterKpis(ctx);

    expect(kpis.hotels).toBe(3);
    expect(kpis.onlineUsers).toBe(2);
    const byCode = new Map(kpis.openSessionsByHotel.map((h) => [h.code, h]));
    expect(byCode.get("MR")).toMatchObject({ name: "Merit Royal", online: 2 });
    expect(byCode.get("MRD")?.online).toBe(1);
    expect(byCode.get("MRP")?.online).toBe(0);
    expect(kpis.openSessionsByHotel).toHaveLength(3);
  });

  it("bugün (Nicosia) 2, dün 1 bildirim → notificationsToday 2", async () => {
    const { user, ctx } = await sysCtx();
    const startOfToday = businessDateStart(businessDate());
    await notification(user.id, "MR", new Date());
    await notification(user.id, null, new Date());
    await notification(user.id, "MR", new Date(startOfToday.getTime() - 60 * 60_000));

    expect((await getCommandCenterKpis(ctx)).notificationsToday).toBe(2);
  });

  it("hotelId verilince yalnız o otel sayılır", async () => {
    const { user, ctx } = await sysCtx();
    const u2 = await makeUser({ username: "u2", roleCode: "R-GAR", hotelCode: "MRD" });
    await openSession(user.id, "MR", "ONLINE", user.roleId);
    await openSession(u2.id, "MRD", "ONLINE", u2.roleId);
    await notification(user.id, "MR", new Date());
    await notification(u2.id, "MRD", new Date());
    await notification(u2.id, "MRD", new Date());

    const mr = await getCommandCenterKpis(ctx, await hotelId("MR"));
    expect(mr.hotels).toBe(1);
    expect(mr.onlineUsers).toBe(1);
    expect(mr.notificationsToday).toBe(1);
    expect(mr.openSessionsByHotel).toEqual([
      { hotelId: await hotelId("MR"), code: "MR", name: "Merit Royal", online: 1 },
    ]);

    const mrd = await getCommandCenterKpis(ctx, await hotelId("MRD"));
    expect(mrd.onlineUsers).toBe(1);
    expect(mrd.notificationsToday).toBe(2);
  });

  it("ctx kapsamı dışındaki oteller sayılmaz; kapsam dışı hotelId FORBIDDEN", async () => {
    const { user, ctx } = await sysCtx([]); // scope: MR only
    const other = await makeUser({ username: "u2", roleCode: "R-GAR", hotelCode: "MRP" });
    await openSession(user.id, "MR", "ONLINE", user.roleId);
    await openSession(other.id, "MRP", "ONLINE", other.roleId);
    await notification(other.id, "MRP", new Date());

    const kpis = await getCommandCenterKpis(ctx);
    expect(kpis.hotels).toBe(1);
    expect(kpis.onlineUsers).toBe(1);
    expect(kpis.notificationsToday).toBe(0);
    expect(kpis.openSessionsByHotel.map((h) => h.code)).toEqual(["MR"]);

    await expect(getCommandCenterKpis(ctx, await hotelId("MRP"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("CR-KOM görme yetkisi olmayan rol (R-KAT) → FORBIDDEN", async () => {
    const kat = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "MR" });
    const ctx = await ctxFor(kat, { hotelCode: "MR" });
    await expect(getCommandCenterKpis(ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("otel bazlı CR-KOM yetkisi: canView=false olan otel kapsam dışı kalır; hepsi kapalıysa FORBIDDEN", async () => {
    const user = await makeUser({
      username: "otm1",
      roleCode: "R-OTM",
      hotelCode: "MR",
      extraHotelCodes: ["MR", "MRD"],
    });
    const ctx = await ctxFor(user, { hotelCode: "MR", extraHotelCodes: ["MRD"] });
    const other = await makeUser({ username: "u2", roleCode: "R-GAR", hotelCode: "MRD" });
    await openSession(user.id, "MR", "ONLINE", user.roleId);
    await openSession(other.id, "MRD", "ONLINE", other.roleId);
    await notification(user.id, "MR", new Date());
    await notification(other.id, "MRD", new Date());
    await notification(other.id, "MRD", new Date());

    const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "CR-KOM" } });
    const deny = async (code: string) =>
      testDb.roleScreenPermission.create({
        data: { roleId: user.roleId, screenId: screen.id, hotelId: await hotelId(code), canView: false },
      });
    await deny("MRD");
    try {
      const kpis = await getCommandCenterKpis(ctx);
      expect(kpis.hotels).toBe(1);
      expect(kpis.onlineUsers).toBe(1);
      expect(kpis.notificationsToday).toBe(1);
      expect(kpis.openSessionsByHotel.map((h) => h.code)).toEqual(["MR"]);

      await expect(getCommandCenterKpis(ctx, await hotelId("MRD"))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      await deny("MR");
      await expect(getCommandCenterKpis(ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBeGreaterThan(0);
    } finally {
      await testDb.roleScreenPermission.deleteMany({ where: { hotelId: { not: null } } });
    }
  });
});
