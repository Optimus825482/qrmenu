import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { expect, resetAndSeed, test } from "./fixtures";
import { e2eDatabaseUrl } from "./e2eDb";
import { expectNoHorizontalScroll } from "./matrix/a11y";

// One database state for the whole file: ROYAL rooms 101-104 (one type, MINI + ATIŞTIRMA setups, QR tokens), the guest menu tables.
test.describe.configure({ mode: "serial" });
test.use({ locale: "en-US" });

test.beforeAll(() => {
  process.env.SEED_MINIBAR = "1";
  try {
    resetAndSeed({ guestMenu: true });
  } finally {
    delete process.env.SEED_MINIBAR;
  }
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

async function expectNoSeriousAxe(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
    `axe violations of "${label}"`,
  ).toEqual([]);
}

// Groups are sorted by name (Atıştırmalık first); Su and Kola live in the second tab.
const drinks = (page: Page) => page.getByRole("tab", { name: "İçecek" }).click();
const plusOf = (page: Page, name: string) => page.getByRole("button", { name: `Add one ${name}` });
const send = (page: Page) => page.getByRole("button", { name: /SEND MYBAR REQUEST/ });
const noteBox = (page: Page) => page.getByLabel("Additional notes or special requests");

test("AR: sağdan sola, Arapça başlık; Su ×2 + not gönderilir, durum Bekleyen; sayfa yenilenince günlük sınır mesajı", async ({ page }) => {
  const token = await roomToken("101");
  await page.goto(`/q/${token}?lang=ar`);
  await expect(page).toHaveURL(new RegExp(`/q/${token}$`));
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { level: 1, name: "MYBAR" })).toBeVisible();
  await expect(page.locator("[data-room-frame]")).toContainText("غرفة 101");
  await expect(page.locator("[data-room-frame]")).toHaveAttribute("dir", "rtl");
  await expectNoSeriousAxe(page, "AR form");

  // The product name falls back to the Turkish base name when no translation exists.
  await drinks(page);
  const plus = page.getByRole("button", { name: /^زيادة Su$/ });
  await plus.click();
  await plus.click();
  await page.getByLabel("ملاحظات إضافية أو طلبات خاصة").fill("buz ve ekstra bardak");
  await page.getByRole("button", { name: "إرسال طلب MYBAR" }).click();

  await expect(page.getByText("تم استلام طلبك بنجاح!")).toBeVisible();
  await expect(page.getByText("قيد الانتظار")).toBeVisible(); // BEKLIYOR
  await expect(page.getByRole("list").filter({ hasText: "Su" })).toContainText("2");
  await expectNoSeriousAxe(page, "AR status");

  await page.reload();
  await expect(page.getByTestId("mybar-daily-limit")).toContainText("يسمح بطلب واحد يومياً");
  await expect(page.getByText("قيد الانتظار")).toBeVisible();
  await expect(page.getByRole("button", { name: "إرسال طلب MYBAR" })).toHaveCount(0);

  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/sepet|cart|basket|€|₺|\$|price/i);
});

test("ikinci cihaz aynı gün gönderirse: günlük sınır mesajı, başarı kutusu yok, mevcut talep gösterilir", async ({ browser }) => {
  const token = await roomToken("102");
  const context = await browser.newContext({ locale: "en-US" });
  const one = await context.newPage();
  const two = await context.newPage();
  await one.goto(`/q/${token}?lang=en`);
  await two.goto(`/q/${token}`);
  await expect(send(two)).toBeVisible();

  await drinks(one);
  await plusOf(one, "Su").click();
  await send(one).click();
  await expect(one.getByText("Request received!")).toBeVisible();
  await expect(one.getByText("Pending")).toBeVisible();

  await drinks(two);
  await plusOf(two, "Kola").click();
  await send(two).click();
  await expect(two.locator(".mb-alert")).toContainText("A request was already sent from this room today.");
  await expect(two.getByText("Request received!")).toHaveCount(0);
  await expect(two.getByText("Pending")).toBeVisible();
  await context.close();
});

