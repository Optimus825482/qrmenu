import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/env", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/env")>();
  return { env: { ...actual.env, DATABASE_URL: process.env.DATABASE_URL_TEST!, PUSH_ENDPOINT_ALLOWLIST: "push.example.test" } };
});
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { DEFAULT_PUSH_ENDPOINT_ALLOWLIST, isAllowedPushEndpoint, MAX_SUBSCRIPTIONS_PER_USER, subscribePush, unsubscribePush } = await import(
  "@/modules/core/server/pushSubscriptions"
);

const sub = (n: number | string, auth = "auth") => ({
  endpoint: `https://push.example.test/send/${n}`,
  keys: { p256dh: "p256dh-key", auth },
  userAgent: "UA",
});

beforeAll(resetReferenceData);
beforeEach(resetTestData);
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function ctxOf(username: string) {
  const user = await makeUser({ username, roleCode: "R-KAT", hotelCode: "ROYAL" });
  return { user, ctx: await ctxFor(user, { hotelCode: "ROYAL" }) };
}

describe("subscribePush", () => {
  it("abonelik oluşturur", async () => {
    const { user, ctx } = await ctxOf("a1");
    const { id } = await subscribePush(ctx, sub(1));
    const row = await testDb.pushSubscription.findUniqueOrThrow({ where: { id } });
    expect(row.userId).toBe(user.id);
    expect(row.failCount).toBe(0);
  });

  it("aynı endpoint yeniden abone olunca tek satır kalır ve anahtarlar güncellenir", async () => {
    const { ctx } = await ctxOf("a2");
    const first = await subscribePush(ctx, sub(1, "eski"));
    await testDb.pushSubscription.update({ where: { id: first.id }, data: { failCount: 3 } });
    const second = await subscribePush(ctx, sub(1, "yeni"));
    expect(second.id).toBe(first.id);
    const rows = await testDb.pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ auth: "yeni", failCount: 0 });
  });

  it("aynı cihazı başka kullanıcı alırsa sahiplik devralınır", async () => {
    const a = await ctxOf("a3");
    const b = await ctxOf("b3");
    await subscribePush(a.ctx, sub(1));
    await subscribePush(b.ctx, sub(1));
    const rows = await testDb.pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(b.user.id);
  });

  it("http endpoint VALIDATION", async () => {
    const { ctx } = await ctxOf("a4");
    await expect(
      subscribePush(ctx, { ...sub(1), endpoint: "http://push.example.test/x" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await testDb.pushSubscription.count()).toBe(0);
  });

  it("kullanıcı başına üst sınır: en eski abonelikler silinir", async () => {
    const { ctx } = await ctxOf("a5");
    for (let i = 0; i < MAX_SUBSCRIPTIONS_PER_USER + 2; i += 1) {
      await subscribePush(ctx, sub(i));
      await new Promise((r) => setTimeout(r, 5));
    }
    const rows = await testDb.pushSubscription.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(MAX_SUBSCRIPTIONS_PER_USER);
    expect(rows.map((r) => r.endpoint)).not.toContain(sub(0).endpoint);
    expect(rows.map((r) => r.endpoint)).toContain(sub(MAX_SUBSCRIPTIONS_PER_USER + 1).endpoint);
  });
});

describe("unsubscribePush", () => {
  it("kendi aboneliğini siler", async () => {
    const { ctx } = await ctxOf("u1");
    await subscribePush(ctx, sub(1));
    expect(await unsubscribePush(ctx, sub(1).endpoint)).toBe(true);
    expect(await testDb.pushSubscription.count()).toBe(0);
  });

  it("başkasının aboneliği için false döner ve satır durur", async () => {
    const a = await ctxOf("u2");
    const b = await ctxOf("u3");
    await subscribePush(a.ctx, sub(1));
    expect(await unsubscribePush(b.ctx, sub(1).endpoint)).toBe(false);
    expect(await testDb.pushSubscription.count()).toBe(1);
  });

  it("kullanıcı silinince abonelikleri de silinir (cascade)", async () => {
    const { user, ctx } = await ctxOf("u4");
    await subscribePush(ctx, sub(1));
    await testDb.user.delete({ where: { id: user.id } });
    expect(await testDb.pushSubscription.count()).toBe(0);
  });
});

describe("isAllowedPushEndpoint (SSRF)", () => {
  const ok = (u: string) => isAllowedPushEndpoint(u, DEFAULT_PUSH_ENDPOINT_ALLOWLIST);
  it("bilinen push servisleri kabul edilir", () => {
    expect(ok("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(ok("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(ok("https://web.push.apple.com/Q123")).toBe(true);
    expect(ok("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(ok("https://FCM.googleapis.com./fcm/send/abc")).toBe(true);
  });
  it("iç ağ, localhost, sahte ve biçimsiz adresler reddedilir", () => {
    for (const u of [
      "https://10.0.0.1/",
      "https://localhost/",
      "https://evil.com/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evilfcm.googleapis.com.attacker.test/",
      "https://notfcm.googleapis.comx/",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "http://fcm.googleapis.com/x",
      "not a url",
    ]) {
      expect(ok(u), u).toBe(false);
    }
  });
  it("sonek yalnız nokta sınırında eşleşir", () => {
    expect(isAllowedPushEndpoint("https://xfcm.googleapis.com/", ["fcm.googleapis.com"])).toBe(false);
    expect(isAllowedPushEndpoint("https://a.push.apple.com/", ["*.push.apple.com"])).toBe(true);
  });
  it("subscribePush izinli olmayan adresi Türkçe VALIDATION ile reddeder", async () => {
    const { ctx } = await ctxOf("ssrf1");
    await expect(subscribePush(ctx, { ...sub(1), endpoint: "https://10.0.0.1/x" })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Bu bildirim servisi desteklenmiyor",
    });
    expect(await testDb.pushSubscription.count()).toBe(0);
  });
});
