import type { Page } from "@playwright/test";
import { startMenuItem } from "./definitionsUi";
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

/** The default desktop: Komuta Merkezi plus the five category folders. */
const FOLDERS = [
  "Outlet Operasyonları",
  "Oda Servisi Operasyonları",
  "Minibar Operasyonları",
  "Sistem Yönetimi",
  "Kullanıcı Yönetimi",
];

test("kat.mr (CR-KOM yok) /admin → /yetkisiz", async ({ page }) => {
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/kat$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/yetkisiz\?ekran=CR-KOM$/);
  await expect(page.getByRole("heading", { name: "Bu ekran sana atanmadı" })).toBeVisible();
});

test("masaüstü: Komuta Merkezi simgesi; çift tık → pencere; sürükle; görev çubuğu; kapat", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  await expect(icon(page, "Komuta Merkezi")).toBeVisible();
  for (const folder of FOLDERS) await expect(icon(page, folder)).toBeVisible();

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
  // Folders are desktop-only: the Start menu lists the apps themselves, under their category.
  await expect(menu.getByRole("menuitem", { name: "Sistem Yönetimi", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("group", { name: "SİSTEM YÖNETİMİ" }).getByRole("menuitem", { name: "Denetim Masası" })).toBeVisible();
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

test("masaüstü klasörü: Sistem Yönetimi çift tık → klasör penceresi → Denetim Masası açılır", async ({ page }) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  await icon(page, "Sistem Yönetimi").dblclick();
  const folder = appWindow(page, "Sistem Yönetimi");
  await expect(folder).toBeVisible();
  await expect(folder.getByRole("heading", { name: "Sistem Yönetimi" })).toBeVisible();
  // The folder lists the SISTEM apps the admin may open (never the folder itself).
  for (const app of ["Tanımlamalar", "Online Kullanıcılar", "Denetim Masası", "Hakkında"]) {
    await expect(folder.getByRole("button", { name: new RegExp(`^${app}`) })).toBeVisible();
  }
  await expect(folder.getByRole("button", { name: /^Sistem Yönetimi/ })).toHaveCount(0);

  await folder.getByRole("button", { name: /^Denetim Masası/ }).click();
  const settings = appWindow(page, "Denetim Masası");
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Kapat" }).click();
  await expect(settings).toHaveCount(0);
  const saved = waitForPrefsSave(page);
  await folder.getByRole("button", { name: "Kapat" }).click();
  await expect(folder).toHaveCount(0);
  await saved;
  expect(errors).toEqual([]);
});

test("otel bağlamı: çok otelli kapsamda pencere önce otel kartı ister", async ({ page }) => {
  await openAdmin(page);
  await page.getByRole("button", { name: "başlat" }).click();
  await startMenuItem(page, "Online Kullanıcılar").click();
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

test("Başlat öğesini masaüstüne sürükle → onay → kısayol oluşur ve yenilemede kalır", async ({ page }) => {
  await openAdmin(page);
  await expect(icon(page, "Denetim Masası")).toHaveCount(0); // apps start inside their folder
  await page.getByRole("button", { name: "başlat" }).click();
  const item = page
    .getByRole("menu", { name: "Başlat menüsü" })
    .getByRole("menuitem", { name: "Denetim Masası" });
  const box = (await desktop(page).boundingBox())!;
  const saved = waitForPrefsSave(page);
  await item.dragTo(desktop(page), {
    targetPosition: { x: box.width - 300, y: 200 },
  });
  // shell.confirmSimpleActions is off by default: creating a shortcut is not asked.
  const dialog = page.getByRole("dialog", { name: "Kısayol oluştur" });
  await expect(icon(page, "Denetim Masası")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect((await saved).ok()).toBe(true);

  // Dropping the same item again only moves the shortcut (no question, still one icon).
  await page.getByRole("button", { name: "başlat" }).click();
  await item.dragTo(desktop(page), { targetPosition: { x: box.width - 300, y: 320 } });
  await expect(dialog).toHaveCount(0);
  await expect(icon(page, "Denetim Masası")).toHaveCount(1);

  await page.reload();
  await expect(desktop(page)).toBeVisible();
  await expect(icon(page, "Denetim Masası")).toBeVisible();
  await icon(page, "Denetim Masası").dblclick();
  await expect(appWindow(page, "Denetim Masası")).toBeVisible();
});

test("simge sağ tık → Kısayolu kaldır → onay: Esc vazgeçer, Enter kaldırır; yenilemede geri gelmez", async ({ page }) => {
  await openAdmin(page);
  await expect(icon(page, "Denetim Masası")).toBeVisible(); // created by the previous test
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

  // Delete question: focus starts on the safe button (Vazgeç); Enter there cancels; Tab skips the ×.
  await removeVia();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Kaldır" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await dialog.getByRole("button", { name: "Kapat" }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(icon(page, "Denetim Masası")).toBeVisible();

  await removeVia();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Enter"); // on Vazgeç: the shortcut stays
  await expect(dialog).toBeHidden();
  await expect(icon(page, "Denetim Masası")).toBeVisible();
  await removeVia();
  const saved2 = waitForPrefsSave(page);
  await dialog.getByRole("button", { name: "Kaldır" }).click();
  await expect(dialog).toBeHidden();
  await expect(icon(page, "Denetim Masası")).toHaveCount(0);
  expect((await saved2).ok()).toBe(true);

  // The app is still reachable from its folder; only the shortcut went.
  await page.reload();
  await expect(desktop(page)).toBeVisible();
  await expect(icon(page, "Denetim Masası")).toHaveCount(0);
  await expect(icon(page, "Sistem Yönetimi")).toBeVisible();
});

test("mudur.mr (R-OTM): yetkisiz klasör ve simgeler görünmez; /admin/hakkinda → /admin", async ({ page }) => {
  await login(page, "mudur.mr");
  await expect(page).toHaveURL(/\/admin(#.*)?$/);
  await expect(desktop(page)).toBeVisible();
  await expect(icon(page, "Komuta Merkezi")).toBeVisible();
  await expect(icon(page, "Sistem Yönetimi")).toHaveCount(0); // CR-SYS folder
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
