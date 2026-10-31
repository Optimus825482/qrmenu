import { randomInt } from "node:crypto";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

// One database state for the whole file (reset once): the live tests build on the seeded tree.
test.describe.configure({ mode: "serial" });
test.use({ locale: "en-US" });

const M1 = "/q/e2e-guest-m1";
const M2_INACTIVE = "/q/e2e-guest-m2";
const MR = { name: "Merit Royal", code: "MR" };

test.beforeAll(() => {
  resetAndSeed({ guestMenu: true });
});

const card = (page: Page, name: string): Locator => page.locator("button.g-card", { hasText: name });

async function openMenuAdmin(browser: Browser): Promise<{ page: Page; win: Locator }> {
  // Own client IP: the login rate limiter allows 5 attempts per minute per IP.
  const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  const context = await browser.newContext({
    locale: "tr-TR",
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await context.newPage();
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: "başlat" }).click();
  await page.getByRole("menu", { name: "Başlat menüsü" }).getByRole("menuitem", { name: "Menü Yönetimi" }).click();
  const win = page.getByRole("region", { name: `Menü Yönetimi · ${MR.name}`, exact: true });
  const hotelCard = page
    .getByRole("region", { name: "Menü Yönetimi", exact: true })
    .getByRole("button", { name: new RegExp(`^${MR.name}\\s*${MR.code}$`) });
  await expect(hotelCard.or(win)).toBeVisible();
  if (await hotelCard.isVisible()) await hotelCard.click();
  await expect(win).toBeVisible();
  await win.getByRole("combobox", { name: "Outlet", exact: true }).selectOption({ label: "Havuz Bar" });
  return { page, win };
}

test("M1 tokenı: outlet adı, masa etiketi ve menü (en)", async ({ page }) => {
  await page.goto(M1);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Havuz Bar");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("M1");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("tab", { name: "Drinks" })).toBeVisible();
  await expect(card(page, "Mojito")).toBeVisible();
  await expect(card(page, "Aperol Spritz")).toBeVisible();
  // Prices follow the (hidden) default; nothing is sold out; selections wording only.
  await expect(page.locator(".g-price")).toHaveCount(0);
  await expect(page.locator(".g-badge")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/sepet|cart/i);
  // Ordering is on for Havuz Bar: the detail sheet offers "Add to selections".
  await card(page, "Mojito").click();
  await expect(page.getByRole("dialog", { name: "Mojito" }).getByRole("button", { name: "Add to selections" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("?lang=ar sağdan sola ve Arapça; ?lang=de çerezle kalıcı", async ({ page }) => {
  await page.goto(`${M1}?lang=ar`);
  await expect(page).toHaveURL(new RegExp(`${M1}$`)); // the lang route sent us back without the query
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("tab", { name: "المشروبات" })).toBeVisible();
  await expect(card(page, "موخيتو")).toBeVisible();
  await expect(card(page, "Aperol Spritz")).toBeVisible(); // no Arabic translation: Turkish base name

  await page.goto(`${M1}?lang=de`);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.goto(M1);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.reload();
  await expect(page.getByRole("link", { name: "DE", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("tab", { name: "İçecekler" })).toBeVisible(); // no German translation: Turkish base

  // The switch links work too.
  await page.getByRole("link", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("tab", { name: "Drinks" })).toBeVisible();
});

test("canlı: admin Mojito'yu tükendi yapar, misafir sayfası yenilenmeden 3 sn içinde gri kart olur", async ({
  page,
  browser,
}) => {
  await page.goto(`${M1}?lang=en`);
  await expect(card(page, "Mojito")).toHaveAttribute("data-available", "true");
  await page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
  });

  const admin = await openMenuAdmin(browser);
  await admin.win.getByRole("treeitem", { name: /Mojito/ }).click();
  await admin.win.getByRole("switch", { name: "Tükendi" }).click();
  await expect(admin.win.getByRole("treeitem", { name: /Mojito/ })).toContainText("tükendi");

  await expect(card(page, "Mojito")).toHaveAttribute("data-available", "false", { timeout: 3_000 });
  await expect(card(page, "Mojito")).toContainText("Sold out");
  await expect(card(page, "Aperol Spritz")).toHaveAttribute("data-available", "true");
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);

  // Back to available: the card recovers.
  await admin.win.getByRole("switch", { name: "Tükendi" }).click();
  await expect(card(page, "Mojito")).toHaveAttribute("data-available", "true", { timeout: 3_000 });
  await admin.page.context().close();
});

test("canlı: outlet fiyat anahtarı Göster olunca fiyat 3 sn içinde görünür", async ({ page, browser }) => {
  await page.goto(`${M1}?lang=en`);
  await expect(card(page, "Mojito")).toBeVisible();
  await expect(page.locator(".g-price")).toHaveCount(0);

  const admin = await openMenuAdmin(browser);
  await admin.win.getByLabel("Fiyat gösterimi").selectOption({ label: "Göster" });
  await admin.page.getByRole("button", { name: "Evet" }).click();

  await expect(card(page, "Mojito").locator(".g-price")).toHaveText(/12\.00/, { timeout: 3_000 });
  await expect(card(page, "Aperol Spritz").locator(".g-price")).toHaveText(/10\.00/);

  await admin.win.getByLabel("Fiyat gösterimi").selectOption({ label: "Gizle" });
  await admin.page.getByRole("button", { name: "Evet" }).click();
  await expect(page.locator(".g-price")).toHaveCount(0, { timeout: 3_000 });
  await admin.page.context().close();
});

test("canlı: sipariş kapanınca şerit görünür", async ({ page, browser }) => {
  await page.goto(`${M1}?lang=en`);
  await expect(page.getByText("Ordering is closed right now")).toHaveCount(0);
  const admin = await openMenuAdmin(browser);
  await admin.win.getByRole("switch", { name: "Sipariş açık" }).click();
  await admin.page.getByRole("button", { name: "Evet" }).click();
  await expect(page.getByText("Ordering is closed right now")).toBeVisible({ timeout: 3_000 });
  await card(page, "Mojito").click();
  await expect(page.getByRole("dialog", { name: "Mojito" }).getByRole("button", { name: "Add to selections" })).toHaveCount(0);
  await admin.page.context().close();
});

test("bilinmeyen ve pasif masa tokenı: 'kullanılamıyor' sayfası", async ({ page }) => {
  await page.goto("/q/bogus-token-123");
  await expect(page.getByRole("heading", { name: "This menu is not available right now" })).toBeVisible();
  await expect(page.getByText("This QR code was not recognised")).toBeVisible();
  await expect(page.locator(".g-tabs")).toHaveCount(0);

  await page.goto(`${M2_INACTIVE}?lang=tr`);
  await expect(page.getByRole("heading", { name: "Bu menü şu an kullanılamıyor" })).toBeVisible();
  await expect(page.getByText("Bu masa şu an kullanımda değil.")).toBeVisible();
});

test("misafir olay akışı: bilinmeyen ve pasif masa tokenı 404", async ({ request }) => {
  expect((await request.get("/api/q/bogus-token-123/events")).status()).toBe(404);
  expect((await request.get("/api/q/e2e-guest-m2/events")).status()).toBe(404);
});
