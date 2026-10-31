import { ADMIN_PASSWORD, expect, login, resetAndSeed, test } from "./fixtures";

// The specs share one database state (reset once in beforeAll) and must run in order.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

const WRONG_PASSWORD_MESSAGE = "Kullanıcı adı veya şifre hatalı";

test("giriş sayfası: Merit OS başlığı, etiketli alanlar, konsolda hata yok", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto("/giris");
  await expect(page.getByText("MERIT OS")).toBeVisible();
  await expect(page.getByLabel("Kullanıcı adı")).toHaveAttribute("autocomplete", "username");
  await expect(page.getByLabel("Şifre")).toHaveAttribute("autocomplete", "current-password");
  await expect(page.getByRole("button", { name: "Giriş Yap" })).toBeVisible();
  await expect(page).toHaveTitle("Merit OS");

  // Mobile first: nothing may overflow horizontally at 360 px.
  await page.setViewportSize({ width: 360, height: 740 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  expect(consoleErrors).toEqual([]);
});

test("yanlış şifre: Türkçe hata (role=alert), kullanıcı adı korunur", async ({ page }) => {
  await login(page, "kat.mr", "yanlis-sifre");
  await expect(page.getByRole("alert").filter({ hasText: WRONG_PASSWORD_MESSAGE })).toBeVisible();
  await expect(page.getByLabel("Kullanıcı adı")).toHaveValue("kat.mr");
  await expect(page).toHaveURL(/\/giris$/);
});

test("admin → /admin", async ({ page }) => {
  expect(ADMIN_PASSWORD.length).toBeGreaterThanOrEqual(10);
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
});

test("kat.mr (tek hedef) → /kat", async ({ page }) => {
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/kat$/);
});

test("kat.mr: ?next= göreli yola gider", async ({ page }) => {
  await page.goto("/giris?next=%2Fkat%2Fkontrol");
  await page.getByLabel("Kullanıcı adı").fill("kat.mr");
  await page.getByLabel("Şifre").fill("Test!2026");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/kat\/kontrol$/);
});

test("depo.cok (iki otel) → /secim, 2 kart, seçim → /depo/havuz", async ({ page }) => {
  await login(page, "depo.cok");
  await expect(page).toHaveURL(/\/secim$/);
  const cards = page.getByRole("button", { name: /Minibar/ });
  await expect(cards).toHaveCount(2);
  await expect(page.getByText("Merit Royal Premium").first()).toBeVisible();
  await cards.first().click();
  await expect(page).toHaveURL(/\/depo\/havuz$/);
});

test("garson.havuz (iki outlet) → /secim, outlet kartları", async ({ page }) => {
  await login(page, "garson.havuz");
  await expect(page).toHaveURL(/\/secim$/);
  await expect(page.getByRole("button", { name: /Beach Bar/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Havuz Bar/ })).toBeVisible();
});

test("bos.kullanici → /secim 'Atama yok'; POST ile çıkış → /giris", async ({ page }) => {
  await login(page, "bos.kullanici");
  await expect(page).toHaveURL(/\/secim$/);
  await expect(page.getByRole("heading", { name: "Atama yok" })).toBeVisible();
  await expect(
    page.getByText(
      "Hesabınıza henüz bir outlet veya minibar bölgesi atanmamış. Lütfen komuta merkezinden atama yapılmasını isteyin.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Oturumu Kapat" }).click();
  await expect(page).toHaveURL(/\/giris$/);

  // The pending cookie is gone: /secim bounces back to the login page.
  await page.goto("/secim");
  await expect(page).toHaveURL(/\/giris\?next=%2Fsecim$/);
});

test("/secim oturumsuz → /giris", async ({ page }) => {
  await page.goto("/secim");
  await expect(page).toHaveURL(/\/giris/);
});

test("/admin çerezsiz → /giris?next=/admin", async ({ page }) => {
  await page.goto("/admin");
  const url = new URL(page.url());
  expect(url.pathname).toBe("/giris");
  expect(url.searchParams.get("next")).toBe("/admin");
});

test("açık oturumda POST /cikis oturumu kapatır; GET /cikis 405", async ({ page, baseURL }) => {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);

  const get = await page.request.get("/cikis", { maxRedirects: 0 });
  expect(get.status()).toBe(405);

  const foreign = await page.request.post("/cikis", {
    headers: { Origin: "https://evil.example" },
    maxRedirects: 0,
  });
  expect(foreign.status()).toBe(403);

  const out = await page.request.post("/cikis", { headers: { Origin: baseURL! }, maxRedirects: 0 });
  expect(out.status()).toBe(303);
  expect(out.headers()["location"]).toMatch(/\/giris$/);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/giris/);
});
