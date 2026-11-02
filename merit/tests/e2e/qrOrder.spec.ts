import { randomInt } from "node:crypto";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

// One database state for the whole file: the second test builds on the first one's order.
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

const M1 = "/q/e2e-guest-m1";
const MR = { name: "Merit Royal", code: "ROYAL" };

test.beforeAll(() => {
  resetAndSeed({ guestMenu: true });
});

const card = (page: Page, name: string): Locator => page.locator("button.g-card", { hasText: name });
const badge = (page: Page): Locator => page.getByTestId("selection-count");

async function openMenuAdmin(browser: Browser): Promise<{ page: Page; win: Locator }> {
  // Own client IP: the login rate limiter allows 5 attempts per minute per IP.
  const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  const context = await browser.newContext({
    locale: "tr-TR",
    baseURL: (process.env.E2E_BASE_URL ?? "http://localhost:3000"),
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await context.newPage();
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: "başlat" }).click();
  await page.getByRole("menu", { name: "Başlat menüsü" }).getByRole("menuitem", { name: "Menü Yönetimi", exact: true }).click();
  const win = page.getByRole("region", { name: `Menü Yönetimi · ${MR.name}`, exact: true });
  const hotelCard = page
    .getByRole("region", { name: "Menü Yönetimi", exact: true })
    .getByRole("button", { name: new RegExp(`^${MR.name}\\s*${MR.code}$`) });
  await expect(hotelCard.or(win)).toBeVisible();
  if (await hotelCard.isVisible()) await hotelCard.click();
  await expect(win).toBeVisible();
  await win.getByRole("combobox", { name: "Outlet:" }).selectOption({ label: "Havuz Bar" });
  return { page, win };
}

let firstOrderUrl = "";

test("seçim ekle, gönder, durum sayfası, yenile ve garson çağır", async ({ page }) => {
  await page.goto(M1);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("M1");
  await expect(page.locator("body")).not.toContainText(/sepet|cart/i);
  await expect(badge(page)).toHaveCount(0);

  await card(page, "Mojito").click();
  const sheet = page.getByRole("dialog", { name: "Mojito" });
  await sheet.getByRole("button", { name: "+", exact: true }).click();
  await sheet.getByLabel("Not").fill("buzsuz");
  await sheet.getByRole("button", { name: "Seçimlere ekle" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(badge(page)).toHaveText("2");

  // The selections survive a reload (localStorage).
  await page.reload();
  await expect(badge(page)).toHaveText("2");

  await page.getByRole("button", { name: /^Seçimlerim/ }).click();
  const drawer = page.getByRole("dialog", { name: "Seçimlerim" });
  await expect(drawer.getByText("Mojito")).toBeVisible();
  await expect(drawer.locator(".g-price")).toHaveCount(0); // prices are hidden
  await expect(drawer.locator('input[type="text"]')).toHaveValue("buzsuz");
  await drawer.getByRole("button", { name: "Seçimleri gönder" }).click();

  await expect(page).toHaveURL(/\/siparis\/[^/]+$/);
  firstOrderUrl = new URL(page.url()).pathname;
  const status = page.getByRole("main");
  await expect(status.getByRole("heading", { level: 2 })).toContainText("#1");
  await expect(status.locator('li[aria-current="step"]')).toContainText("Gönderildi");
  await expect(status.getByText("2 × Mojito")).toBeVisible();
  await expect(status.getByText("buzsuz")).toBeVisible();
  await expect(status.locator(".g-price")).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0); // selections were cleared
  await expect(page.getByRole("navigation", { name: "Siparişlerim" })).toContainText("#1");

  // Server-rendered: the same state after a reload.
  await page.reload();
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toContainText("#1");
  await expect(page.getByRole("main").locator('li[aria-current="step"]')).toContainText("Gönderildi");

  // Back to the menu, then call the waiter.
  await page.getByRole("link", { name: "Menüye dön" }).click();
  await expect(page).toHaveURL(new RegExp(`${M1}$`));
  await page.getByRole("button", { name: "Garson çağır" }).click();
  const callSheet = page.getByRole("dialog", { name: "Size nasıl yardımcı olalım?" });
  await callSheet.getByRole("button", { name: "Sadece çağır" }).click();
  await expect(page.getByRole("status").filter({ hasText: "iletildi" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "iletildi" })).toHaveCount(0, { timeout: 6_000 }); // gone after ~3 s
});

test("sipariş kapanınca gönderim reddedilir, seçimler korunur, durum sayfası açılır", async ({ page, browser }) => {
  expect(firstOrderUrl).not.toBe("");
  await page.goto(M1);
  await card(page, "Aperol Spritz").click();
  await page.getByRole("dialog", { name: "Aperol Spritz" }).getByRole("button", { name: "Seçimlere ekle" }).click();
  await expect(badge(page)).toHaveText("1");
  await page.getByRole("button", { name: /^Seçimlerim/ }).click();
  const drawer = page.getByRole("dialog", { name: "Seçimlerim" });
  await expect(drawer.getByText("Aperol Spritz")).toBeVisible();

  // Admin switches ordering off while the guest is still filling the selections.
  const admin = await openMenuAdmin(browser);
  await admin.win.getByRole("switch", { name: "Sipariş açık" }).click();
  await admin.page.getByRole("button", { name: "Evet" }).click();
  await expect(admin.win.getByRole("switch", { name: "Sipariş açık" })).not.toBeChecked();

  await drawer.getByRole("button", { name: "Seçimleri gönder" }).click();
  await expect(drawer.getByText(/şu an sipariş alınmıyor/i)).toBeVisible();
  await expect(drawer.getByText("Aperol Spritz")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${M1}$`)); // no navigation
  await drawer.getByRole("button", { name: "Kapat" }).click();
  await expect(badge(page)).toHaveText("1"); // kept

  // The earlier order's status page still opens while ordering is off.
  await page.goto(firstOrderUrl);
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toContainText("#1");
  await expect(page.getByRole("main").locator('li[aria-current="step"]')).toContainText("Gönderildi");
  await admin.page.context().close();
});
