import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { helpFor } = await import("@/modules/core/server/helpData");
const { loadGuideState } = await import("@/modules/core/server/guideState");
const { setWelcomeSeen } = await import("@/modules/core/server/guidePrefs");
const { eligibleMistakes } = await import("@/components/guide/tourModel");
const { SCREEN_GUIDES } = await import("@/modules/core/screenGuide");

const EK_TALEP = "Havuz yetersizken kontrol kaydı açılamaz; önce Ek Talep ile stok iste.";

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("audit_logs");
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  await testDb.roleScreenPermission.deleteMany({ where: { hotelId: { not: null } } });
  await testDb.roleModuleAccess.deleteMany({ where: { hotelId: { not: null } } });
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function ctxOf(roleCode: string, hotelCode = "ROYAL", extra: string[] = []) {
  const user = await makeUser({ username: `h-${roleCode}-${hotelCode}`, roleCode, hotelCode, extraHotelCodes: extra });
  return ctxFor(user, { hotelCode, extraHotelCodes: extra });
}

describe("yardım içeriği", () => {
  it("hata ipuçları eyleme göre süzülür: yalnız V,D olan R-KAT 'Ek Talep' ipucunu görmez, R-DEP görür", async () => {
    expect(SCREEN_GUIDES["MB-ZIM"].mistakes).toContain(EK_TALEP);
    expect(eligibleMistakes(SCREEN_GUIDES["MB-ZIM"], ["V", "D"])).not.toContain(EK_TALEP);
    expect(eligibleMistakes(SCREEN_GUIDES["MB-ZIM"], ["V", "O", "D"])).toContain(EK_TALEP);

    const kat = await helpFor(await ctxOf("R-KAT"), "MB-ZIM");
    expect(kat?.mistakes).not.toContain(EK_TALEP);
    expect(kat?.mistakes.length).toBeGreaterThan(0);
    const dep = await helpFor(await ctxOf("R-DEP"), "MB-ZIM");
    expect(dep?.mistakes).toContain(EK_TALEP);
  });

  it("pencerenin oteli: iki otelli kullanıcıda yetki otele göre değişir; kullanıcının olmadığı otel reddedilir", async () => {
    const ctx = await ctxOf("R-DEP", "ROYAL", ["PREMIUM"]);
    const premium = await hotelId("PREMIUM");
    const zim = await testDb.appScreen.findUniqueOrThrow({ where: { code: "MB-ZIM" } });
    await testDb.roleScreenPermission.create({
      data: { roleId: ctx.user.roleId, screenId: zim.id, hotelId: premium, canView: false },
    });

    // Session hotel (ROYAL) has the screen, the window's hotel (PREMIUM) does not.
    expect(await helpFor(ctx, "MB-ZIM")).not.toBeNull();
    expect(await helpFor(ctx, "MB-ZIM", premium)).toBeNull();
    const royalState = await loadGuideState(ctx);
    const premiumState = await loadGuideState(ctx, premium);
    const codes = (s: typeof royalState) => s.summary.modules.flatMap((m) => m.screens.map((x) => x.code));
    expect(codes(royalState)).toContain("MB-ZIM");
    expect(codes(premiumState)).not.toContain("MB-ZIM");
    expect(premiumState.summary.hotel.id).toBe(premium);
    // The welcome acknowledgement concerns the session summary, not the window's hotel.
    expect(premiumState.summary.hash).not.toBe(royalState.summary.hash);
    await setWelcomeSeen(ctx.user.id, royalState.summary.hash);
    expect((await loadGuideState(ctx, premium)).welcomeOk).toBe(true);

    const diamond = await hotelId("DIAMOND");
    await expect(helpFor(ctx, "MB-ZIM", diamond)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(loadGuideState(ctx, diamond)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
