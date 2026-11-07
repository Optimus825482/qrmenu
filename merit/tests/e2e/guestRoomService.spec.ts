import type { Locator, Page } from "@playwright/test";
import { Client } from "pg";
import { expect, resetAndSeed, test } from "./fixtures";
import { e2eDatabaseUrl, setPhoneConfirm } from "./e2eDb";

// One database state for the whole file: later tests reuse the first order and the S0 room-service world
// (ROYAL rooms 101 / 102, DIAMOND room 301, menu "Çay" 25 and "Club Sandviç" 320).
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

test.beforeAll(() => {
  resetAndSeed();
});

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const roomToken = (number: string, hotelCode = "ROYAL") =>
  withDb(async (db) => {
    const { rows } = await db.query<{ qr_token: string }>(
      `SELECT r.qr_token FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE r.number = $1 AND h.code = $2`,
      [number, hotelCode],
    );
    return rows[0].qr_token;
  });

const setRoomActive = (number: string, active: boolean) =>
  withDb((db) =>
    db.query(`UPDATE rooms SET is_active = $2 WHERE number = $1 AND hotel_id = (SELECT id FROM hotels WHERE code = 'ROYAL')`, [number, active]),
  );

const setHotelModule = (hotelCode: string, moduleKey: string, enabled: boolean) =>
  withDb(async (db) => {
    const { rowCount } = await db.query(
      `UPDATE hotel_modules SET enabled = $3 WHERE module_key = $2 AND hotel_id = (SELECT id FROM hotels WHERE code = $1)`,
      [hotelCode, moduleKey, enabled],
    );
    expect(rowCount).toBe(1);
  });

const setOutlet = (column: "ordering_enabled" | "price_display", value: boolean | string) =>
  withDb(async (db) => {
    const cast = column === "price_display" ? `$1::"PriceDisplay"` : "$1";
    const { rowCount } = await db.query(
      `UPDATE outlets SET ${column} = ${cast} WHERE type = 'ODA_SERVISI' AND hotel_id = (SELECT id FROM hotels WHERE code = 'ROYAL')`,
      [value],
    );
    expect(rowCount).toBe(1);
  });

const card = (page: Page, name: string): Locator => page.locator("button.g-card", { hasText: name });
const badge = (page: Page): Locator => page.getByTestId("selection-count");
const roomServiceLink = (page: Page): Locator => page.getByRole("link", { name: /Oda Servisi/ });

