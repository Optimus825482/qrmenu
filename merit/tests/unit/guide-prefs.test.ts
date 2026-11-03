import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

let currentCtx: Awaited<ReturnType<typeof ctxFor>>;
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  requireUser: async () => currentCtx,
}));

const prefsLib = await import("@/modules/core/server/guidePrefs");
const { mergeUserPrefs, readUserPrefs } = await import("@/lib/userPrefs");
const actions = await import("@/modules/core/server/guideActions");
const { accessSummary } = await import("@/modules/core/server/accessSummary");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("audit_logs");
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function newUser(name = "gp") {
  const user = await makeUser({ username: name, roleCode: "R-KAT", hotelCode: "ROYAL" });
  currentCtx = await ctxFor(user, { hotelCode: "ROYAL" });
  return user;
}

describe("userPrefs / guide tercihleri", () => {
  it("guide yazımı mevcut prefs.shell'i silmez, shell yazımı guide'ı silmez", async () => {
    const user = await newUser();
    await mergeUserPrefs(user.id, "shell", { wallpaper: "gumus" });
    await prefsLib.setWelcomeSeen(user.id, "abc123");
    let prefs = await readUserPrefs(user.id);
    expect(prefs.shell).toEqual({ wallpaper: "gumus" });
    expect((prefs.guide as { welcomeSeenHash: string }).welcomeSeenHash).toBe("abc123");

    // The shell save path (prefsAction) uses jsonb_set on the shell key: guide must survive it.
    await testDb.$executeRaw`UPDATE "users" SET "prefs" = jsonb_set(COALESCE("prefs", '{}'::jsonb), '{shell}', '{"wallpaper":"mavi"}'::jsonb, true) WHERE "id" = ${user.id}`;
    prefs = await readUserPrefs(user.id);
    expect((prefs.guide as { welcomeSeenHash: string }).welcomeSeenHash).toBe("abc123");
    expect(prefs.shell).toEqual({ wallpaper: "mavi" });
  });

  it("20 eşzamanlı toggleChecklist kaybolmaz", async () => {
    const user = await newUser();
    const day = "2026-11-03";
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => prefsLib.setChecklistItem(user.id, day, `m${i}`, true, day)),
    );
    const guide = await prefsLib.readGuidePrefs(user.id);
    expect([...guide.checklist[day]].sort()).toEqual(Array.from({ length: 20 }, (_, i) => `m${i}`).sort());
    await prefsLib.setChecklistItem(user.id, day, "m3", false, day);
    expect((await prefsLib.readGuidePrefs(user.id)).checklist[day]).not.toContain("m3");
  });

  it("8 günlük eski gün budanır, son 7 gün kalır", async () => {
    const user = await newUser();
    await prefsLib.setChecklistItem(user.id, "2026-10-26", "x", true, "2026-11-03"); // 8 gün önce
    await prefsLib.setChecklistItem(user.id, "2026-10-28", "y", true, "2026-11-03"); // 6 gün önce
    const guide = await prefsLib.readGuidePrefs(user.id);
    expect(Object.keys(guide.checklist)).toEqual(["2026-10-28"]);
  });

  it("acknowledgeWelcomeAction: karma yazılır, denetim kaydı WELCOME_ACK; eski karma reddedilir", async () => {
    const user = await newUser();
    const hash = (await accessSummary(currentCtx)).hash;
    const stale = await actions.acknowledgeWelcomeAction("eskiKarma");
    expect(stale.ok).toBe(false);
    expect((await prefsLib.readGuidePrefs(user.id)).welcomeSeenHash).toBeUndefined();

    const done = await actions.acknowledgeWelcomeAction(hash);
    expect(done).toEqual({ ok: true, data: { hash } });
    expect((await prefsLib.readGuidePrefs(user.id)).welcomeSeenHash).toBe(hash);
    const logs = await testDb.auditLog.findMany({ where: { action: "WELCOME_ACK", userId: user.id } });
    expect(logs).toHaveLength(1);
  });

  it("markGuideSeen / toggleChecklist eylemleri yalnız kendi satırını yazar ve girdiyi doğrular", async () => {
    const user = await newUser("gp1");
    const other = await makeUser({ username: "gp2", roleCode: "R-KAT", hotelCode: "ROYAL" });
    expect((await actions.markGuideSeenAction("MB-KAT", 1)).ok).toBe(true);
    const { businessDate } = await import("@/lib/time");
    const today = businessDate();
    expect((await actions.toggleChecklistAction(today, "gorevleri-ac", true)).ok).toBe(true);
    // Only today's list can be ticked (a stale page after midnight, or a forged day, is rejected).
    expect(await actions.toggleChecklistAction("2020-01-01", "a", true)).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect((await actions.toggleChecklistAction("bozuk", "a", true)).ok).toBe(false);
    const mine = await prefsLib.readGuidePrefs(user.id);
    expect(mine.seen).toEqual({ "MB-KAT": 1 });
    expect(mine.checklist[today]).toEqual(["gorevleri-ac"]);
    expect(await prefsLib.readGuidePrefs(other.id)).toEqual({ seen: {}, checklist: {} });
  });

  it("welcomeMatches: yıldız yalnız üretim dışında veya _e2e/_test veritabanında geçerli", () => {
    expect(prefsLib.welcomeMatches(undefined, "h")).toBe(false);
    expect(prefsLib.welcomeMatches("h", "h")).toBe(true);
    expect(prefsLib.welcomeMatches("g", "h")).toBe(false);
    expect(prefsLib.welcomeMatches("*", "h")).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/merit");
    expect(prefsLib.welcomeMatches("*", "h")).toBe(false);
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/merit_x_e2e");
    expect(prefsLib.welcomeMatches("*", "h")).toBe(true);
    vi.unstubAllEnvs();
  });
});
