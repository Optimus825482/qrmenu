import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import type { Locator, Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

const desktop = (page: Page) => page.getByRole("region", { name: "Masaüstü" });

async function openTableQr(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "başlat" }).click();
  await page.getByRole("menu", { name: "Başlat menüsü" }).getByRole("menuitem", { name: "Masa QR Kodları" }).click();
  const win = page.getByRole("region", { name: "Masa QR Kodları · Merit Royal", exact: true });
  const card = page
    .getByRole("region", { name: "Masa QR Kodları", exact: true })
    .getByRole("button", { name: /^Merit Royal\s*MR$/ });
  await expect(card.or(win)).toBeVisible();
  if (await card.isVisible()) await card.click();
  await expect(win).toBeVisible();
  return win;
}

test("Masa QR: Havuz Bar M1..M5 toplu üretilir, rozetler imzalı olur, ZIP 5 SVG + csv içerir", async ({ page }) => {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(desktop(page)).toBeVisible();
  const win = await openTableQr(page);
  await win.getByLabel("Outlet", { exact: true }).selectOption({ label: "Havuz Bar" });

  for (const label of ["M1", "M2", "M3", "M4", "M5"]) {
    await expect(win.getByTestId(`tq-badge-${label}`)).toHaveText("QR yok");
  }

  await win.getByRole("button", { name: "Toplu üret/yenile" }).click();
  await page.getByRole("button", { name: "Evet" }).click();
  for (const label of ["M1", "M2", "M3", "M4", "M5"]) {
    await expect(win.getByTestId(`tq-badge-${label}`)).toHaveText("imzalı");
  }

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    win.getByRole("link", { name: "ZIP indir" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("MR_Havuz_Bar_QR.zip");
  const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
  expect(Object.keys(files).filter((n) => n.endsWith(".svg"))).toHaveLength(5);
  expect(Object.keys(files)).toContain("etiketler.csv");

  // Single regenerate asks first (danger confirm) and keeps the badge signed.
  await win.getByRole("button", { name: "M1 QR yenile" }).click();
  await expect(page.getByText(/Eski basılı kod çalışmayı bırakır/)).toBeVisible();
  await page.getByRole("button", { name: "Evet" }).click();
  await expect(win.getByTestId("tq-badge-M1")).toHaveText("imzalı");
});
