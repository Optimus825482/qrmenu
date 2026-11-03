import type { Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "../fixtures";
import { projectName } from "./viewports";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

// The keyboard flow belongs to the desktop shell: only the 1366x768 project drives it.
test.beforeEach(() => {
  test.skip(projectName() !== "desktop-1366x768", "XP klavye akışı yalnız masaüstü görünümünde");
});

const appWindow = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** Start button + typed query + ArrowDown to the first result + Enter, hands off the mouse entirely. */
async function openByKeyboard(page: Page, query: string) {
  await page.getByRole("button", { name: "başlat" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#xp-start-menu")).toBeVisible();
  await page.keyboard.type(query);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
}

test("yalnız klavyeyle: Başlat, uygulama aç, F10 > D > K ile kapat", async ({ page }) => {
  await login(page, "admin");
  await expect(page.getByRole("region", { name: "Masaüstü" })).toBeVisible();

  await openByKeyboard(page, "Denetim Günlüğü");
  const audit = appWindow(page, "Denetim Günlüğü");
  await expect(audit).toBeVisible();
  await expect(audit).toBeFocused();

  await page.keyboard.press("F10");
  await expect(audit.getByRole("menuitem", { name: "Dosya" })).toBeFocused();
  await page.keyboard.press("d");
  await expect(page.getByRole("menu", { name: "Dosya" })).toBeVisible();
  await page.keyboard.press("k");
  await expect(audit).toHaveCount(0);
});

test("Ctrl+Alt+Sağ pencere değiştirir; F5 listeyi yeniler; Ctrl+S formu kaydeder", async ({ page }) => {
  await login(page, "admin");
  await expect(page.getByRole("region", { name: "Masaüstü" })).toBeVisible();

  await openByKeyboard(page, "Denetim Günlüğü");
  await expect(appWindow(page, "Denetim Günlüğü")).toBeFocused();
  await openByKeyboard(page, "Kullanıcı Yönetimi");
  const users = appWindow(page, "Kullanıcı Yönetimi");
  await expect(users).toBeFocused();

  await page.keyboard.press("Control+Alt+ArrowRight");
  await expect(appWindow(page, "Denetim Günlüğü")).toBeFocused();
  await page.keyboard.press("Control+Alt+ArrowLeft");
  await expect(users).toBeFocused();

  // F5 presses the toolbar's "Yenile" button: the list is requested again.
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const before = requests.length;
  await page.keyboard.press("F5");
  await expect.poll(() => requests.length).toBeGreaterThan(before);

  // Ctrl+S in the open edit form does what the Kaydet button does: it asks to confirm the change.
  await users.getByRole("row").filter({ hasText: "kat.mr" }).first().click();
  await users.getByRole("button", { name: "Seçili kaydı düzenle" }).click();
  await expect(page.locator("#xp-dialog-root [role=dialog]").first()).toBeVisible();
  await page.keyboard.press("Control+s");
  const confirmBox = page.getByRole("dialog", { name: "Değişikliği onayla", exact: true });
  await expect(confirmBox).toBeVisible();
  await confirmBox.locator('[data-confirm="cancel"]').click();
});
