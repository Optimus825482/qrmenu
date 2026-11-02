import { randomInt } from "node:crypto";
import type { Browser, Locator, Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

// One database state for the whole file (reset once): each test builds on the previous one.
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });
test.beforeAll(() => resetAndSeed({ guestMenu: true }));

const M1 = "/q/e2e-guest-m1";
const CALL_TITLE = "Size nasıl yardımcı olalım?";

/** Admin → Tema Yönetimi (the design studio) with Merit Royal / Havuz Bar selected. */
async function openStudio(browser: Browser): Promise<{ page: Page; win: Locator; studio: Locator }> {
  const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  const context = await browser.newContext({
    locale: "tr-TR",
    baseURL: (process.env.E2E_BASE_URL ?? "http://localhost:3000"),
    viewport: { width: 1600, height: 1000 },
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await context.newPage();
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  const windows = page.getByRole("region", { name: "Menü Tasarım Stüdyosu", exact: true });
  if ((await windows.count()) === 0) {
    // The icon now lives inside a category folder; the Start menu is the stable entry point.
    await page.getByRole("button", { name: "başlat" }).click();
    await page.getByRole("menu", { name: "Başlat menüsü" }).getByRole("menuitem", { name: "Menü Tasarım Stüdyosu", exact: true }).click();
  } else if (!(await windows.first().isVisible())) {
    await page.getByRole("toolbar", { name: "Açık pencereler" }).getByRole("button", { name: "Menü Tasarım Stüdyosu" }).click();
  }
  const win = windows.first();
  await expect(win).toBeVisible();
  const studio = win.getByRole("region", { name: "Menü tasarım merkezi" });
  await studio.getByRole("combobox", { name: "Otel" }).selectOption({ label: "Merit Royal" });
  await studio.getByRole("combobox", { name: "Outlet" }).selectOption({ label: "Havuz Bar" });
  return { page, win, studio };
}

/** Confirms the "İşlem tamamlandı" notice a successful FormDialog shows. */
async function acknowledge(page: Page) {
  await page.getByRole("alertdialog").getByRole("button", { name: "Tamam" }).click();
}

async function addOption(page: Page, studio: Locator, label: string) {
  await studio.getByRole("button", { name: "Ekle", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni çağrı seçeneği" });
  await dialog.getByLabel("Türkçe etiket (zorunlu)").fill(label);
  await dialog.getByRole("button", { name: "Ekle", exact: true }).click();
  await acknowledge(page);
  await expect(studio.getByRole("listitem").filter({ hasText: label })).toBeVisible();
}

const optionRow = (studio: Locator, label: string) =>
  studio.locator(".xp-call-options-list > li").filter({ hasText: label });

test("seçenek ekle, sırala, pasifle ve önizlemede gör", async ({ browser }) => {
  const { page, studio } = await openStudio(browser);
  await studio.getByRole("tab", { name: "Garson çağrısı" }).click();
  for (const label of ["Peçete istiyorum", "Sipariş vereceğim", "Su istiyorum", "Hesap"]) {
    await expect(optionRow(studio, label)).toBeVisible();
  }
  await expect(studio.getByText("Her zaman en sonda")).toBeVisible();

  await addOption(page, studio, "Bebek sandalyesi");
  const rows = studio.locator(".xp-call-options-list > li");
  await expect(rows.nth(4)).toContainText("Bebek sandalyesi");

  // Order: ↑ puts it before "Hesap".
  await studio.getByRole("button", { name: "Bebek sandalyesi yukarı taşı" }).click();
  await expect(rows.nth(3)).toContainText("Bebek sandalyesi");

  // The preview's call sheet shows it (inside the phone frame); sending is off in the preview.
  const frame = studio.frameLocator("iframe.xp-design-frame");
  await frame.getByRole("button", { name: "Garson çağır" }).click();
  const sheet = frame.getByRole("dialog", { name: CALL_TITLE });
  await expect(sheet.locator("button.g-call-option")).toHaveText([
    "Peçete istiyorum",
    "Sipariş vereceğim",
    "Su istiyorum",
    "Bebek sandalyesi",
    "Hesap",
    "Sadece çağır",
  ]);
  await sheet.getByRole("button", { name: "Bebek sandalyesi" }).click();
  await expect(sheet).toBeHidden();
  await expect(frame.getByRole("status")).toHaveCount(0); // "iletildi" is never shown in the preview

  // Switching it off drops it from the preview.
  // This checkbox is controlled by the server snapshot; wait for its saved state rather than
  // requiring Playwright's uncheck postcondition before the action round-trip completes.
  await optionRow(studio, "Bebek sandalyesi").getByRole("checkbox").click();
  await expect(optionRow(studio, "Bebek sandalyesi")).toHaveAttribute("data-inactive", "true");
  await frame.getByRole("button", { name: "Garson çağır" }).click();
  await expect(frame.getByRole("dialog", { name: CALL_TITLE }).locator("button.g-call-option")).toHaveText([
    "Peçete istiyorum",
    "Sipariş vereceğim",
    "Su istiyorum",
    "Hesap",
    "Sadece çağır",
  ]);
  await page.context().close();
});

test("eksik dil rozeti", async ({ browser }) => {
  const { page, studio } = await openStudio(browser);
  await studio.getByRole("tab", { name: "Garson çağrısı" }).click();
  // Defaults carry all four translations; the new option has none.
  await expect(optionRow(studio, "Peçete istiyorum")).not.toContainText("Eksik");
  await expect(optionRow(studio, "Bebek sandalyesi")).toContainText("Eksik: İngilizce, Almanca, Rusça, Arapça");

  await optionRow(studio, "Bebek sandalyesi").getByRole("button", { name: "Düzenle" }).click();
  const dialog = page.getByRole("dialog", { name: "Çağrı seçeneğini düzenle" });
  await dialog.getByLabel("İngilizce (isteğe bağlı)").fill("High chair");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await acknowledge(page);
  await expect(optionRow(studio, "Bebek sandalyesi")).toContainText("Eksik: Almanca, Rusça, Arapça");
  await page.context().close();
});

test("9. aktif seçenek eklenemez", async ({ browser }) => {
  const { page, studio } = await openStudio(browser);
  await studio.getByRole("tab", { name: "Garson çağrısı" }).click();
  // Four defaults are active (the extra one is off): add four more to reach 8.
  for (const label of ["Çocuk menüsü", "Battaniye", "Şemsiye", "Havlu"]) await addOption(page, studio, label);
  await expect(studio.getByText("8/8 aktif")).toBeVisible();
  await expect(studio.getByRole("button", { name: "Ekle", exact: true })).toBeDisabled();
  await expect(studio.getByText("En fazla 8 aktif seçenek olabilir")).toBeVisible();
  await page.context().close();
});

test("okunamaz kontrastlı tema ile Yayına al devre dışı", async ({ browser }) => {
  const { page, win, studio } = await openStudio(browser);
  await studio.getByRole("tab", { name: "Renkler" }).click();
  await win.getByRole("button", { name: "Yeni kayıt" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni tema" });
  await dialog.getByLabel("Tema adı").fill("Gri");
  await dialog.getByLabel("Arka plan").fill("#808080");
  await dialog.getByLabel("Vurgu", { exact: true }).fill("#858585");
  await dialog.getByLabel("Yumuşak").fill("#888888");
  await dialog.getByLabel("Vurgu üstü yazı").fill("#888888");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await acknowledge(page);

  await studio.getByRole("tab", { name: "Tasarım" }).click();
  await studio.getByRole("combobox", { name: "Renk teması" }).selectOption({ label: "Gri" });
  await expect(studio.getByRole("button", { name: "Yayına al" })).toBeDisabled();
  await expect(studio.getByRole("region", { name: "Kalite kontrolü" })).toContainText("ENGEL");
  await expect(studio.getByText(/Yayın engellendi/)).toBeVisible();

  // Back to a readable theme: publishing is possible again.
  await studio.getByRole("combobox", { name: "Renk teması" }).selectOption({ label: "Royal Gold" });
  await expect(studio.getByRole("button", { name: "Yayına al" })).toBeEnabled();
  await page.context().close();
});

test("yayın sonrası misafir menüsü yeni tipografi ve karşılama özniteliklerini taşır", async ({ browser, page }) => {
  const admin = await openStudio(browser);
  const { studio } = admin;
  await studio.getByRole("button", { name: "Modern sans" }).click();
  await studio.getByRole("group", { name: "Karşılama stili" }).getByRole("button", { name: "Yok" }).click();
  await studio.getByRole("group", { name: "Yoğunluk" }).getByRole("button", { name: "Kompakt" }).click();
  await studio.getByRole("button", { name: "Yayına al" }).click();
  await expect(studio.getByRole("status").filter({ hasText: "Tasarım kaydedildi" })).toBeVisible();

  await page.goto(`${M1}?lang=tr`);
  const frame = page.locator(".g-frame");
  await expect(frame).toHaveAttribute("data-typography", "modern");
  await expect(frame).toHaveAttribute("data-hero", "none");
  await expect(frame).toHaveAttribute("data-density", "compact");
  await expect(page.locator(".g-design-hero")).toHaveCount(0);
  // Touch targets stay at least 44px whatever the density.
  const tab = page.locator(".g-tabs button").first();
  expect((await tab.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await admin.page.context().close();
});

test("375px Arapça misafir menüsünde RTL çağrı alt sayfası ve dokunma hedefleri kullanılabilir", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${M1}?lang=ar`);
  const frame = page.locator(".g-frame");
  await expect(frame).toHaveAttribute("dir", "rtl");
  await expect(frame).toHaveAttribute("lang", "ar");
  const trigger = page.getByRole("button", { name: "استدعاء النادل" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "كيف يمكننا مساعدتك؟" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "استدعاء فقط" })).toBeVisible();
  const sizes = await page.locator(".g-call-option, .g-sheet-close, .g-tabs button, .g-filters button, .g-lang a, .g-button").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "" };
    }),
  );
  expect(sizes.length).toBeGreaterThan(0);
  for (const target of sizes) {
    expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
  }
});

test("kasa çağrı ekranı seçilen ifadeyi gösterir", async ({ page, browser }) => {
  await page.goto(`${M1}?lang=tr`);
  await page.getByRole("button", { name: "Garson çağır" }).click();
  await page.getByRole("dialog", { name: CALL_TITLE }).getByRole("button", { name: "Hesap", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "iletildi" })).toBeVisible();

  const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  const context = await browser.newContext({
    locale: "tr-TR",
    baseURL: (process.env.E2E_BASE_URL ?? "http://localhost:3000"),
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const cashier = await context.newPage();
  await login(cashier, "kasa.havuz");
  await cashier.getByRole("button", { name: /Havuz Bar/ }).click();
  await expect(cashier).toHaveURL(/\/kasa$/);
  await cashier.goto("/kasa?sekme=cagrilar");
  await expect(cashier.getByRole("region", { name: "Açık çağrılar" })).toContainText("Hesap");
  await context.close();
});

test("seçeneksiz outletde yalnız Sadece çağır, çağrı yine çalışır", async ({ page, browser }) => {
  const { page: adminPage, studio } = await openStudio(browser);
  await studio.getByRole("tab", { name: "Garson çağrısı" }).click();
  const allRows = studio.locator(".xp-call-options-list > li");
  const activeRows = studio.locator(".xp-call-options-list > li:has(input[type='checkbox']:checked)");
  while ((await activeRows.count()) > 0) {
    // Pin the row identity first: `activeRows.first()` is lazy and re-resolves to the next row as
    // soon as this one stops matching the :checked filter, so address it by its list position.
    const idx = await allRows.evaluateAll((els) => els.findIndex((el) => el.querySelector("input[type='checkbox']:checked")));
    if (idx < 0) break;
    const row = allRows.nth(idx);
    await row.getByRole("checkbox").click();
    await expect(row).toHaveAttribute("data-inactive", "true");
  }
  await expect(studio.getByRole("listitem", { name: "Sabit seçenek" })).toContainText("Sadece çağır");

  await page.goto(`${M1}?lang=tr`);
  await page.getByRole("button", { name: "Garson çağır" }).click();
  const sheet = page.getByRole("dialog", { name: CALL_TITLE });
  await expect(sheet.locator("button.g-call-option")).toHaveText(["Sadece çağır"]);
  await sheet.getByRole("button", { name: "Sadece çağır" }).click();
  await expect(page.getByRole("status").filter({ hasText: "iletildi" })).toBeVisible();
  await adminPage.context().close();
});
