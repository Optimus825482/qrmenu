import { expect, login, test } from "./fixtures";
import { seedMinibar } from "./acceptance/helpers/minibar";

test.beforeEach(() => seedMinibar());

test("390 px Stoklarım: tüm sütunlar tablonun kendi kaydırma alanından erişilir", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "kat.mr");
  await page.waitForURL(url => !url.pathname.startsWith("/giris"));
  await page.goto("/kat/stok");
  const table = page.getByTestId("stok-tablo");
  await expect(table.getByRole("row")).toHaveCount(7);
  const container = table.locator("..");
  const geometry = await container.evaluate(element => {
    const box = element as HTMLElement;
    box.scrollLeft = box.scrollWidth;
    return { scrollLeft: box.scrollLeft, width: box.clientWidth, contentWidth: box.scrollWidth };
  });
  expect(geometry.contentWidth).toBeGreaterThan(geometry.width);
  expect(geometry.scrollLeft, "sütunlar sayfa dışına taşmak yerine kendi alanında kaydırılmalı").toBeGreaterThan(0);
  const region = page.getByRole("region", { name: "Stok listesi" });
  await expect(region).toHaveAttribute("tabindex", "0");
  await region.evaluate(element => { element.scrollLeft = 0; });
  await region.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  // Each complete header and value can be brought inside the viewport, including the last columns.
  for (const label of ["Ürün", "Grup", "Toplam", "Kullanılan", "Kalan", "Durum"]) {
    const header = table.getByRole("columnheader", { name: label, exact: true });
    await header.scrollIntoViewIfNeeded();
    const bounds = await header.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  await expect(table.getByRole("row").filter({ hasText: "Kola" })).toContainText("Normal");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const main = await page.getByTestId("kat-stok").boundingBox();
  expect(main!.x + main!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("stock-mobile-after.png") });
});

test("masaüstünde Stoklarım tablosunun altı sütunu veri kaybetmeden görünür", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, "kat.mr");
  await page.waitForURL(url => !url.pathname.startsWith("/giris"));
  await page.goto("/kat/stok");
  const table = page.getByTestId("stok-tablo");
  await expect(table.getByRole("columnheader")).toHaveCount(6);
  await expect(table.getByRole("row")).toHaveCount(7);
  await expect(table.getByRole("link", { name: "Kola", exact: true })).toBeVisible();
  expect(await table.locator("..").evaluate(element => element.scrollWidth - element.clientWidth)).toBe(0);
});
