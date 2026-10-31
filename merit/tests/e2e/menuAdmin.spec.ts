import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

// One database state for the whole file (reset once): each test builds on the previous one.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

const MR = { name: "Merit Royal", code: "MR" };
const PHOTO = path.resolve(__dirname, "assets/menu-photo.png");

const desktop = (page: Page) => page.getByRole("region", { name: "Masaüstü" });

async function openApp(page: Page, title: string, hotel?: { name: string; code: string }): Promise<Locator> {
  await page.getByRole("button", { name: "başlat" }).click();
  await page.getByRole("menu", { name: "Başlat menüsü" }).getByRole("menuitem", { name: title }).click();
  if (!hotel) {
    const win = page.getByRole("region", { name: title, exact: true }).first();
    await expect(win).toBeVisible();
    return win;
  }
  const win = page.getByRole("region", { name: `${title} · ${hotel.name}`, exact: true });
  // Users with several hotels pick one first; a single-hotel user gets the window straight away.
  const card = page
    .getByRole("region", { name: title, exact: true })
    .getByRole("button", { name: new RegExp(`^${hotel.name}\\s*${hotel.code}$`) });
  await expect(card.or(win)).toBeVisible();
  if (await card.isVisible()) await card.click();
  await expect(win).toBeVisible();
  return win;
}

async function openAdmin(page: Page, user: string) {
  await login(page, user);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(desktop(page)).toBeVisible();
}

/** Opens a creation dialog button, fills the name (and price) and submits. */
async function createNode(win: Locator, button: string, name: string, price?: string) {
  await win.getByRole("button", { name: button, exact: true }).click();
  const dialog = win.getByRole("dialog");
  await dialog.getByLabel("Ad", { exact: true }).fill(name);
  if (price) await dialog.getByLabel("Fiyat").fill(price);
  await dialog.getByRole("button", { name: "Oluştur" }).click();
  await expect(dialog).toBeHidden();
  await expect(win.getByRole("treeitem", { name: new RegExp(name) })).toBeVisible();
}

test("Menü Yönetimi: ağaç kur, tükendi, çeviri, görsel, sipariş kapat", async ({ page }) => {
  await openAdmin(page, "admin");
  const win = await openApp(page, "Menü Yönetimi", MR);
  await win.getByLabel("Outlet", { exact: true }).selectOption({ label: "Havuz Bar" });

  await createNode(win, "Yeni Kategori", "İçecekler");
  await createNode(win, "Yeni Alt Kategori", "Soğuk");
  await createNode(win, "Yeni Grup", "Kokteyller");
  await createNode(win, "Yeni Öğe", "Mojito", "12");

  const mojito = win.getByRole("treeitem", { name: /Mojito/ });
  await expect(mojito).toContainText("12.00");
  await expect(mojito).toContainText("fotoğrafsız");

  // Availability switch → "tükendi" badge in the tree.
  await win.getByRole("switch", { name: "Tükendi" }).click();
  await expect(mojito).toContainText("tükendi");

  // Translation tab: EN "Mojito".
  await win.getByRole("tab", { name: "Çeviriler" }).click();
  await win.getByRole("tab", { name: "EN", exact: true }).click();
  await win.getByLabel("Ad (EN)").fill("Mojito");
  await win.getByRole("button", { name: "Çeviriyi kaydet" }).click();
  await expect(win.getByText("EN çevirisi kaydedildi")).toBeVisible();

  // Image upload (fixture PNG) → preview, badge gone.
  await win.getByRole("tab", { name: "Bilgiler" }).click();
  await win.getByLabel("Görsel yükle").setInputFiles(PHOTO);
  await expect(win.getByRole("img", { name: "Mojito görseli" })).toBeVisible();
  await expect(mojito).not.toContainText("fotoğrafsız");

  // Moving: a second category goes below, ↑ puts it first.
  await win.getByRole("treeitem", { name: /İçecekler/ }).click();
  await createNode(win, "Yeni Kategori", "Yiyecekler");
  await win.getByRole("button", { name: "Yukarı taşı" }).click();
  await expect(win.getByRole("treeitem").first()).toContainText("Yiyecekler");

  // Closing ordering: confirm → "sipariş kapalı" badge.
  await expect(win.getByText("siparişe açık")).toBeVisible();
  await win.getByRole("switch", { name: "Sipariş açık" }).click();
  await page.getByRole("button", { name: "Evet" }).click();
  await expect(win.getByText("sipariş kapalı")).toBeVisible();
});

