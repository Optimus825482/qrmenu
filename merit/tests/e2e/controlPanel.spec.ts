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
  page.locator('.xp-window[aria-label="Denetim Masası"].is-active');
const group = (page: Page, name: string) => panelWindow(page).getByRole("radiogroup", { name, exact: true });
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

test("Marka: alt telif bandı ve filigran görünür; Denetim Masası'ndan kapanır, yenilemede kalıcı, açılınca geri gelir", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  await openControlPanel(page);
  await expect(panelWindow(page)).toBeVisible();
  const footer = page.locator(".xp-footer-band");
  const watermark = page.locator(".xp-brand-watermark");
  const bandSwitch = panelWindow(page).getByRole("switch", { name: "Alt telif bandı" });
  const markSwitch = panelWindow(page).getByRole("switch", { name: "Duvar kağıdı filigranı" });

  // Defaults: both on.
  await expect(footer).toHaveText(
    "MERIT ROYAL F&B OPERATION COMMAND CENTER © 2026 · CODE BY ERKAN ERDEM",
  );
  await expect(watermark).toHaveCount(1);
  await expect(watermark).toHaveAttribute("aria-hidden", "true");
  expect(await watermark.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await expect(watermark).toContainText("MERIT ROYAL");
  await expect(watermark).toContainText("F&B OPERATION COMMAND CENTER");
  await expect(watermark).not.toContainText("ERKAN");
  await expect(watermark).not.toContainText("©");
  await expect(bandSwitch).toBeChecked();
  await expect(markSwitch).toBeChecked();

  // The band sits at the very bottom, the taskbar right above it, the desktop above that.
  const vh = page.viewportSize()!.height;
  const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
  const fb = await box(".xp-footer-band");
  expect(fb.height).toBe(22);
  expect(fb.y + fb.height).toBe(vh);
  const tb = await box(".xp-taskbar");
  expect(tb.y + tb.height).toBe(vh - 22);
  const dk = await box(".xp-desktop");
  expect(dk.y + dk.height).toBe(vh - 22 - 30);

  // A maximized window fills the desktop minus taskbar and footer.
  await panelWindow(page).getByRole("button", { name: "Ekranı kapla" }).click();
  const maxed = await panelWindow(page).boundingBox();
  expect(Math.round(maxed!.y + maxed!.height)).toBeLessThanOrEqual(vh - 22 - 30);
  await panelWindow(page).getByRole("button", { name: "Önceki boyut" }).click();

  const saved = waitForPrefsSave(page);
  await bandSwitch.uncheck();
  await markSwitch.uncheck();
  await expect(footer).toHaveCount(0);
  await expect(watermark).toHaveCount(0);
  const tbOff = await box(".xp-taskbar");
  expect(tbOff.y + tbOff.height).toBe(vh);
  expect((await saved).ok()).toBe(true);

  // Survives a reload, with and without the localStorage copy.
  await page.reload();
  await expect(panelWindow(page)).toBeVisible();
  await expect(footer).toHaveCount(0);
  await expect(watermark).toHaveCount(0);
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(panelWindow(page)).toBeVisible();
  await expect(footer).toHaveCount(0);
  await expect(watermark).toHaveCount(0);
  await expect(bandSwitch).not.toBeChecked();
  await expect(markSwitch).not.toBeChecked();

  await bandSwitch.check();
  const savedOn = waitForPrefsSave(page);
  await markSwitch.check();
  await expect(footer).toHaveCount(1);
  await expect(watermark).toHaveCount(1);
  const tbOn = await box(".xp-taskbar");
  expect(tbOn.y + tbOn.height).toBe(vh - 22);
  expect((await savedOn).ok()).toBe(true); // the next tests start from the saved "on" state
  expect(errors).toEqual([]);
});

test("Düz renk: renk alanına #112233 yazılınca masaüstü o renge döner, yenilemede kalıcı; geçersiz metin yok sayılır", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  await openControlPanel(page);
  await expect(panelWindow(page)).toBeVisible();
  await expect(group(page, "Duvar kağıdı").getByRole("radio", { name: "Düz renk" })).toBeVisible();
  const hex = panelWindow(page).getByRole("textbox", { name: "Arka plan rengi" });
  const bg = () => desktop(page).evaluate((el) => getComputedStyle(el).backgroundColor);

  await hex.fill("#12"); // not a color: ignored
  await expect(desktop(page)).toHaveAttribute("data-wallpaper", "bliss");
  await hex.fill("#112233");
  await expect(desktop(page)).toHaveAttribute("data-wallpaper", "ozel");
  expect(await bg()).toBe("rgb(17, 34, 51)");
  await expect(group(page, "Duvar kağıdı").getByRole("radio", { name: "Düz renk" })).toBeChecked();
  const saved = waitForPrefsSave(page);
  await expect(hex).toHaveValue("#112233");
  expect((await saved).ok()).toBe(true);

  await page.reload();
  await expect(desktop(page)).toHaveAttribute("data-wallpaper", "ozel");
  expect(await bg()).toBe("rgb(17, 34, 51)");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(desktop(page)).toHaveAttribute("data-wallpaper", "ozel");
  expect(await bg()).toBe("rgb(17, 34, 51)");

  // This test file shares persisted user prefs across serial tests; explicitly establish the
  // watermark state before checking that the context menu leaves the desktop decoration intact.
  const watermarkSwitch = panelWindow(page).getByRole("switch", { name: "Duvar kağıdı filigranı" });
  if (!(await watermarkSwitch.isChecked())) {
    const watermarkSaved = waitForPrefsSave(page);
    await watermarkSwitch.check();
    expect((await watermarkSaved).ok()).toBe(true);
  }
  await expect(page.locator(".xp-brand-watermark")).toHaveCount(1);

  // Right-click menu offers it too; the watermark stays on top of the flat color.
  // (dispatched: the Denetim Masası window covers most of the free desktop)
  await desktop(page).dispatchEvent("contextmenu", { clientX: 1200, clientY: 120, button: 2 });
  await page.getByRole("menuitem", { name: "Duvar kağıdı" }).click();
  await expect(page.getByRole("menuitemradio", { name: "Düz renk" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".xp-brand-watermark")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("mobil Ayarlar: Marka anahtarları var, alt telif bandı mobilde çizilmez", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await page
    .getByRole("tablist", { name: "Ana sekmeler" })
    .getByRole("tab", { name: "Ayarlar" })
    .click();
  const panel = page.getByRole("tabpanel", { name: "Ayarlar" });
  await expect(panel.getByRole("switch", { name: "Alt telif bandı" })).toBeVisible();
  await expect(panel.getByRole("switch", { name: "Duvar kağıdı filigranı" })).toBeVisible();
  await expect(page.locator(".xp-footer-band")).toHaveCount(0);
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
  const sources = (manifest.icons as { src: string }[]).map((icon) => icon.src);
  expect(sources).toEqual(
    expect.arrayContaining([
      "/icons/merit.svg",
      "/icons/legacy/icon-192.png",
      "/icons/legacy/icon-512.png",
    ]),
  );
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).status()).toBe(200);
  }

  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toMatch(/javascript/);

  await page.goto("/giris");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    /icons\/legacy\/apple-touch-icon-180\.png/,
  );
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

