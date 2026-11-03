import type { Page } from "@playwright/test";
import { findStartItem, startMenuItem } from "./definitionsUi";
import { expect, login, resetAndSeed, test } from "./fixtures";

// One database state for the whole file: the "recent apps" list written by one step is read by the next.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

const startButton = (page: Page) => page.getByRole("button", { name: "başlat" });
const startMenu = (page: Page) => page.locator("#xp-start-menu");

async function openStart(page: Page) {
  if (!(await startMenu(page).isVisible())) await startButton(page).click();
  await expect(startMenu(page)).toBeVisible();
}

test("Başlat menüsü: son kullanılanlar, arama, Tüm Programlar ve sağ sütun", async ({ page }) => {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("region", { name: "Masaüstü" })).toBeVisible();

  await openStart(page);
  const recent = page.getByRole("group", { name: "Son kullanılanlar" });
  await expect(recent.getByRole("menuitem")).toHaveCount(0);

  // Open and close an app: it becomes the first recent entry.
  await (await findStartItem(page, "Menü Yönetimi")).click();
  const win = page.getByRole("region", { name: "Menü Yönetimi", exact: true });
  await expect(win).toBeVisible();
  await win.getByRole("button", { name: "Kapat", exact: true }).click();
  await expect(win).toHaveCount(0);
  await openStart(page);
  await expect(recent.getByRole("menuitem").first()).toHaveText("Menü Yönetimi");

  // Search narrows by app name.
  const search = page.getByRole("searchbox", { name: "Uygulama ara" });
  await search.fill("yazıcı");
  const results = page.getByRole("group", { name: "Arama sonuçları" }).getByRole("menuitem");
  await expect(results).toHaveCount(1);
  await expect(results.first()).toHaveText("Yazıcılar");
  await search.fill("");

  // All programs: the six category folders.
  await page.getByRole("menuitem", { name: /Tüm Programlar/ }).click();
  const programs = page.getByRole("menu", { name: "Tüm Programlar" });
  await expect(programs.getByRole("menuitem")).toHaveText([/Outlet/, /Oda Servisi/, /Minibar/, /Raporlar/, /Sistem/, /Kullanıcı/]);

  // Right column.
  const right = page.getByRole("menu", { name: "Sistem kısayolları" });
  await expect(right.getByRole("menuitem", { name: "Erişimim" })).toBeVisible();
  await expect(right.getByRole("menuitem", { name: "Denetim Masası" })).toBeVisible();
  await expect(right.getByRole("menuitem", { name: "Yardım ve Destek" })).toBeVisible();
  await expect(startMenu(page).getByRole("button", { name: "Oturumu Kapat" })).toBeVisible();
  await expect(startMenuItem(page, "Menü Yönetimi")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("tepsi: yazıcı, veritabanı ve bildirim simgeleri ipucu taşır; veritabanı yeşil", async ({ page }) => {
  await login(page, "admin");
  await expect(page.getByRole("region", { name: "Masaüstü" })).toBeVisible();
  const printer = page.getByTestId("tray-printer");
  const db = page.getByTestId("tray-db");
  await expect(printer).toHaveAttribute("title", /^Yazıcı:/);
  await expect(db).toHaveAttribute("title", /^Veritabanı:/);
  await expect(page.locator(".xp-bell-button")).toHaveAttribute("title", /^Bildirimler/);
  await expect(db).toHaveAttribute("data-state", "ok");
  const color = await db.evaluate((el) => getComputedStyle(el).borderBottomColor);
  expect(color).toBe("rgb(60, 207, 60)");
  await db.click();
  await expect(page.getByRole("status").filter({ hasText: "Veritabanı: bağlı" }).first()).toBeVisible();
});

test("iframe'siz minibar: Doluluk Yükleme yeni sekmede açılır, görev çubuğuna pencere eklenmez", async ({ page, context }) => {
  await login(page, "admin");
  await expect(page.getByRole("region", { name: "Masaüstü" })).toBeVisible();
  const popup = context.waitForEvent("page");
  await (await findStartItem(page, "Doluluk Yükleme")).click();
  const opened = await popup;
  const url = new URL(opened.url());
  expect(url.pathname).toBe("/depo/doluluk-yukle");
  expect(url.searchParams.get("mod")).toBe("personel");
  await opened.close();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Açık pencereler" }).getByRole("button")).toHaveCount(0);
});

test("1366x768: Menü Tasarım Merkezi penceresi görünür alana sığar", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(page, "admin");
  await expect(page.getByRole("region", { name: "Masaüstü" })).toBeVisible();
  await (await findStartItem(page, "Menü Tasarım Merkezi")).click();
  const win = page.getByRole("region", { name: "Menü Tasarım Merkezi", exact: true });
  await expect(win).toBeVisible();
  const taskbar = await page.locator(".xp-taskbar").boundingBox();
  const box = await win.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(1366);
  expect(box!.y + box!.height).toBeLessThanOrEqual(taskbar!.y + 1);
});
