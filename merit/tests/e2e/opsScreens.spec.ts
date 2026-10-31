import { randomInt } from "node:crypto";
import { expect, login, resetAndSeed, test } from "./fixtures";

test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });
test.beforeAll(() => resetAndSeed({ guestMenu: true }));

test("misafir siparişi, kasa masa ataması ve garson onayı Masalarım akışına düşer", async ({ page, browser }) => {
  await page.goto("/q/e2e-guest-m1");
  await page.locator("button.g-card", { hasText: "Mojito" }).click();
  await page.getByRole("dialog", { name: "Mojito" }).getByRole("button", { name: "Seçimlere ekle" }).click();
  await page.getByRole("button", { name: /^Seçimlerim/ }).click();
  await page.getByRole("dialog", { name: "Seçimlerim" }).getByRole("button", { name: "Seçimleri gönder" }).click();
  await expect(page).toHaveURL(/\/siparis\/[^/]+$/);
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toContainText("#1");

  const waiterContext = await browser.newContext({ baseURL: "http://localhost:3000", locale: "tr-TR", extraHTTPHeaders: { "x-forwarded-for": `10.20.${randomInt(1, 255)}.${randomInt(1, 255)}` } });
  const waiter = await waiterContext.newPage();
  await login(waiter, "garson.havuz");
  await expect(waiter).toHaveURL(/\/secim$/);
  await waiter.getByRole("button", { name: "Havuz Bar · Merit Royal" }).click();
  await expect(waiter).toHaveURL(/\/garson$/);
  await expect(waiter.locator("header")).toContainText("Havuz Bar · Merit Royal");
  const approve = waiter.getByRole("button", { name: "Onayla" });
  await expect(approve).toBeDisabled();

  const cashierContext = await browser.newContext({ baseURL: "http://localhost:3000", locale: "tr-TR", extraHTTPHeaders: { "x-forwarded-for": `10.21.${randomInt(1, 255)}.${randomInt(1, 255)}` } });
  const cashier = await cashierContext.newPage();
  await login(cashier, "kasa.havuz");
  await expect(cashier).toHaveURL(/\/kasa$/);
  await cashier.getByRole("combobox", { name: "Garson · M1" }).selectOption({ label: "Test garson.havuz" });
  await cashier.getByRole("button", { name: "Ata M1" }).click();

  await expect(approve).toBeEnabled({ timeout: 10_000 });
  await approve.click();
  await expect(waiter.getByRole("button", { name: "Onayla" })).toHaveCount(0);
  await waiter.getByRole("button", { name: "Masalarım" }).click();
  await expect(waiter.getByRole("navigation", { name: "Personel bölümleri" }).getByRole("link", { name: "Masalarım" })).toHaveAttribute("aria-current", "page");
  await expect(waiter.getByRole("heading", { name: "M1" })).toBeVisible();
  await expect(waiter.getByText("#1 · ONAYLANDI")).toBeVisible();

  await waiter.getByRole("combobox", { name: "Outlet değiştir" }).selectOption({ label: "Beach Bar · Merit Royal" });
  await expect(waiter.locator("header")).toContainText("Beach Bar · Merit Royal");
  await waiterContext.close();
  await cashierContext.close();
});