/** Opens the item sheet of `name`, raises the quantity to `quantity` and adds it with `note`. */
async function addItem(page: Page, name: string, quantity: number, note: string): Promise<void> {
  await card(page, name).click();
  const sheet = page.getByRole("dialog", { name });
  for (let i = 1; i < quantity; i++) await sheet.getByRole("button", { name: "+", exact: true }).click();
  if (note) await sheet.getByLabel("Not").fill(note);
  await sheet.getByRole("button", { name: "Seçimlere ekle" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function sendSelections(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Seçimlerim/ }).click();
  const drawer = page.getByRole("dialog", { name: "Seçimlerim" });
  await drawer.getByRole("button", { name: "Seçimleri gönder" }).click();
  await expect(page).toHaveURL(/\/siparis\/[^/]+$/);
}

let firstOrderUrl = "";

test("kart → menü → Çay ×2 + not → Seçimlerim 2 → gönder → Gönderildi #1; yenileyince aynı @kabul-8", async ({ page }) => {
  const token = await roomToken("101");
  await page.goto(`/q/${token}`);
  await expect(roomServiceLink(page)).toBeVisible();
  await roomServiceLink(page).click();
  await expect(page).toHaveURL(new RegExp(`/q/${token}/oda-servisi$`));
  await expect(page.locator("body")).not.toContainText(/sepet|cart/i);
  await expect(badge(page)).toHaveCount(0);

  await addItem(page, "Çay", 2, "şekersiz");
  await expect(badge(page)).toHaveText("2");

  await page.getByRole("button", { name: /^Seçimlerim/ }).click();
  const drawer = page.getByRole("dialog", { name: "Seçimlerim" });
  await expect(drawer.getByText("Çay")).toBeVisible();
  await expect(drawer.locator('input[type="text"]')).toHaveValue("şekersiz");
  await drawer.getByRole("button", { name: "Seçimleri gönder" }).click();

  await expect(page).toHaveURL(/\/siparis\/[^/]+$/);
  firstOrderUrl = new URL(page.url()).pathname;
  const status = page.getByRole("main");
  await expect(status.getByRole("heading", { level: 2 })).toContainText("#1");
  await expect(status.locator('li[aria-current="step"]')).toContainText("Gönderildi");
  await expect(status.getByText("2 × Çay")).toBeVisible();
  await expect(status.getByText("şekersiz")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/sepet|cart/i);

  await page.reload();
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toContainText("#1");
  await expect(page.getByRole("main").locator('li[aria-current="step"]')).toContainText("Gönderildi");
});

test("teyit varyantı: Teyit adımı görünür, Vazgeç siparişi İptal durumuna çevirir @kabul-8", async ({ page }) => {
  await setPhoneConfirm("ROYAL", true);
  try {
    const token = await roomToken("102");
    await page.goto(`/q/${token}/oda-servisi`);
    await addItem(page, "Club Sandviç", 1, "");
    await expect(badge(page)).toHaveText("1");
    await sendSelections(page);

    const status = page.getByRole("main");
    await expect(status.getByRole("listitem").filter({ hasText: "Teyit bekleniyor" }).first()).toBeVisible();
    await expect(status.locator('li[aria-current="step"]')).toContainText("Teyit bekleniyor");

    await status.getByRole("button", { name: "Vazgeç" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("vazgeçmek istiyor musunuz");
    await dialog.getByRole("button", { name: "Vazgeç" }).click();

    await expect(status.getByText(/iptal edildi/i).first()).toBeVisible();
    await expect(status.getByRole("button", { name: "Vazgeç" })).toHaveCount(0);
    await page.reload();
    await expect(status.getByText(/iptal edildi/i).first()).toBeVisible();
  } finally {
    await setPhoneConfirm("ROYAL", false);
  }
});

test("?lang=ar: sağdan sola, Arapça arayüz @kabul-10", async ({ page }) => {
  const token = await roomToken("101");
  await page.goto(`/q/${token}?lang=ar`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.goto(`/q/${token}/oda-servisi`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("button", { name: /^Seçimlerim/ })).toHaveCount(0); // the footer button is Arabic too
  await expect(page.locator("body")).not.toContainText(/sepet|cart/i);
});

test("fiyat modu: SHOW fiyat gösterir, HIDE hiç fiyat ve € göstermez", async ({ page }) => {
  const token = await roomToken("101");
  try {
    await setOutlet("price_display", "SHOW");
    await page.goto(`/q/${token}/oda-servisi`);
    await expect(card(page, "Çay").locator(".g-price")).toContainText("25");

    await setOutlet("price_display", "HIDE");
    await page.reload();
    await expect(card(page, "Çay")).toBeVisible();
    await expect(page.locator(".g-price")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("€");
    await addItem(page, "Çay", 1, "");
    await page.getByRole("button", { name: /^Seçimlerim/ }).click();
    await expect(page.getByRole("dialog", { name: "Seçimlerim" }).locator(".g-price")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("€");
  } finally {
    await setOutlet("price_display", "INHERIT");
  }
});

test("karşı otel (DIAMOND 301): ROYAL menüsü görünmez; modül kapalıyken kart yok ve /oda-servisi odaya yönlendirir", async ({ page }) => {
  const token = await roomToken("301", "DIAMOND");
  // The seed gives every hotel a room-service outlet; DIAMOND's has no menu, so its page never shows ROYAL's items.
  await page.goto(`/q/${token}/oda-servisi`);
  await expect(page.locator("body")).not.toContainText("Çay");
  await expect(page.locator("button.g-card")).toHaveCount(0);

  // Hotel without the room-service module: no card at all, and the page sends the guest back to the room page.
  await setHotelModule("DIAMOND", "ROOM_SERVICE", false);
  try {
    await page.goto(`/q/${token}`);
    await expect(page.getByText("Oda Servisi")).toHaveCount(0);
    await page.goto(`/q/${token}/oda-servisi`);
    await expect(page).toHaveURL(new RegExp(`/q/${token}$`));
  } finally {
    await setHotelModule("DIAMOND", "ROOM_SERVICE", true);
  }
});

test("pasif oda: kart yok, /oda-servisi menü yerine kullanılamıyor sayfası gösterir", async ({ page }) => {
  const token = await roomToken("102");
  await setRoomActive("102", false);
  try {
    await page.goto(`/q/${token}`);
    await expect(page.getByText("Bu oda şu an kullanılamıyor")).toBeVisible();
    await expect(roomServiceLink(page)).toHaveCount(0);
    // The guest layout answers for the whole /q/{token} tree: no menu, no way to order.
    await page.goto(`/q/${token}/oda-servisi`);
    await expect(page.getByText("Bu oda şu an kullanılamıyor")).toBeVisible();
    await expect(page.locator("button.g-card")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Seçimlerim/ })).toHaveCount(0);
  } finally {
    await setRoomActive("102", true);
  }
});

test("orderingEnabled=false: seçim düğmesi yok, mevcut siparişin durum sayfası açık", async ({ page }) => {
  expect(firstOrderUrl).not.toBe("");
  const token = await roomToken("101");
  await setOutlet("ordering_enabled", false);
  try {
    await page.goto(`/q/${token}`);
    await expect(roomServiceLink(page)).toBeVisible();
    await expect(page.getByText("Şu an sipariş alınmıyor", { exact: false })).toBeVisible();

    await page.goto(`/q/${token}/oda-servisi`);
    await expect(card(page, "Çay")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Seçimlerim/ })).toHaveCount(0);
    await card(page, "Çay").click();
    const sheet = page.getByRole("dialog", { name: "Çay" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Seçimlere ekle" })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto(firstOrderUrl);
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toContainText("#1");
    await expect(page.getByRole("main").getByText("2 × Çay")).toBeVisible();
  } finally {
    await setOutlet("ordering_enabled", true);
  }
});