test("Tema Yönetimi: yeni tema, Deniz'i Havuz Bar'a ata, varsayılan silinemez", async ({ page }) => {
  await openAdmin(page, "admin");
  const win = await openApp(page, "Tema Yönetimi");

  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const dialog = win.getByRole("dialog");
  await dialog.getByLabel("Tema adı").fill("Gece");
  await dialog.getByLabel("Vurgu", { exact: true }).fill("#ff8800");
  await expect(dialog.getByRole("img", { name: "Önizleme" })).toBeVisible();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(win.getByRole("row").filter({ hasText: "Gece" })).toBeVisible();

  // Assign "Deniz" to Havuz Bar (the admin has several hotels: choose MR first).
  await win.getByRole("combobox", { name: "Otel" }).selectOption({ label: "Merit Royal" });
  await win.getByLabel("Tema: Havuz Bar").selectOption({ label: "Deniz" });
  await expect(win.getByText("Havuz Bar: tema kaydedildi")).toBeVisible();
  await expect(win.getByLabel("Tema: Havuz Bar")).toHaveValue(/.+/);

  // The default theme cannot be deleted; a theme in use is refused too.
  await win.getByRole("row").filter({ hasText: "Royal Gold" }).click();
  await win.getByRole("button", { name: "Seçili kaydı sil" }).click();
  await page.getByRole("button", { name: "Evet" }).click();
  await expect(page.getByText("Varsayılan tema silinemez")).toBeVisible();
  await page.getByRole("button", { name: "Tamam" }).click();
  await win.getByRole("row").filter({ hasText: "Deniz" }).click();
  await win.getByRole("button", { name: "Seçili kaydı sil" }).click();
  await page.getByRole("button", { name: "Evet" }).click();
  await expect(page.getByText(/tarafından kullanılıyor/)).toBeVisible();
  await page.getByRole("button", { name: "Tamam" }).click();
});

test("fbm.mr: Menü Yönetimi MR için açılır, Havuz Bar menüsünü düzenler, temayı atar", async ({ page }) => {
  await openAdmin(page, "fbm.mr");
  const win = await openApp(page, "Menü Yönetimi", MR);
  await win.getByLabel("Outlet", { exact: true }).selectOption({ label: "Havuz Bar" });
  await expect(win.getByRole("treeitem", { name: /İçecekler/ })).toBeVisible();
  await expect(win.getByRole("button", { name: "Yeni Kategori" })).toBeVisible();

  const themes = await openApp(page, "Tema Yönetimi");
  // System-wide theme writes are SISTEM-only: no create button, but assignment works.
  await expect(themes.getByRole("button", { name: "Yeni kayıt" })).toHaveCount(0);
  await themes.getByLabel("Tema: Havuz Bar").selectOption({ label: "Zeytin" });
  await expect(themes.getByText("Havuz Bar: tema kaydedildi")).toBeVisible();
});

test("garson.havuz: yönetim kabuğuna giremez (menüde düzenleme yüzeyi yok)", async ({ page }) => {
  // Outlet field roles work in the ops screens: the admin shell (and its Menü Yönetimi) lands them on the outlet selection (/secim).
  await login(page, "garson.havuz");
  await expect(page).toHaveURL(/\/secim$/);
  await expect(page.getByText("Havuz Bar")).toBeVisible();
  await expect(page.getByRole("region", { name: "Masaüstü" })).toHaveCount(0);
});
