import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogoutReason } from "@/generated/prisma/client";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { registerReport, unregisterReport } = await import("@/modules/reporting/server/registry");
const { runReport } = await import("@/modules/reporting/server/run");
const { oturum } = await import("@/modules/reporting/server/reports/menu/oturum");

const range = { from: "2026-10-31", to: "2026-10-31" };
const at = (hhmm: string, day = "2026-10-31") => new Date(`${day}T${hhmm}:00Z`);

async function session(opts: {
  userId: string;
  hotelCode?: string;
  login: Date;
  logout?: Date;
  expires?: Date;
  reason?: LogoutReason;
}) {
  const user = await testDb.user.findUniqueOrThrow({ where: { id: opts.userId } });
  return testDb.userSession.create({
    data: {
      userId: user.id,
      hotelId: await hotelId(opts.hotelCode ?? "ROYAL"),
      roleId: user.roleId,
      loginAt: opts.login,
      lastSeenAt: opts.login,
      expiresAt: opts.expires ?? new Date(opts.login.getTime() + 8 * 3_600_000),
      logoutAt: opts.logout,
      logoutReason: opts.reason,
      ip: "10.1.1.1",
      userAgent: "t",
      deviceLabel: "Tablet 1",
    },
  });
}

async function run(ctx: Awaited<ReturnType<typeof staff>>["ctx"], params: Record<string, unknown> = {}, hotelCodes = ["ROYAL"], opts?: { limit?: number }) {
  const hotelIds = await Promise.all(hotelCodes.map(hotelId));
  return runReport(ctx, "oturum", { hotelIds, ...range, params }, opts);
}

beforeAll(async () => {
  await resetReferenceData();
  registerReport(oturum);
});
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
});
afterAll(async () => {
  unregisterReport(oturum.key);
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("oturum", () => {
  it("katalog: CR-ONL, CORE, tarih aralığı, self-service", () => {
    expect([oturum.key, oturum.screenCode, oturum.moduleKey, oturum.dateMode, oturum.selfService]).toEqual(["oturum", "CR-ONL", "CORE", "range", true]);
  });

  it("kullanıcı özeti: 30 + 90 dk → toplam 120, ort. 60; çıkış nedenleri sayılır", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const kat = await staff("R-KAT", "ROYAL");
    await session({ userId: kat.userId, login: at("08:00"), logout: at("08:30"), reason: "MANUEL" });
    await session({ userId: kat.userId, login: at("10:00"), logout: at("11:30"), reason: "ZORUNLU" });
    await session({ userId: kat.userId, login: at("12:00"), logout: at("12:10"), reason: "SURE_ASIMI" });
    await session({ userId: kat.userId, login: at("13:00"), logout: at("13:10"), reason: "HAREKETSIZLIK" });
    await session({ userId: kat.userId, login: at("14:00"), logout: at("14:10"), reason: "TEK_CIHAZ" });
    const res = await run(mgr.ctx);
    expect(res.columns.map((c) => c.title)).toEqual(["Otel", "Kullanıcı", "Rol", "Oturum", "Toplam süre (dk)", "Ort. süre (dk)", "Zorla çıkış", "Süre aşımı", "Hareketsizlik", "Tek cihaz", "Son giriş"]);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ sessions: 5, total: 150, avg: 30, forced: 1, expired: 1, idle: 1, single: 1 });
    expect(res.rows[0]!.last).toEqual(at("14:00"));
  });

  it("iki oturum 30 + 90 dk → Toplam 120, Ort. 60", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const kat = await staff("R-KAT", "ROYAL");
    await session({ userId: kat.userId, login: at("08:00"), logout: at("08:30") });
    await session({ userId: kat.userId, login: at("10:00"), logout: at("11:30") });
    const res = await run(mgr.ctx);
    expect(res.rows[0]).toMatchObject({ sessions: 2, total: 120, avg: 60 });
  });

  it("açık oturum expiresAt'te sınırlanır; gün ve otel süzgeci", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const kat = await staff("R-KAT", "ROYAL");
    // hâlâ açık ama son kullanma saati 40 dk sonra: süre 40 dk (şimdiye kadar değil)
    await session({ userId: kat.userId, login: at("08:00"), expires: at("08:40") });
    await session({ userId: kat.userId, login: at("08:00", "2026-10-30"), logout: at("09:00", "2026-10-30") }); // gün dışı
    const other = await staff("R-KAT", "PREMIUM");
    await session({ userId: other.userId, hotelCode: "PREMIUM", login: at("08:00"), logout: at("09:00") }); // başka otel
    const res = await run(mgr.ctx);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ sessions: 1, total: 40 });
    const day = await run(mgr.ctx, { groupBy: "gun" });
    expect(day.rows).toEqual([{ day: "2026-10-31", hotel: "Merit Royal", sessions: 1, users: 1, total: 40, avg: 40 }]);
  });

  it("detay: her oturum bir satır, IP yok", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const kat = await staff("R-KAT", "ROYAL");
    await session({ userId: kat.userId, login: at("08:00"), logout: at("08:30"), reason: "MANUEL" });
    await session({ userId: kat.userId, login: at("09:00"), expires: at("09:15") });
    const res = await run(mgr.ctx, { groupBy: "detay" });
    expect(res.columns.map((c) => c.key)).not.toContain("ip");
    expect(res.rows.map((r) => [r.minutes, r.reason, r.logoutAt === null])).toEqual([[30, "Çıkış", false], [15, null, true]]);
  });

  it("yetki: R-ITT çalıştırır; R-OTM kapsam dışı otelde (PREMIUM) FORBIDDEN; R-KAT FORBIDDEN", async () => {
    const itt = await staff("R-ITT", "ROYAL");
    const kat = await staff("R-KAT", "ROYAL");
    const mgr = await staff("R-OTM", "ROYAL");
    await session({ userId: kat.userId, login: at("08:00"), logout: at("08:30") });
    expect((await run(itt.ctx)).rows).toHaveLength(1);
    await expect(run(mgr.ctx, {}, ["PREMIUM"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(run(kat.ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("self-service (yalnız V): yalnız çağıranın oturumları, userId süzgeci yok sayılır", async () => {
    const kat = await staff("R-KAT", "ROYAL");
    const peer = await staff("R-KAT", "ROYAL");
    const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "CR-ONL" } });
    const user = await testDb.user.findUniqueOrThrow({ where: { id: kat.userId } });
    await testDb.roleScreenPermission.deleteMany({ where: { roleId: user.roleId, screenId: screen.id } });
    await testDb.roleScreenPermission.create({ data: { roleId: user.roleId, screenId: screen.id, canView: true } });
    await session({ userId: kat.userId, login: at("08:00"), logout: at("08:30") });
    await session({ userId: peer.userId, login: at("09:00"), logout: at("09:20") });
    const res = await run(kat.ctx, { groupBy: "detay", userId: peer.userId });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ minutes: 30 });
    expect(res.paramsEcho).toContain("Kapsam: yalnız kendi kayıtlarınız");
  });

  it("limit+1 satır → truncated", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    for (let i = 0; i < 3; i++) {
      const u = await staff("R-KAT", "ROYAL");
      await session({ userId: u.userId, login: at("08:00"), logout: at("08:30") });
    }
    const res = await run(mgr.ctx, {}, ["ROYAL"], { limit: 2 });
    expect(res.rows).toHaveLength(2);
    expect(res.truncated).toBe(true);
  });
});