test("canlı durum: kat sorumlusu görünce sayfa Pending -> Seen olur (sayfa yenilenmeden)", async ({ page }) => {
  const token = await roomToken("103");
  await page.goto(`/q/${token}?lang=en`);
  await drinks(page);
  await plusOf(page, "Kola").click();
  await send(page).click();
  await expect(page.getByText("Pending")).toBeVisible();

  // Stand-in for the floor attendant's "seen" (the staff screens are another task): the row and the realtime event.
  await withDb(async (db) => {
    const { rows } = await db.query<{ id: string; hotel_id: string; room_id: string }>(
      `SELECT m.id, m.hotel_id, m.room_id FROM mybar_requests m JOIN rooms r ON r.id = m.room_id WHERE r.number = '103'`,
    );
    const r = rows[0];
    await db.query(`UPDATE mybar_requests SET seen_at = now() WHERE id = $1`, [r.id]);
    const event = { type: "mybar.seen", hotelId: r.hotel_id, roomId: r.room_id, payload: { requestId: r.id, roomId: r.room_id, byUserId: "staff-secret" }, at: new Date().toISOString() };
    await db.query(`SELECT pg_notify('merit_events', $1)`, [JSON.stringify(event)]);
  });
  await expect(page.getByText("Seen", { exact: true })).toBeVisible();

  // Another room's event never reaches this page.
  await withDb(async (db) => {
    const event = { type: "mybar.cancelled", hotelId: "x", roomId: "other-room", payload: { requestId: "z" }, at: new Date().toISOString() };
    await db.query(`SELECT pg_notify('merit_events', $1)`, [JSON.stringify(event)]);
  });
  await page.waitForTimeout(500);
  await expect(page.getByText("Seen", { exact: true })).toBeVisible();
});

test("dil seçimi çerezle ve localStorage ile kalıcı; menüden dil değişir", async ({ page }) => {
  const token = await roomToken("104");
  await page.goto(`/q/${token}?lang=de`);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("button", { name: /MYBAR-ANFRAGE SENDEN/ })).toBeVisible();
  await page.goto(`/q/${token}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");

  await page.locator(".g-lang-btn").click();
  await page.getByRole("menuitem", { name: /Русский/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  expect(await page.evaluate(() => window.localStorage.getItem("merit.guest.lang"))).toBe("ru");

  // Cookie cleared, localStorage kept: the remembered language is re-applied on the next visit.
  await page.context().clearCookies();
  await page.goto(`/q/${token}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
});

test("boş gönderim istek atmaz; not 501 karakterde gönder pasif; sayaç; 375 px yatay kaydırma yok, dokunma hedefleri >= 44 px", async ({ page }) => {
  const token = await roomToken("201");
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/q/${token}?lang=en`);
  let posted = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/mybar")) posted += 1;
  });
  await send(page).click();
  await expect(page.locator(".mb-alert")).toHaveText("Please select at least one item or write a note.");
  expect(posted).toBe(0);

  await noteBox(page).fill("x".repeat(12));
  await expect(page.getByText("12/500")).toBeVisible();
  await noteBox(page).fill("x".repeat(501));
  await expect(page.getByText("501/500")).toBeVisible();
  await expect(send(page)).toBeDisabled();
  await noteBox(page).fill("");

  await drinks(page);
  await plusOf(page, "Su").click();
  await expectNoHorizontalScroll(page);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, a[href], textarea, [role=tab], [role=checkbox]")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
      .map(({ el, r }) => `${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  expect(small).toEqual([]);
  await expectNoSeriousAxe(page, "375px form");
});

test("pasif oda 'kullanılamıyor' sayfası; masa tokenına MyBar gönderimi 404; bilinmeyen token 404", async ({ page, request }) => {
  const token = await roomToken("202");
  await withDb((db) => db.query(`UPDATE rooms SET is_active = false WHERE number = '202'`));
  await page.goto(`/q/${token}?lang=en`);
  await expect(page.getByRole("heading", { name: "MyBar is unavailable" })).toBeVisible();
  await expect(page.getByText("This room is currently unavailable.")).toBeVisible();
  await expect(page.getByRole("button", { name: /SEND MYBAR REQUEST/ })).toHaveCount(0);

  const body = { idempotencyKey: "11111111-1111-4111-8111-111111111111", locale: "en", items: [], note: "hi" };
  const table = await request.post("/api/q/e2e-guest-m1/mybar", { data: body });
  expect(table.status()).toBe(404);
  const unknown = await request.post("/api/q/doesnotexistdoesnotexist12345678/mybar", { data: body });
  expect(unknown.status()).toBe(404);
});

test("ürünsüz oda tipi: noSetupMessage ve yalnız notla gönderim başarılı", async ({ page }) => {
  const token = await roomToken("203");
  await withDb((db) => db.query(`UPDATE rooms SET room_type_id = NULL WHERE number = '203'`));
  await page.goto(`/q/${token}?lang=en`);
  await expect(page.getByTestId("mybar-no-setup")).toContainText("There are no products to choose for your room.");
  await noteBox(page).fill("Please bring two extra towels");
  await send(page).click();
  await expect(page.getByText("Request received!")).toBeVisible();
  await expect(page.getByText("Only a note was sent.")).toBeVisible();
});
