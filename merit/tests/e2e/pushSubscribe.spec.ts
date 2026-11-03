import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";

test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });
test.beforeAll(() => resetAndSeed());

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/e2e-stub-endpoint";

async function count(): Promise<number> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    const res = await client.query("SELECT count(*)::int AS n FROM push_subscriptions WHERE endpoint = $1", [ENDPOINT]);
    return res.rows[0].n as number;
  } finally {
    await client.end();
  }
}

test("profil menüsünde Bildirimler anahtarı abonelik API'sini çağırır ve service worker kayıtlıdır", async ({ page }) => {
  // Gerçek push servisine gitmemek için PushManager ve izin taklit edilir.
  await page.addInitScript((endpoint) => {
    let current: unknown = null;
    const make = () => ({
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: "BP-e2e-key", auth: "e2e-auth" } }),
      unsubscribe: async () => {
        current = null;
        return true;
      },
    });
    PushManager.prototype.getSubscription = async () => current as PushSubscription | null;
    PushManager.prototype.subscribe = async () => {
      current = make();
      return current as PushSubscription;
    };
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => (current ? "granted" : "default") });
    Notification.requestPermission = async () => "granted";
  }, ENDPOINT);

  await login(page, "kat.mr");
  await page.waitForURL((url) => !url.pathname.startsWith("/giris") && !url.pathname.startsWith("/secim"));

  await expect
    .poll(async () => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())), { timeout: 30_000 })
    .toBe(true);

  await page.getByRole("button", { name: /Profil menüsü/ }).click();
  const toggle = page.getByTestId("push-toggle");
  await expect(toggle).toContainText("Bildirimler");
  await expect(toggle).toContainText("Aç");

  const subscribed = page.waitForResponse(
    (r) => r.request().method() === "POST" && (r.request().postData() ?? "").includes("e2e-stub-endpoint"),
  );
  await toggle.click();
  await subscribed;
  await expect(toggle).toContainText("Kapat");
  expect(await count()).toBe(1);

  await toggle.click();
  await expect(toggle).toContainText("Aç");
  await expect.poll(count).toBe(0);
});
