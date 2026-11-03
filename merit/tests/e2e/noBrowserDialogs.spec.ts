import { expect, login, resetAndSeed, test } from "./fixtures";
import { approveOrder, assignWaiter, openStaff, sendGuestOrder } from "./opsUi";
import { newContextPage } from "./menuUi";

test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });
test.beforeAll(() => resetAndSeed({ guestMenu: true }));

/** Personel/POS akışlarında tarayıcının yerel diyaloğu hiç açılmamalı. */
test.beforeEach(({ page }) => {
  page.on("dialog", (d) => {
    throw new Error(`Beklenmeyen tarayıcı diyaloğu (${d.type()}): ${d.message()}`);
  });
});

test("garson kuyruğunda ret: sebep diyaloğu, kart düşer, durum bildirimi", async ({ page, browser }) => {
  const cashier = await openStaff(browser, "kasa.havuz");
  await assignWaiter(cashier, "M1", "Test garson.havuz");
  const order = await sendGuestOrder(page);
  const waiter = await openStaff(browser, "garson.havuz");
  waiter.on("dialog", (d) => {
    throw new Error(`Beklenmeyen tarayıcı diyaloğu (${d.type()})`);
  });
  const card = waiter.getByRole("article").filter({ hasText: `#${order.orderNo}` });
  await card.getByRole("button", { name: "Reddet" }).click();
  const dialog = waiter.getByRole("dialog", { name: new RegExp(`#${order.orderNo}`) });
  const confirmButton = dialog.getByRole("button", { name: "Reddet" });
  await expect(confirmButton).toBeDisabled();
  await dialog.getByLabel("Diğer sebep").fill("ab");
  await expect(confirmButton).toBeDisabled();
  await dialog.getByRole("button", { name: "Mutfak aşırı yoğun" }).click();
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
  await expect(card).toHaveCount(0);
  await expect(waiter.getByRole("status").filter({ hasText: "reddedildi" })).toBeVisible();
  await waiter.context().close();
  await cashier.context().close();
});

test("kasa /kasa/iptal: tek sebep diyaloğu ile iptal", async ({ page, browser }) => {
  const order = await sendGuestOrder(page);
  const cashier = await openStaff(browser, "kasa.havuz");
  cashier.on("dialog", (d) => {
    throw new Error(`Beklenmeyen tarayıcı diyaloğu (${d.type()})`);
  });
  await approveOrder(cashier, order.orderNo);
  await cashier.getByRole("navigation", { name: "Personel bölümleri" }).getByRole("link", { name: "İptal" }).click();
  await expect(cashier).toHaveURL(/\/kasa\/iptal$/);
  const row = cashier.getByRole("article").filter({ hasText: `#${order.orderNo} ·` });
  await row.getByRole("button", { name: "İptal et" }).click();
  const dialog = cashier.getByRole("dialog", { name: /siparişini iptal et$/ });
  await dialog.getByLabel("Diğer sebep").fill("misafir vazgeçti");
  await dialog.getByRole("button", { name: "İptal et" }).click();
  await expect(row).toHaveCount(0);
  await expect(cashier.getByRole("status").filter({ hasText: "iptal edildi" })).toBeVisible();
  await cashier.context().close();
});

test("kat /kat/qr: geçersiz QR kodu satır içi hata", async ({ browser }) => {
  const page = await newContextPage(browser);
  page.on("dialog", (d) => {
    throw new Error(`Beklenmeyen tarayıcı diyaloğu (${d.type()})`);
  });
  await login(page, "kat.mr");
  await expect(page).toHaveURL(/\/(kat|erisimim)/);
  if (/erisimim/.test(page.url())) await page.getByRole("button", { name: "Anladım" }).click();
  await expect(page).toHaveURL(/\/kat$/);
  await page.goto("/kat/qr");
  const input = page.getByLabel("QR kodu");
  await input.fill("1234");
  await page.getByRole("button", { name: "Aç", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Geçersiz veya tanınmayan QR kod" })).toBeVisible();
  await expect(input).toBeFocused();
  await page.context().close();
});

test("admin /depo/tanimlar: silme tek onay, Sil/Vazgeç, odak Vazgeç, sonra bildirim", async ({ page }) => {
  page.on("dialog", (d) => {
    throw new Error(`Beklenmeyen tarayıcı diyaloğu (${d.type()})`);
  });
  // depo.cok may not edit definitions (Bu işlem için yetkiniz yok); the admin owns them.
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin/);
  await page.goto("/depo/tanimlar");
  await page.getByRole("button", { name: /Ürün Grupları/ }).click();
  await page.getByRole("button", { name: /Yeni Ürün Grubu/ }).click();
  await page.getByPlaceholder(/Meşrubat/).fill("Silinecek Grup");
  await page.getByRole("button", { name: "Kaydet" }).click();
  const card = page.getByRole("heading", { name: "Silinecek Grup" }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
  await card.getByRole("button", { name: "Sil" }).click();
  const dialog = page.getByRole("dialog", { name: /silinsin mi\?$/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Vazgeç" })).toBeFocused();
  await dialog.getByRole("button", { name: "Sil" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: /silindi/i })).toBeVisible();
  await page.context().close();
});
