import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/env", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/env")>();
  return { env: { ...actual.env, DATABASE_URL: process.env.DATABASE_URL_TEST! } };
});
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { closeSession } = await import("@/modules/core/server/sessions");
const { sweepSessions } = await import("@/modules/core/server/sessionSweeper");

beforeAll(resetReferenceData);
beforeEach(resetTestData);
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function setup(name: string) {
  const user = await makeUser({ username: name, roleCode: "R-KAT", hotelCode: "ROYAL" });
  const session = await testDb.userSession.create({
    data: {
      userId: user.id,
      hotelId: await hotelId("ROYAL"),
      roleId: user.roleId,
      expiresAt: new Date(Date.now() + 3_600_000),
      ip: "127.0.0.1",
      userAgent: "vitest",
    },
  });
  for (const n of [1, 2]) {
    await testDb.pushSubscription.create({
      data: { userId: user.id, endpoint: `https://fcm.googleapis.com/${name}/${n}`, p256dh: "k", auth: "a" },
    });
  }
  return { user, session };
}

describe("oturum kapanınca push abonelikleri silinir", () => {
  it("manuel çıkış (closeSession) kullanıcının tüm aboneliklerini siler, başkasınınkini değil", async () => {
    const a = await setup("lo1");
    await setup("lo2");
    expect(await closeSession(a.session.id, "MANUEL")).toBe(true);
    expect(await testDb.pushSubscription.count({ where: { userId: a.user.id } })).toBe(0);
    expect(await testDb.pushSubscription.count()).toBe(2);
  });

  it("zorunlu çıkış (ZORUNLU) abonelikleri siler", async () => {
    const a = await setup("lo3");
    const admin = await makeUser({ username: "adm", roleCode: "R-SYS", hotelCode: "ROYAL" });
    await closeSession(a.session.id, "ZORUNLU", admin.id);
    expect(await testDb.pushSubscription.count({ where: { userId: a.user.id } })).toBe(0);
  });

  it("süpürücü (süre aşımı) abonelikleri siler", async () => {
    const a = await setup("lo4");
    await testDb.userSession.update({ where: { id: a.session.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const result = await sweepSessions(new Date(), { warnMinutes: 5, idleMinutes: 60, notifier: async () => {} });
    expect(result.expired).toBe(1);
    expect(await testDb.pushSubscription.count({ where: { userId: a.user.id } })).toBe(0);
  });

  it("zaten kapalı oturum no-op: abonelikler kalır (logoutAction ayrıca siler)", async () => {
    const a = await setup("lo5");
    await closeSession(a.session.id, "MANUEL");
    await testDb.pushSubscription.create({
      data: { userId: a.user.id, endpoint: "https://fcm.googleapis.com/lo5/3", p256dh: "k", auth: "a" },
    });
    expect(await closeSession(a.session.id, "MANUEL")).toBe(false);
    expect(await testDb.pushSubscription.count({ where: { userId: a.user.id } })).toBe(1);
  });
});
