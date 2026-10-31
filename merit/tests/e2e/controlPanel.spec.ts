import type { Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

// One database state for the whole file (reset once): prefs saved by one test are seen by the next.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const desktop = (page: Page) => page.getByRole("region", { name: "Masaüstü" });
const panelWindow = (page: Page) =>
  page.getByRole("region", { name: "Denetim Masası", exact: true });
const group = (page: Page, name: string) => page.getByRole("radiogroup", { name, exact: true });
const shell = (page: Page) => page.locator(".xp-shell");
const cssVar = (page: Page, selector: string, name: string) =>
  page.locator(selector).evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

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

async function openControlPanel(page: Page) {
  await page.getByRole("button", { name: "başlat" }).click();
  await page
    .getByRole("menu", { name: "Başlat menüsü" })
    .getByRole("menuitem", { name: "Denetim Masası" })
    .click();
  await expect(panelWindow(page)).toBeVisible();
}

test("Başlat → Denetim Masası: yazı boyutu ve tema canlı uygulanır, yenilemede korunur", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  await openControlPanel(page);
  const win = panelWindow(page);
  await expect(win.getByRole("tab", { name: "Görünüm" })).toHaveAttribute("aria-selected", "true");

  // Defaults: M / Tahoma / Luna.
  await expect(group(page, "Yazı boyutu").getByRole("radio", { name: "Orta" })).toBeChecked();
  expect(await cssVar(page, ".xp-shell", "--xp-font-size")).toBe("12px");
  await expect(shell(page)).toHaveAttribute("data-theme", "luna");

  await group(page, "Yazı boyutu").getByRole("radio", { name: "Büyük", exact: true }).check();
  expect(await cssVar(page, ".xp-shell", "--xp-font-size")).toBe("13px");
  await group(page, "Yazı tipi").getByRole("radio", { name: "Verdana" }).check();
  expect(await cssVar(page, ".xp-shell", "--xp-font-family")).toContain("Verdana");
  // Shell text follows the variables.
  expect(
    await page.locator(".xp-taskbar").evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("Verdana");

  await group(page, "Tema").getByRole("radio", { name: "Royal Gold" }).check();
  // Registered after the last change: the debounced save that follows it carries everything.
  const saved = waitForPrefsSave(page);
  await expect(shell(page)).toHaveAttribute("data-theme", "royal");
  expect(await cssVar(page, ".xp-shell", "--xp-taskbar")).toBe("#0b1f4b");
  expect((await saved).ok()).toBe(true);

  await page.reload();
  await expect(panelWindow(page)).toBeVisible();
  expect(await cssVar(page, ".xp-shell", "--xp-font-size")).toBe("13px");
  await expect(shell(page)).toHaveAttribute("data-theme", "royal");

  // Without the localStorage copy the server prefs still carry them.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(panelWindow(page)).toBeVisible();
  expect(await cssVar(page, ".xp-shell", "--xp-font-size")).toBe("13px");
  await expect(shell(page)).toHaveAttribute("data-theme", "royal");
  await expect(group(page, "Tema").getByRole("radio", { name: "Royal Gold" })).toBeChecked();
  expect(errors).toEqual([]);
});

test("Varsayılana dön: onaydan sonra M / Tahoma / Luna / Bliss", async ({ page }) => {
  await openAdmin(page);
  await expect(panelWindow(page)).toBeVisible(); // restored from the previous test
  await expect(shell(page)).toHaveAttribute("data-theme", "royal");
  await group(page, "Duvar kağıdı").getByRole("radio", { name: "Gümüş" }).check();
  await expect(desktop(page)).toHaveAttribute("data-wallpaper", "gumus");

  await panelWindow(page).getByRole("button", { name: "Varsayılana dön" }).click();
  const dialog = page.getByRole("dialog", { name: "Varsayılana dön" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Evet" }).click();
  const saved = waitForPrefsSave(page);
  await expect(shell(page)).toHaveAttribute("data-theme", "luna");
  expect(await cssVar(page, ".xp-shell", "--xp-font-size")).toBe("12px");
  await expect(desktop(page)).toHaveAttribute("data-wallpaper", "bliss");
  await expect(group(page, "Yazı tipi").getByRole("radio", { name: "Tahoma" })).toBeChecked();
  expect((await saved).ok()).toBe(true);
});

test("GET /manifest.webmanifest 200, name Merit OS; /sw.js sunulur", async ({ request, page }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const manifest = await res.json();
  expect(manifest).toMatchObject({
    name: "Merit OS",
    short_name: "Merit OS",
    start_url: "/admin",
    display: "standalone",
  });
  expect(manifest.icons.length).toBeGreaterThan(0);
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).status()).toBe(200);
  }

  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toMatch(/javascript/);

  await page.goto("/giris");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    /manifest\.webmanifest/,
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
});

