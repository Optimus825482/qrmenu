import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { acknowledge, answer, appWindow, dismissError, deleteSelected, saveNew } from "./definitionsUi";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { createNode, openAdminShell, openMenuManager, setOrdering, setSoldOut, treeItem } from "./menuUi";

// One database state for the whole file (reset once): each test builds on the previous one.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

const PHOTO = path.resolve(__dirname, "assets/menu-photo.png");
const STUDIO = "Menü Tasarım Stüdyosu";

/** A theme row of the studio grid (its accessible name starts with the theme name, then the swatches). */
/**
 * The assignThemeAction round trip (its toast is optimistic; wait for the POST before reloading).
 * The studio fires other Server Actions of its own, so the request is told apart by its payload.
 */
const waitForAssign = (page: Page) =>
  page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      "next-action" in r.request().headers() &&
      (r.request().postData() ?? "").includes('"themeId"'),
  );

const themeRow = (win: Locator, name: string): Locator => win.getByRole("row", { name: new RegExp(`^${name} `) });

/** The studio window on its "Renkler" rail: the theme grid and the outlet assignments live there. */
async function openStudioThemes(page: Page): Promise<Locator> {
  const win = await appWindow(page, STUDIO);
  await win.getByRole("tab", { name: "Renkler" }).click();
  await expect(win.getByRole("grid")).toBeVisible();
  return win;
}

test("Menü Yönetimi: ağaç kur, tükendi, çeviri, görsel, sıra, sipariş kapat; yenilemede kalıcı", async ({ page }) => {
  await openAdminShell(page, "admin");
  const win = await openMenuManager(page);
  await expect(win.getByText("Bu outletin menüsü boş")).toBeVisible();

  // Kategori > Alt Kategori > Menü Öğesi (the created node stays selected, so the next level is enabled).
  await createNode(page, win, "Yeni Kategori", "İçecekler");
  await createNode(page, win, "Yeni Alt Kategori", "Soğuk");
  await createNode(page, win, "Yeni Menü Öğesi", "Mojito", "12");
  const mojito = treeItem(win, "Mojito");
  await expect(mojito).toContainText("12.00");
  await expect(mojito).toContainText("fotoğrafsız");
  await expect(win.getByRole("treeitem")).toHaveCount(3);

  // "Tükendi" switch of the form → confirm → "tükendi" badge in the tree.
  await setSoldOut(page, win, "Mojito", true);

  // Translation tab: EN "Mojito" is saved and verified at once ("Düzenle ve onayla").
  await win.getByRole("tab", { name: "Çeviriler" }).click();
  await win.getByRole("tab", { name: "EN", exact: true }).click();
  await win.getByLabel("Ad (EN)").fill("Mojito");
  await win.getByRole("button", { name: "Düzenle ve onayla" }).click();
  await answer(page, "Çeviriyi kaydet", "Evet");
  await acknowledge(page);
  await expect(win.getByText("EN çevirisi kaydedildi")).toBeVisible();
  await expect(win.getByText("Onaylı çeviri · misafir menüsünde gösteriliyor")).toBeVisible();

  // Photo upload (fixture PNG) → gallery image, the "fotoğrafsız" badge is gone; no studio needed.
  await win.getByRole("tab", { name: "Bilgiler" }).click();
  await win.locator('input[type="file"]').setInputFiles(PHOTO);
  await answer(page, "Yükleme Tamamlandı", "Hayır");
  await expect(win.getByRole("img", { name: "Mojito - 1" })).toBeVisible();
  await expect(mojito).not.toContainText("fotoğrafsız");

  // Ordering: a second category is appended; ↑ (confirm) puts it first.
  await createNode(page, win, "Yeni Kategori", "Yiyecekler");
  await expect(win.getByRole("treeitem").last()).toContainText("Yiyecekler");
  await win.getByRole("button", { name: "Yukarı taşı" }).click();
  await answer(page, "Menü sırasını güncelle", "Evet");
  await acknowledge(page);
  await expect(win.getByRole("treeitem").first()).toContainText("Yiyecekler");

  // Closing QR ordering: confirm → "QR sipariş kapalı" badge.
  await setOrdering(page, win, false);

  // Everything is on the server: a fresh page shows the same tree and switches.
  await page.reload();
  const again = await openMenuManager(page);
  await expect(again.getByRole("treeitem").first()).toContainText("Yiyecekler");
  await expect(treeItem(again, "Mojito")).toContainText("tükendi");
  await expect(treeItem(again, "Mojito")).not.toContainText("fotoğrafsız");
  await expect(again.getByText("QR sipariş kapalı", { exact: true })).toBeVisible();
  await expect(again.getByRole("switch", { name: "QR sipariş açık" })).not.toBeChecked();
});

