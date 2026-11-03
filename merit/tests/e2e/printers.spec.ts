import { randomInt } from "node:crypto";
import type { Browser, Locator, Page } from "@playwright/test";
import { acknowledge, saveNew, findStartItem } from "./definitionsUi";
import { expect, login, resetAndSeed, test } from "./fixtures";

test.use({ locale: "tr-TR" });

const MR = { name: "Merit Royal", code: "ROYAL" };

test.beforeAll(() => resetAndSeed());

async function openPrinters(browser: Browser): Promise<{ page: Page; win: Locator }> {
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
  await (await findStartItem(page, "Yazıcılar")).click();
  const win = page.getByRole("region", { name: `Yazıcılar · ${MR.name}`, exact: true });
  const hotelCard = page
    .getByRole("region", { name: "Yazıcılar", exact: true })
    .getByRole("button", { name: new RegExp(`^${MR.name} logosu\\s+${MR.name}$`) });
  await expect(hotelCard.or(win)).toBeVisible();
  if (await hotelCard.isVisible()) await hotelCard.click();
  await expect(win).toBeVisible();
  return { page, win };
}

test("yazıcı CRUD ve test fişi kasa kuyruğuna düşer", async ({ browser }) => {
  const { page: admin, win } = await openPrinters(browser);
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const dialog = admin.getByRole("dialog", { name: "Yeni yazıcı" });
  await dialog.getByLabel("Ad").fill("Kasa Yazıcı");
  await dialog.getByLabel("IP").fill("192.168.1.50");
  await saveNew(admin, dialog);
  await expect(win.getByRole("gridcell", { name: "Kasa Yazıcı", exact: true })).toBeVisible();
  await expect(win.getByText("görülmedi")).toBeVisible();
  await win.getByRole("button", { name: "Seçili yazıcıya test fişi gönder" }).click();
  await acknowledge(admin, /test fişi kuyruğa alındı/);
  await admin.close();

  const cashierContext = await browser.newContext({
    locale: "tr-TR",
    baseURL: (process.env.E2E_BASE_URL ?? "http://localhost:3000"),
    extraHTTPHeaders: { "x-forwarded-for": `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}` },
  });
  const cashier = await cashierContext.newPage();
  await login(cashier, "kasa.havuz");
  await cashier.getByRole("button", { name: /Havuz Bar/ }).click();
  await expect(cashier).toHaveURL(/\/kasa$/);
  await cashier.goto("/kasa/yazici");
  await expect(cashier.getByRole("heading", { name: "Fiş Yazıcı Kuyruğu" })).toBeVisible();
  await expect(cashier.getByRole("row").filter({ hasText: "Test fişi" })).toContainText("KUYRUKTA");
  await cashierContext.close();
});