test("Uygulama paneli: yükleme sunulmuyorsa düğme pasif + açıklama; sürüm görünür", async ({
  page,
}) => {
  await openAdmin(page);
  await expect(panelWindow(page)).toBeVisible();
  const win = panelWindow(page);
  await win.getByRole("tab", { name: "Uygulama" }).click();
  const install = win.getByRole("button", { name: "Uygulama olarak yükle" });
  await expect(install).toBeVisible();
  // Headless Chromium on http://localhost (dev, no SW) does not offer installation.
  await expect(install).toBeDisabled();
  await expect(win.getByText(/şu anda yüklemeyi sunmuyor/)).toBeVisible();
  await expect(win.getByText("0.1.0")).toBeVisible();

  // Start menu: no install entry while it is not offered.
  await page.getByRole("button", { name: "başlat" }).click();
  await expect(page.getByRole("menuitem", { name: "Uygulama olarak yükle" })).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("beforeinstallprompt yakalanınca düğme etkin; Başlat menüsünde öğe çıkar; istem kabul", async ({
  page,
}) => {
  await openAdmin(page);
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt(): Promise<void>;
      userChoice: Promise<{ outcome: string; platform: string }>;
    };
    const w = window as unknown as { __prompted: number };
    w.__prompted = 0;
    e.prompt = async () => {
      w.__prompted += 1;
    };
    e.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
    window.dispatchEvent(e);
  });
  const win = panelWindow(page);
  await win.getByRole("tab", { name: "Uygulama" }).click();
  await expect(win.getByRole("button", { name: "Uygulama olarak yükle" })).toBeEnabled();

  await page.getByRole("button", { name: "başlat" }).click();
  const item = page.getByRole("menuitem", { name: "Uygulama olarak yükle" });
  await expect(item).toBeVisible();
  await item.click();
  const prompted = () =>
    page.evaluate(() => (window as unknown as { __prompted: number }).__prompted);
  await expect.poll(prompted).toBe(1);
  // A deferred prompt is single-use: the offer disappears afterwards.
  await expect(win.getByRole("button", { name: "Uygulama olarak yükle" })).toBeDisabled();
});

test("mobil Ayarlar: aynı yazı boyutu / yazı tipi / tema seçenekleri", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  const tabs = page.getByRole("tablist", { name: "Ana sekmeler" });
  await tabs.getByRole("tab", { name: "Ayarlar" }).click();
  const panel = page.getByRole("tabpanel", { name: "Ayarlar" });

  for (const name of ["Yazı boyutu", "Yazı tipi", "Tema", "Duvar kağıdı"]) {
    await expect(panel.getByRole("radiogroup", { name, exact: true })).toBeVisible();
  }
  const radio = panel
    .getByRole("radiogroup", { name: "Yazı boyutu" })
    .getByRole("radio", { name: "Çok büyük" });
  const box = (await radio.locator("xpath=ancestor::label[1]").boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);

  await radio.check();
  expect(await cssVar(page, ".mb-shell", "--xp-font-size")).toBe("14px");
  await panel.getByRole("radiogroup", { name: "Tema" }).getByRole("radio", { name: "Zeytin" }).check();
  const saved = waitForPrefsSave(page);
  await expect(page.locator(".mb-shell")).toHaveAttribute("data-theme", "zeytin");
  expect((await saved).ok()).toBe(true);

  // The desktop picks the same appearance up (server copy).
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(desktop(page)).toBeVisible();
  await expect(shell(page)).toHaveAttribute("data-theme", "zeytin");
  expect(await cssVar(page, ".xp-shell", "--xp-font-size")).toBe("14px");
  expect(errors).toEqual([]);
});
