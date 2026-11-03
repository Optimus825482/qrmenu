import type { Browser, Locator, Page } from "@playwright/test";
import { expect, resetAndSeed, test } from "./fixtures";
import { newContextPage, openAdminShell, openMenuManager, setOrdering, setPriceDisplay, setSoldOut } from "./menuUi";
import { openStaff } from "./opsUi";

// One database state for the whole file (reset once): the live tests build on the seeded tree.
test.describe.configure({ mode: "serial" });
test.use({ locale: "en-US" });

const M1 = "/q/e2e-guest-m1";
const M2_INACTIVE = "/q/e2e-guest-m2";

test.beforeAll(() => {
  resetAndSeed({ guestMenu: true });
});

const card = (page: Page, name: string): Locator => page.locator("button.g-card", { hasText: name });

async function openMenuAdmin(browser: Browser): Promise<{ page: Page; win: Locator }> {
  const page = await newContextPage(browser);
  await openAdminShell(page, "admin");
  const win = await openMenuManager(page);
  return { page, win };
}

test("M1 tokenı: outlet adı, masa etiketi ve menü (en)", async ({ page }) => {
  await page.goto(M1);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Havuz Bar");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("M1");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("tab", { name: "Drinks" })).toBeVisible();
  await expect(card(page, "Mojito")).toBeVisible();
  await expect(card(page, "Aperol Spritz")).toBeVisible();
  // Prices follow the (hidden) default; nothing is sold out; selections wording only.
  await expect(page.locator(".g-price")).toHaveCount(0);
  await expect(page.locator(".g-badge")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/sepet|cart/i);
  // Ordering is on for Havuz Bar: the detail sheet offers "Add to selections".
  await card(page, "Mojito").click();
  await expect(page.getByRole("dialog", { name: "Mojito" }).getByRole("button", { name: "Add to selections" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("alerjen listesi: her alerjende SVG ikon (aria-hidden) ve dilin metin etiketi; title= yok", async ({ page }) => {
  await page.goto(M1);
  await card(page, "Mojito").click();
  const sheet = page.getByRole("dialog", { name: "Mojito" });
  const items = sheet.locator(".g-allergen-list li");
  await expect(items).toHaveCount(2);
  for (const [i, label] of ["Alcohol", "Sulphites"].entries()) {
    const li = items.nth(i);
    await expect(li.locator("svg[aria-hidden='true']")).toHaveCount(1);
    await expect(li).toContainText(label);
    await expect(li).not.toHaveAttribute("title", /.+/);
  }
  await page.keyboard.press("Escape");
});

test("?lang=ar sağdan sola ve Arapça; ?lang=de çerezle kalıcı", async ({ page }) => {
  await page.goto(`${M1}?lang=ar`);
  await expect(page).toHaveURL(new RegExp(`${M1}$`)); // the lang route sent us back without the query
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("tab", { name: "المشروبات" })).toBeVisible();
  await expect(card(page, "موخيتو")).toBeVisible();
  await expect(card(page, "Aperol Spritz")).toBeVisible(); // no Arabic translation: Turkish base name

  await page.goto(`${M1}?lang=de`);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await page.goto(M1);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.reload();
  // The language picker is a button (current language) that opens a menu of all languages.
  const picker = page.getByRole("button", { name: /Sprachauswahl: Deutsch/ });
  await expect(picker).toContainText("DE");
  await picker.click();
  await expect(page.getByRole("menuitem", { name: /Deutsch/ })).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab", { name: "İçecekler" })).toBeVisible(); // no German translation: Turkish base

  // The menu entries switch the language too.
  await picker.click();
  await page.getByRole("menuitem", { name: /English/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("tab", { name: "Drinks" })).toBeVisible();
});

test("canlı: admin Mojito'yu tükendi yapar, misafir sayfası yenilenmeden 3 sn içinde kartı gizler ve geri getirir", async ({
  page,
  browser,
}) => {
  await page.goto(`${M1}?lang=en`);
  await expect(card(page, "Mojito")).toHaveAttribute("data-available", "true");
  await page.evaluate(() => {
    (window as unknown as { __noReload: boolean }).__noReload = true;
  });

  const admin = await openMenuAdmin(browser);
  await setSoldOut(admin.page, admin.win, "Mojito", true);

  // Sold-out items leave the guest list at once (SSE menu.availability); the rest stays.
  await expect(card(page, "Mojito")).toHaveCount(0, { timeout: 3_000 });
  await expect(card(page, "Aperol Spritz")).toHaveAttribute("data-available", "true");
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);

  // Back to available: the card returns, still without a reload.
  await setSoldOut(admin.page, admin.win, "Mojito", false);
  await expect(card(page, "Mojito")).toHaveAttribute("data-available", "true", { timeout: 3_000 });
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  await admin.page.context().close();
});

test("canlı: outlet fiyat anahtarı Göster olunca fiyat 3 sn içinde görünür", async ({ page, browser }) => {
  await page.goto(`${M1}?lang=en`);
  await expect(card(page, "Mojito")).toBeVisible();
  await expect(page.locator(".g-price")).toHaveCount(0);

  const admin = await openMenuAdmin(browser);
  await setPriceDisplay(admin.page, admin.win, "SHOW");

  await expect(card(page, "Mojito").locator(".g-price")).toHaveText(/12\.00/, { timeout: 3_000 });
  await expect(card(page, "Aperol Spritz").locator(".g-price")).toHaveText(/10\.00/);

  await setPriceDisplay(admin.page, admin.win, "HIDE");
  await expect(page.locator(".g-price")).toHaveCount(0, { timeout: 3_000 });
  await admin.page.context().close();
});

test("canlı: sipariş kapanınca şerit görünür", async ({ page, browser }) => {
  await page.goto(`${M1}?lang=en`);
  await expect(page.getByText("Ordering is closed right now")).toHaveCount(0);
  const admin = await openMenuAdmin(browser);
  await setOrdering(admin.page, admin.win, false);
  await expect(page.getByText("Ordering is closed right now")).toBeVisible({ timeout: 3_000 });
  await card(page, "Mojito").click();
  await expect(page.getByRole("dialog", { name: "Mojito" }).getByRole("button", { name: "Add to selections" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // The strip survives a reload (server state), and goes away again once ordering reopens.
  await page.reload();
  await expect(page.getByText("Ordering is closed right now")).toBeVisible();
  await setOrdering(admin.page, admin.win, true);
  await expect(page.getByText("Ordering is closed right now")).toHaveCount(0, { timeout: 3_000 });
  await admin.page.context().close();
});

test("bilinmeyen ve pasif masa tokenı: 'kullanılamıyor' sayfası", async ({ page }) => {
  await page.goto("/q/bogus-token-123");
  await expect(page.getByRole("heading", { name: "This menu is not available right now" })).toBeVisible();
  await expect(page.getByText("This QR code was not recognised")).toBeVisible();
  await expect(page.locator(".g-tabs")).toHaveCount(0);

  await page.goto(`${M2_INACTIVE}?lang=tr`);
  await expect(page.getByRole("heading", { name: "Bu menü şu an kullanılamıyor" })).toBeVisible();
  await expect(page.getByText("Bu masa şu an kullanımda değil.")).toBeVisible();
});

test("misafir olay akışı: bilinmeyen ve pasif masa tokenı 404", async ({ request }) => {
  expect((await request.get("/api/q/bogus-token-123/events")).status()).toBe(404);
  expect((await request.get("/api/q/e2e-guest-m2/events")).status()).toBe(404);
});

// ---------------------------------------------------------------------------------------------
// Garson çağrı alt sayfası (Menü Tasarım Merkezi planı, Task 7)
// ---------------------------------------------------------------------------------------------

const CALL_TITLE = "Size nasıl yardımcı olalım?";

async function openCallSheet(page: Page) {
  await page.goto(`${M1}?lang=tr`);
  await page.getByRole("button", { name: "Garson çağır" }).click();
  const sheet = page.getByRole("dialog", { name: CALL_TITLE });
  await expect(sheet).toBeVisible();
  return sheet;
}

test("çağrı alt sayfası seçenekleri ve Sadece çağır'ı gösterir", async ({ page }) => {
  const sheet = await openCallSheet(page);
  const options = sheet.locator("button.g-call-option");
  await expect(options).toHaveText(["Peçete istiyorum", "Sipariş vereceğim", "Su istiyorum", "Hesap", "Sadece çağır"]);
  // Every option is a comfortable touch target.
  for (const box of await options.evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height))) {
    expect(box).toBeGreaterThanOrEqual(44);
  }
  // Esc closes the sheet and focus returns to the call button.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: "Garson çağır" })).toBeFocused();

  // The sheet speaks the guest's language: English falls back per option from the stored translations.
  await page.goto(`${M1}?lang=en`);
  await page.getByRole("button", { name: "Call waiter" }).click();
  const en = page.getByRole("dialog", { name: "How can we help?" });
  await expect(en.locator("button.g-call-option")).toHaveText([
    "Napkins, please",
    "I'd like to order",
    "Water, please",
    "The bill, please",
    "Just call",
  ]);
});

test("Peçete istiyorum çağrı notunu yazar (kasa çağrı listesinde Türkçe etiket)", async ({ page, browser }) => {
  const sheet = await openCallSheet(page);
  await sheet.getByRole("button", { name: "Peçete istiyorum" }).click();
  await expect(page.getByRole("status").filter({ hasText: "iletildi" })).toBeVisible();

  const cashier = await openStaff(browser, "kasa.havuz");
  await expect(cashier).toHaveURL(/\/kasa$/);
  await cashier.goto("/kasa?sekme=cagrilar");
  const calls = cashier.getByRole("region", { name: "Açık çağrılar" });
  await expect(calls).toContainText("M1");
  await expect(calls).toContainText("Peçete istiyorum");
  await cashier.context().close();
});

test("çift dokunuşta tek çağrı gider", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/q/*/call", async (route) => {
    if (route.request().method() === "POST") posts += 1;
    await route.continue();
  });
  const sheet = await openCallSheet(page);
  await sheet.getByRole("button", { name: "Su istiyorum" }).dblclick();
  await expect(page.getByRole("status").filter({ hasText: "iletildi" })).toBeVisible();
  expect(posts).toBe(1);
});
