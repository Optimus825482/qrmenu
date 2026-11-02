import { randomInt } from "node:crypto";
import type { Browser, Locator, Page } from "@playwright/test";
import { acknowledge, answer, appWindow } from "./definitionsUi";
import { expect, login } from "./fixtures";

/**
 * Shared selectors of the Menü Yönetimi window (QM-MEN). Every write goes through one "danger"
 * confirm box (confirm button, `answer(..., "Evet")`) and ends with a non-blocking success notice
 * (`acknowledge`, role "status"); the FormDialog of a
 * new record is portaled above the shell, so it is looked up on the page, not inside the window.
 */

export const MR = { name: "Merit Royal", code: "ROYAL" };

export const baseURL = (): string => process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** A page in its own browser context with its own client IP (login rate limit: 5/min per IP). */
export async function newContextPage(browser: Browser, locale = "tr-TR"): Promise<Page> {
  const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  const context = await browser.newContext({
    locale,
    baseURL: baseURL(),
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  return context.newPage();
}

/** Logs `user` into the admin shell and waits for the desktop. */
export async function openAdminShell(page: Page, user = "admin"): Promise<void> {
  await login(page, user);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("region", { name: "Masaüstü" })).toBeVisible();
}

/** The Menü Yönetimi window of `hotel` with `outlet` chosen in the toolbar. */
export async function openMenuManager(page: Page, outlet = "Havuz Bar", hotel = MR.name): Promise<Locator> {
  const win = await appWindow(page, "Menü Yönetimi", hotel);
  await win.getByRole("combobox", { name: "Outlet:" }).selectOption({ label: outlet });
  return win;
}

export const treeItem = (win: Locator, name: string): Locator =>
  win.getByRole("treeitem", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });

/** Creates a node through a toolbar button ("Yeni Kategori", "Yeni Alt Kategori", "Yeni Menü Öğesi"). */
export async function createNode(page: Page, win: Locator, button: string, name: string, price?: string): Promise<void> {
  await win.getByRole("button", { name: button, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^Yeni / });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Ad", { exact: true }).fill(name);
  if (price) await dialog.getByLabel("Fiyat").fill(price);
  await dialog.getByRole("button", { name: "Oluştur" }).click();
  await acknowledge(page);
  await expect(dialog).toHaveCount(0);
  await expect(treeItem(win, name)).toBeVisible();
}

/** Selects `name` in the tree and sets its "Tükendi" switch (confirm, then the message box). */
export async function setSoldOut(page: Page, win: Locator, name: string, soldOut: boolean): Promise<void> {
  await treeItem(win, name).click();
  const toggle = win.getByRole("switch", { name: "Tükendi" });
  await expect(toggle).toBeVisible();
  if ((await toggle.isChecked()) !== soldOut) {
    await toggle.click();
    await answer(page, "Menü durumunu güncelle", "Evet");
    await acknowledge(page);
  }
  if (soldOut) await expect(treeItem(win, name)).toContainText("tükendi");
  else await expect(treeItem(win, name)).not.toContainText("tükendi");
}

/** Flips the outlet's "QR sipariş açık" switch (confirm, then the message box). */
export async function setOrdering(page: Page, win: Locator, enabled: boolean): Promise<void> {
  const toggle = win.getByRole("switch", { name: "QR sipariş açık" });
  await expect(toggle).toBeVisible();
  if ((await toggle.isChecked()) === enabled) return;
  await toggle.click();
  await answer(page, enabled ? "Siparişi aç" : "Siparişi kapat", "Evet");
  await acknowledge(page);
  await expect(win.getByText(enabled ? "QR siparişe açık" : "QR sipariş kapalı", { exact: true })).toBeVisible();
}

/** Chooses the outlet's price display (confirm, then the message box). */
export async function setPriceDisplay(page: Page, win: Locator, value: "SHOW" | "HIDE" | "INHERIT"): Promise<void> {
  const select = win.getByLabel("Fiyat gösterimi");
  await select.selectOption(value);
  await answer(page, "Fiyat gösterimi", "Evet");
  await acknowledge(page);
  await expect(select).toHaveValue(value);
}
