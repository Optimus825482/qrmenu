import type { Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

// One database state for the whole file (reset once): prefs saved by one test are seen by the next.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

/** Collects console errors and uncaught page errors for the current page. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const desktop = (page: Page) => page.getByRole("region", { name: "Masaüstü" });
const icon = (page: Page, name: string) =>
  desktop(page).getByRole("button", { name, exact: true });
const appWindow = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** The debounced (1 s) prefs save: a Server Action POST carrying the Next-Action header. */
const waitForPrefsSave = (page: Page) =>
  page.waitForResponse(
    (r) => r.request().method() === "POST" && "next-action" in r.request().headers(),
  );

async function openAdmin(page: Page) {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(desktop(page)).toBeVisible();
}

test("kat.mr (yönetim rolü değil) /admin → /secim", async ({ page }) => {
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/kat$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/secim$/);
});

test("masaüstü: Komuta Merkezi simgesi; çift tık → pencere; sürükle; görev çubuğu; kapat", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  await expect(icon(page, "Komuta Merkezi")).toBeVisible();

  await icon(page, "Komuta Merkezi").dblclick();
  const win = appWindow(page, "Komuta Merkezi");
  await expect(win).toBeVisible();
  const titleBar = win.getByTestId("window-titlebar");
  await expect(titleBar).toHaveText(/Komuta Merkezi/);
  await expect(win.getByTestId("kpi-hotels")).toBeVisible();
  await expect(win.getByText(/Kullanıcı: Sistem Yöneticisi/)).toBeVisible();

  const left = () => win.evaluate((el) => parseFloat((el as HTMLElement).style.left));
  const before = await left();
  const box = (await titleBar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 3 + 100, box.y + box.height / 2 + 10, { steps: 8 });
  await page.mouse.up();
  await expect.poll(left).toBeGreaterThan(before);
  expect(await left()).toBeCloseTo(before + 100, 0);

  // The taskbar button minimizes the active window and brings it back.
  const taskButton = page
    .getByRole("toolbar", { name: "Açık pencereler" })
    .getByRole("button", { name: "Komuta Merkezi" });
  await taskButton.click();
  await expect(win).toBeHidden();
  await taskButton.click();
  await expect(win).toBeVisible();

  const saved = waitForPrefsSave(page);
  await win.getByRole("button", { name: "Kapat" }).click();
  await expect(appWindow(page, "Komuta Merkezi")).toHaveCount(0);
  await saved; // the next test must not restore this window
  expect(errors).toEqual([]);
});

