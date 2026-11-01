import type { Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const desktop = (page: Page) => page.getByRole("region", { name: "Masaüstü" });

async function openAdmin(page: Page) {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(desktop(page)).toBeVisible();
}

const MR = { name: "Merit Royal", code: "ROYAL" };

/** Başlat → Online Kullanıcılar, then the hotel card. */
async function openOnline(page: Page, hotel: { name: string; code: string }) {
  await page.getByRole("button", { name: "başlat" }).click();
  await page
    .getByRole("menu", { name: "Başlat menüsü" })
    .getByRole("menuitem", { name: "Online Kullanıcılar", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Online Kullanıcılar", exact: true })
    .getByRole("button", { name: new RegExp(`^${hotel.name}\\s*${hotel.code}$`) })
    .click();
  const win = page.getByRole("region", { name: `Online Kullanıcılar · ${hotel.name}`, exact: true });
  await expect(win).toBeVisible();
  return win;
}

test("admin listesi açıkken kat.mr 2 sn içinde görünür; zorla çıkış kat.mr oturumunu /giris yapar", async ({
  page,
  browser,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const win = await openOnline(page, MR);

  const katContext = await browser.newContext({
    baseURL: "http://localhost:3000",
    extraHTTPHeaders: { "x-forwarded-for": "10.42.8.8" },
  });
  try {
    const kat = await katContext.newPage();
    await login(kat, "kat.mr");
    await expect(kat).toHaveURL(/\/kat$/);
    await expect(win.getByRole("row", { name: /kat\.mr/ })).toBeVisible({ timeout: 2000 });

    await win.getByRole("row", { name: /kat\.mr/ }).click();
    await win.getByRole("button", { name: "Zorla çıkış" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Evet" }).click();
    await expect(kat).toHaveURL(/\/giris/, { timeout: 5000 });
  } finally {
    await katContext.close();
  }

  expect(errors).toEqual([]);
});