test("Menü Tasarım Stüdyosu: yeni tema, Deniz'i Havuz Bar'a ata, varsayılan ve kullanılan tema silinemez", async ({ page }) => {
  await openAdminShell(page, "admin");
  const win = await openStudioThemes(page);

  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni tema" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Tema adı").fill("Test Teması");
  await dialog.getByLabel("Vurgu", { exact: true }).fill("#ff8800");
  await expect(dialog.getByRole("img", { name: "Önizleme" })).toBeVisible();
  await saveNew(page, dialog);
  await expect(themeRow(win, "Test Teması")).toBeVisible();

  // Assign "Deniz" to Havuz Bar (the admin has several hotels: choose MR first).
  await win.getByRole("combobox", { name: "Otel:" }).selectOption({ label: "Merit Royal" });
  const assigned = waitForAssign(page);
  await win.getByLabel("Tema: Havuz Bar").selectOption({ label: "Deniz" });
  await expect(win.locator(".xp-theme-toast")).toContainText("Havuz Bar: “Deniz” teması atandı");
  await expect(win.getByLabel("Tema: Havuz Bar")).toHaveValue(/.+/);
  expect((await assigned).ok()).toBe(true);

  // The assignment is on the server: a fresh window still shows it.
  await page.reload();
  const again = await openStudioThemes(page);
  await again.getByRole("combobox", { name: "Otel:" }).selectOption({ label: "Merit Royal" });
  await expect(again.getByLabel("Tema: Havuz Bar").locator("option:checked")).toHaveText("Deniz");

  // The default theme cannot be deleted; a theme in use is refused too.
  await themeRow(again, "Royal Gold").click();
  await again.getByRole("button", { name: "Seçili kaydı sil" }).click();
  await answer(page, "Temayı sil", "Evet");
  const refused = page.getByRole("alertdialog", { name: "Tema silinemedi" });
  await expect(refused).toContainText("Varsayılan tema silinemez");
  await dismissError(page, "Tema silinemedi");
  await themeRow(again, "Deniz").click();
  await again.getByRole("button", { name: "Seçili kaydı sil" }).click();
  await answer(page, "Temayı sil", "Evet");
  await expect(refused).toContainText(/tarafından kullanılıyor/);
  await dismissError(page, "Tema silinemedi");
  await expect(themeRow(again, "Deniz")).toBeVisible();

  // The unused "Test Teması" theme goes away for good.
  await themeRow(again, "Test Teması").click();
  await deleteSelected(page, again, "Temayı sil");
  await expect(themeRow(again, "Test Teması")).toHaveCount(0);
});

test("fbm.mr: Menü Yönetimi MR için açılır ve düzenler; stüdyoda tema yazamaz ama atayabilir", async ({ page }) => {
  await openAdminShell(page, "fbm.mr");
  const win = await openMenuManager(page);
  await expect(treeItem(win, "İçecekler")).toBeVisible();
  await expect(win.getByRole("button", { name: "Yeni Kategori" })).toBeVisible();
  // The F&B manager may reopen a sold-out item.
  await setSoldOut(page, win, "Mojito", false);

  const studio = await openStudioThemes(page);
  // System-wide theme writes are SISTEM-only: no create/delete buttons, but assignment works.
  await expect(studio.getByRole("button", { name: "Yeni kayıt" })).toHaveCount(0);
  await expect(studio.getByRole("button", { name: "Seçili kaydı sil" })).toHaveCount(0);
  const assigned = waitForAssign(page);
  await studio.getByLabel("Tema: Havuz Bar").selectOption({ label: "Zeytin" });
  await expect(studio.locator(".xp-theme-toast")).toContainText("Havuz Bar: “Zeytin” teması atandı");
  expect((await assigned).ok()).toBe(true);
  await expect(page.getByRole("alertdialog")).toHaveCount(0); // no "Tema atanamadı"
});

test("garson.havuz: yönetim kabuğuna giremez (menüde düzenleme yüzeyi yok)", async ({ page }) => {
  // Outlet field roles work in the ops screens: the login page offers the outlet cards, not the shell.
  await login(page, "garson.havuz");
  await expect(page.getByRole("heading", { name: "Çalışacağınız outleti seçin" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Havuz Bar/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Masaüstü" })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin$/);
  await expect(page.getByRole("region", { name: "Masaüstü" })).toHaveCount(0);
});