test("Sistem: admin DND kontrol sayısını sistem geneli ve otel için değiştirir; yenilemede kalıcı, rozet 'otel'", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  if (!(await panelWindow(page).isVisible())) await openControlPanel(page);
  const win = panelWindow(page);
  await win.getByRole("tab", { name: "Sistem" }).click();
  const scope = win.getByLabel("Kapsam");
  await expect(scope).toHaveValue("");

  const row = win.getByRole("group", { name: "DND asgari kontrol sayısı" });
  // The seed writes system rows for every key: they show as "sistem".
  await expect(row.getByText("sistem", { exact: true })).toBeVisible();
  await row.getByLabel("DND asgari kontrol sayısı").fill("4");
  await row.getByRole("button", { name: "Kaydet" }).click();
  await expect(win.getByRole("status")).toContainText("DND asgari kontrol sayısı kaydedildi");
  await expect(row.getByText("sistem", { exact: true })).toBeVisible();

  // Hotel scope: the system value applies until the hotel gets its own.
  await scope.selectOption({ label: "Otel: Merit Royal" });
  await expect(row.getByLabel("DND asgari kontrol sayısı")).toHaveValue("4");
  await expect(row.getByText("sistem", { exact: true })).toBeVisible();
  await row.getByLabel("DND asgari kontrol sayısı").fill("3");
  await row.getByRole("button", { name: "Kaydet" }).click();
  await expect(row.getByText("otel", { exact: true })).toBeVisible();

  await page.reload();
  const again = panelWindow(page);
  await expect(again).toBeVisible();
  await again.getByRole("tab", { name: "Sistem" }).click();
  await again.getByLabel("Kapsam").selectOption({ label: "Otel: Merit Royal" });
  const reloaded = again.getByRole("group", { name: "DND asgari kontrol sayısı" });
  await expect(reloaded.getByLabel("DND asgari kontrol sayısı")).toHaveValue("3");
  await expect(reloaded.getByText("otel", { exact: true })).toBeVisible();

  // Removing the hotel value falls back to the system value 4.
  await reloaded.getByRole("button", { name: "Otel değerini kaldır" }).click();
  await page.getByRole("dialog", { name: "Otel değerini kaldır" }).getByRole("button", { name: "Evet" }).click();
  await expect(reloaded.getByLabel("DND asgari kontrol sayısı")).toHaveValue("4");
  await expect(reloaded.getByText("sistem", { exact: true })).toBeVisible();

  // Invalid value comes back as a field error and nothing is saved.
  await reloaded.getByLabel("DND asgari kontrol sayısı").fill("99");
  await reloaded.getByRole("button", { name: "Kaydet" }).click();
  await expect(reloaded.getByRole("alert")).toBeVisible();
  expect(errors.filter((e) => !/status of 4\d\d/.test(e))).toEqual([]);
});

test("Sistem: otel yöneticisi (ayar.mr) 'Sistem geneli' görmez, kendi otelini düzenler", async ({
  page,
}) => {
  await login(page, "ayar.mr");
  await expect(page).toHaveURL(/\/admin$/);
  await openControlPanel(page);
  const win = panelWindow(page);
  await win.getByRole("tab", { name: "Sistem" }).click();
  const scope = win.getByLabel("Kapsam");
  await expect(scope.getByRole("option", { name: "Sistem geneli" })).toHaveCount(0);
  await expect(scope.getByRole("option")).toHaveCount(1);
  const row = win.getByRole("group", { name: "DND asgari kontrol sayısı" });
  await row.getByLabel("DND asgari kontrol sayısı").fill("5");
  await row.getByRole("button", { name: "Kaydet" }).click();
  await expect(row.getByText("otel", { exact: true })).toBeVisible();
  await page.reload();
  await panelWindow(page).getByRole("tab", { name: "Sistem" }).click();
  await expect(
    panelWindow(page).getByRole("group", { name: "DND asgari kontrol sayısı" }).getByLabel("DND asgari kontrol sayısı"),
  ).toHaveValue("5");
});