test("Başlat menüsü Komuta Merkezi'ni listeler ve açar; Esc kapatır", async ({ page }) => {
  await openAdmin(page);
  const start = page.getByRole("button", { name: "başlat" });
  await start.click();
  const menu = page.getByRole("menu", { name: "Başlat menüsü" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Komuta Merkezi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Oturumu Kapat" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await start.click();
  await menu.getByRole("menuitem", { name: "Komuta Merkezi" }).click();
  await expect(appWindow(page, "Komuta Merkezi")).toBeVisible();
  await expect(menu).toBeHidden();
  await appWindow(page, "Komuta Merkezi").getByRole("button", { name: "Kapat" }).click();
  await expect(appWindow(page, "Komuta Merkezi")).toHaveCount(0);
});

test("otel bağlamı: çok otelli kapsamda pencere önce otel kartı ister", async ({ page }) => {
  await openAdmin(page);
  await icon(page, "Online Kullanıcılar").dblclick();
  const win = appWindow(page, "Online Kullanıcılar");
  await expect(win.getByRole("heading", { name: "Otel seçin" })).toBeVisible();
  await win.getByRole("button", { name: /Merit Royal Premium/ }).click();
  const named = appWindow(page, "Online Kullanıcılar · Merit Royal Premium");
  await expect(named).toBeVisible();
  await expect(named.getByText(/Otel: Merit Royal Premium/)).toBeVisible();
  await named.getByRole("button", { name: "Kapat" }).click();
  await expect(named).toHaveCount(0);
});

test("sağ tık → Duvar kağıdı → Royal Gold; yenilemeden sonra korunur", async ({ page }) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const box = (await desktop(page).boundingBox())!;
  await page.mouse.click(box.x + box.width - 200, box.y + box.height - 200, { button: "right" });
  const menu = page.getByRole("menu", { name: "Masaüstü menüsü" });
  await expect(menu.getByRole("menuitem", { name: "Simgeleri hizala" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "Duvar kağıdı" }).click();
  const saved = waitForPrefsSave(page);
  await page.getByRole("menuitemradio", { name: "Royal Gold" }).click();
  await expect(page.locator("[data-wallpaper]")).toHaveAttribute("data-wallpaper", "royal-gold");
  await expect(menu).toBeHidden();
  expect((await saved).ok()).toBe(true);

  await page.reload();
  await expect(desktop(page)).toBeVisible();
  await expect(page.locator("[data-wallpaper]")).toHaveAttribute("data-wallpaper", "royal-gold");

  // Without the localStorage copy the server prefs (User.prefs.shell) still carry it.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(desktop(page)).toBeVisible();
  await expect(page.locator("[data-wallpaper]")).toHaveAttribute("data-wallpaper", "royal-gold");
  expect(errors).toEqual([]);
});

test("simge sağ tık → Kısayolu kaldır → onay: Esc vazgeçer, Enter kaldırır", async ({ page }) => {
  await openAdmin(page);
  const removeVia = async () => {
    await icon(page, "Denetim Masası").click({ button: "right" });
    await page
      .getByRole("menu", { name: "Simge menüsü" })
      .getByRole("menuitem", { name: "Kısayolu kaldır" })
      .click();
  };
  const dialog = page.getByRole("dialog", { name: "Kısayolu kaldır" });

  await removeVia();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(icon(page, "Denetim Masası")).toBeVisible();

  // Enter on the title-bar × means "close" (= Hayır), not Evet; Tab skips the ×.
  await removeVia();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Evet" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Hayır" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Evet" })).toBeFocused();
  await dialog.getByRole("button", { name: "Kapat" }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(icon(page, "Denetim Masası")).toBeVisible();

  await removeVia();
  await expect(dialog).toBeVisible();
  const saved = waitForPrefsSave(page);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(icon(page, "Denetim Masası")).toHaveCount(0);
  expect((await saved).ok()).toBe(true); // the next test (new browser context) relies on it
});

test("Başlat öğesini masaüstüne sürükle → onay → kısayol geri gelir", async ({ page }) => {
  await openAdmin(page);
  await expect(icon(page, "Denetim Masası")).toHaveCount(0); // removed by the previous test
  await page.getByRole("button", { name: "başlat" }).click();
  const item = page
    .getByRole("menu", { name: "Başlat menüsü" })
    .getByRole("menuitem", { name: "Denetim Masası" });
  const box = (await desktop(page).boundingBox())!;
  await item.dragTo(desktop(page), {
    targetPosition: { x: box.width - 300, y: 200 },
  });
  const dialog = page.getByRole("dialog", { name: "Kısayol oluştur" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Evet" }).click();
  await expect(icon(page, "Denetim Masası")).toBeVisible();
});

test("mudur.mr (R-OTM): yetkisiz simgeler görünmez; /admin/hakkinda → /admin", async ({ page }) => {
  await login(page, "mudur.mr");
  await expect(page).toHaveURL(/\/admin(#.*)?$/);
  await expect(desktop(page)).toBeVisible();
  await expect(icon(page, "Komuta Merkezi")).toBeVisible();
  await expect(icon(page, "Denetim Masası")).toHaveCount(0);
  await expect(icon(page, "Hakkında")).toHaveCount(0);

  await page.getByRole("button", { name: "başlat" }).click();
  const menu = page.getByRole("menu", { name: "Başlat menüsü" });
  await expect(menu.getByRole("menuitem", { name: "Komuta Merkezi", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Denetim Masası", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Hakkında", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/admin/hakkinda");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(desktop(page)).toBeVisible();
});
