import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import type { Locator, Page } from "@playwright/test";
import { acknowledge, answer, appWindow } from "./definitionsUi";
import { expect, resetAndSeed, test } from "./fixtures";
import { openAdminShell } from "./menuUi";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

const TABLES = ["M1", "M2", "M3", "M4", "M5"];

/** The Masa QR Kodları window of Merit Royal with Havuz Bar chosen (the options carry table counts). */
async function openTableQr(page: Page, outlet = "Havuz Bar"): Promise<Locator> {
  const win = await appWindow(page, "Masa QR Kodları", "Merit Royal");
  const select = win.getByRole("combobox", { name: "Outlet seçimi" });
  const value = await select.locator("option", { hasText: outlet }).getAttribute("value");
  await select.selectOption(value ?? "");
  await expect(select.locator("option:checked")).toContainText(outlet);
  return win;
}

const badge = (win: Locator, label: string) => win.getByTestId(`tq-badge-${label}`);

test("Masa QR: Havuz Bar M1..M5 toplu üretilir, rozetler imzalı olur, ZIP 5 SVG + csv içerir", async ({ page }) => {
  await openAdminShell(page, "admin");
  const win = await openTableQr(page);
  for (const label of TABLES) {
    await expect(badge(win, label)).toHaveText("QR yok");
  }
  await expect(win.locator(".xp-tq-stats-chip")).toContainText("0 imzalı QR");

  // Bulk issue asks first (danger) and ends with the message box; every badge turns "imzalı".
  await win.getByRole("button", { name: "Toplu üret/yenile" }).click();
  await answer(page, "Toplu QR üret/yenile", "Evet");
  await acknowledge(page);
  for (const label of TABLES) {
    await expect(badge(win, label)).toHaveText("imzalı");
  }
  await expect(win.locator(".xp-tq-stats-chip")).toContainText("5 imzalı QR");
  // Signed tables offer their downloads.
  await expect(win.getByRole("link", { name: "M1 SVG indir" })).toBeVisible();
  await expect(win.getByRole("link", { name: "M1 PNG indir" })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    win.getByRole("link", { name: "ZIP indir" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("MR_Havuz_Bar_QR.zip");
  const files = unzipSync(new Uint8Array(readFileSync(await download.path())));
  expect(Object.keys(files).filter((n) => n.endsWith(".svg"))).toHaveLength(5);
  expect(Object.keys(files)).toContain("etiketler.csv");
  expect(new TextDecoder().decode(files["etiketler.csv"])).toContain("M1");

  // Single regenerate asks first (danger confirm) and keeps the badge signed.
  await win.getByRole("button", { name: "M1 QR yenile" }).click();
  const ask = page.getByRole("dialog", { name: "QR kodunu yenile" });
  await expect(ask).toContainText(/Eski basılı kod çalışmayı bırakır/);
  await ask.getByRole("button", { name: "Evet" }).click();
  await acknowledge(page);
  await expect(badge(win, "M1")).toHaveText("imzalı");
});

test("Masa QR: imzalar sunucuda kalır (yeni sayfa), 'Yalnız imzasızları' ile toplu üretim yapılacak masa yok", async ({ page }) => {
  await openAdminShell(page, "admin");
  const win = await openTableQr(page);
  for (const label of TABLES) {
    await expect(badge(win, label)).toHaveText("imzalı");
  }
  // Every table is signed: "only unsigned" bulk issue has nothing to do (0 tables).
  await expect(win.getByRole("checkbox", { name: "Yalnız imzasızları" })).toBeChecked();
  await win.getByRole("button", { name: "Toplu üret/yenile" }).click();
  await answer(page, "Toplu QR üret/yenile", "Evet");
  await expect(page.getByRole("alertdialog", { name: "İşlem tamamlandı" })).toContainText("0 masanın QR kodu güncellendi");
  await acknowledge(page);
  // Hayır leaves everything as it was.
  await win.getByRole("button", { name: "M2 QR yenile" }).click();
  await answer(page, "QR kodunu yenile", "Hayır");
  await expect(badge(win, "M2")).toHaveText("imzalı");
});
