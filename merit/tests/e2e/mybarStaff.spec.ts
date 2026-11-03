import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { newContextPage } from "./menuUi";
import { expectNoHorizontalScroll } from "./matrix/a11y";

// One database state for the whole file: ROYAL rooms 101-104 (MINI setup: Su 4, Kola 2), hotel pool 100 of each.
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

type Ids = { token101: string; token102: string; su: string; kola: string };
let ids: Ids;

/** The shared Postgres can be saturated by parallel runs ("too many clients"): connect with a few retries. */
async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const client = new Client({ connectionString: e2eDatabaseUrl() });
    try {
      await client.connect();
    } catch (error) {
      await client.end().catch(() => undefined);
      if (attempt >= 20) throw error;
      await new Promise((r) => setTimeout(r, 1_000));
      continue;
    }
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }
}

test.beforeAll(async () => {
  process.env.SEED_MINIBAR = "1";
  try {
    resetAndSeed();
  } finally {
    delete process.env.SEED_MINIBAR;
  }
  ids = await withDb(async (c) => {
    const room = async (n: string) =>
      (await c.query<{ qr_token: string }>(
        `SELECT r.qr_token FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE h.code = 'ROYAL' AND r.number = $1`,
        [n],
      )).rows[0]!.qr_token;
    const product = async (name: string) => (await c.query<{ id: string }>(`SELECT id FROM products WHERE name = $1`, [name])).rows[0]!.id;
    return { token101: await room("101"), token102: await room("102"), su: await product("Su"), kola: await product("Kola") };
  });
});

async function expectNoSeriousAxe(page: Page, label: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
    `axe violations of "${label}"`,
  ).toEqual([]);
}

async function staffPage(browser: Browser, user: string, viewport?: { width: number; height: number }): Promise<Page> {
  const page = await newContextPage(browser);
  if (viewport) await page.setViewportSize(viewport);
  await login(page, user);
  if (user === "depo.cok") await page.getByRole("button", { name: /Minibar/ }).first().click();
  await expect(page).not.toHaveURL(/\/giris|\/secim/);
  if (/erisimim/.test(page.url())) await page.getByRole("button", { name: "Anladım" }).click();
  return page;
}

async function guestSend(page: Page, token: string, items: { productId: string; qty: number }[], note?: string) {
  const res = await page.request.post(`/api/q/${token}/mybar`, {
    data: { idempotencyKey: randomUUID(), locale: "en", items, ...(note ? { note } : {}) },
  });
  expect(res.status(), await res.text()).toBe(200);
}

test("kat sorumlusu: zorunlu onay, kısmi karşılama, eksiklerle kapatma; misafir sayfası canlı güncellenir", async ({ browser }) => {
  const kat = await staffPage(browser, "kat.mr", { width: 390, height: 844 });
  await kat.goto("/kat/mybar");
  await expect(kat.getByRole("heading", { name: "MyBar Talepleri" })).toBeVisible();
  await expect(kat.getByRole("alertdialog")).toHaveCount(0);

  const guest = await newContextPage(browser, "en-US");
  await guestSend(guest, ids.token101, [{ productId: ids.su, qty: 2 }, { productId: ids.kola, qty: 1 }], "Ice please");
  await guest.goto(`/q/${ids.token101}?lang=en`);
  await expect(guest.locator(".mb-status")).toHaveAttribute("data-status", "BEKLIYOR");

  // Mandatory acknowledgement: the dialog appears, Escape and a click outside do not dismiss it.
  const dialog = kat.getByRole("alertdialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog).toContainText("Oda 101");
  await expect(dialog.getByTestId("mybar-counter")).toHaveText("1/1");
  await expect(dialog).toContainText("Su");
  await kat.keyboard.press("Escape");
  await kat.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  const ack = dialog.getByRole("button", { name: "Gördüm" });
  const box = (await ack.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(56);
  await expectNoSeriousAxe(kat, "alertdialog 390px");

  await ack.click();
  await expect(dialog).toHaveCount(0);
  await expect(guest.locator(".mb-status")).toHaveAttribute("data-status", "GORULDU", { timeout: 10_000 });
  expect(
    await withDb((c) => c.query(`SELECT seen_at FROM mybar_requests`).then((r) => r.rows[0]?.seen_at)),
  ).not.toBeNull();

  // The list: waiting section with the room; cancel is not offered to the floor attendant.
  const row = kat.getByTestId("mybar-row").filter({ hasText: "101" });
  await expect(row).toHaveAttribute("data-status", "BEKLEMEDE");
  await expectNoHorizontalScroll(kat);
  await row.getByRole("button", { expanded: false }).click();
  await expect(kat.getByTestId("fulfill-panel")).toBeVisible();
  await expect(kat.getByTestId("cancel-request")).toHaveCount(0);
  await expectNoSeriousAxe(kat, "list open 390px");

  // Deliver 1 of 2 Su and nothing of Kola.
  await kat.getByRole("button", { name: "Su azalt" }).click();
  await kat.getByRole("button", { name: "Kola azalt" }).click();
  await kat.getByRole("button", { name: "Seçilenleri Ekle" }).click();
  await expect(kat.getByTestId("detail-status")).toBeVisible();
  await expect
    .poll(() => withDb((c) => c.query(`SELECT SUM(delivered_qty)::int AS n FROM mybar_request_items`).then((r) => r.rows[0]?.n)))
    .toBe(1);
  expect(
    await withDb((c) => c.query(`SELECT remaining_qty FROM hotel_stocks WHERE product_id = $1`, [ids.su]).then((r) => r.rows[0]?.remaining_qty)),
  ).toBe(99);

  // Close with missing items: the rule indicator turns red for two words, the submit stays disabled.
  await kat.getByRole("button", { name: "Eksiklerle Kapat" }).click();
  const close = kat.getByRole("dialog");
  const submit = close.getByRole("button", { name: "Eksik ürünlerle kapat" });
  await close.getByRole("checkbox").check();
  await close.getByLabel("Açıklama").fill("stok yok");
  await expect(close.getByTestId("rule-hint")).toHaveAttribute("data-valid", "false");
  await expect(submit).toBeDisabled();
  await close.getByLabel("Açıklama").fill("Kola ve bir su depoda yoktu");
  await expect(close.getByTestId("rule-hint")).toHaveAttribute("data-valid", "true");
  await submit.click();

  await expect(kat.getByTestId("mybar-row").filter({ hasText: "101" })).toHaveAttribute("data-status", "TAMAMLANDI", { timeout: 10_000 });
  const done = await withDb((c) =>
    c.query(`SELECT status, closed_with_missing FROM mybar_requests`).then((r) => r.rows[0]),
  );
  expect(done).toMatchObject({ status: "TAMAMLANDI", closed_with_missing: true });
  await expect(guest.locator(".mb-status")).toHaveAttribute("data-status", "KARSILANDI", { timeout: 10_000 });

  await kat.context().close();
  await guest.context().close();
});

test("iki kat sorumlusu: birinin Gördüm onayı diğerinin penceresini kapatır; oda kontrol kartında karşılama", async ({ browser }) => {
  const a = await staffPage(browser, "kat.mr");
  const b = await staffPage(browser, "kat2.mr");
  await a.goto("/kat/mybar");
  await b.goto("/kat/mybar");
  const guest = await newContextPage(browser, "en-US");
  await guestSend(guest, ids.token102, [{ productId: ids.su, qty: 1 }]);

  await expect(a.getByRole("alertdialog")).toBeVisible({ timeout: 5_000 });
  await expect(b.getByRole("alertdialog")).toBeVisible({ timeout: 5_000 });
  await a.getByRole("button", { name: "Gördüm" }).click();
  await expect(a.getByRole("alertdialog")).toHaveCount(0);
  await expect(b.getByRole("alertdialog")).toHaveCount(0, { timeout: 5_000 });

  // Room-check card: open request with the same fulfil flow; "Tümünü Karşıla" then close.
  const roomId = await withDb((c) => c.query(`SELECT id FROM rooms WHERE number = '102' AND hotel_id = (SELECT id FROM hotels WHERE code = 'ROYAL')`).then((r) => r.rows[0]!.id as string));
  await b.goto(`/kat/oda-kontrol/${roomId}`);
  const card = b.getByTestId("mybar-room-card");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Tümünü Karşıla" }).click();
  await expect(card.getByRole("button", { name: "Talebi Kapat" })).toBeVisible({ timeout: 10_000 });
  await card.getByRole("button", { name: "Talebi Kapat" }).click();
  await b.getByRole("button", { name: "Kapat", exact: true }).click();
  await expect(b.getByTestId("mybar-room-card")).toHaveCount(0, { timeout: 10_000 });
  const st = await withDb((c) =>
    c.query(`SELECT status, closed_with_missing FROM mybar_requests r JOIN rooms ro ON ro.id = r.room_id WHERE ro.number = '102'`).then((r) => r.rows[0]),
  );
  expect(st).toMatchObject({ status: "TAMAMLANDI", closed_with_missing: false });

  await a.context().close();
  await b.context().close();
  await guest.context().close();
});

test("depo: zorunlu pencere çıkmaz; iptal sebebi 3 kelime kuralını sunucudan alır, geçerli sebeple iptal olur", async ({ browser }) => {
  const guest = await newContextPage(browser, "en-US");
  const token103 = await withDb((c) =>
    c.query(`SELECT qr_token FROM rooms WHERE number = '103' AND hotel_id = (SELECT id FROM hotels WHERE code = 'ROYAL')`).then((r) => r.rows[0]!.qr_token as string),
  );
  await guestSend(guest, token103, [{ productId: ids.su, qty: 1 }]);

  const depo = await staffPage(browser, "depo.cok");
  await depo.goto("/kat/mybar");
  const row = depo.getByTestId("mybar-row").filter({ hasText: "103" });
  await expect(row).toBeVisible();
  await expect(depo.getByRole("alertdialog")).toHaveCount(0);
  await row.getByRole("button", { expanded: false }).click();
  await depo.getByTestId("cancel-request").click();
  const dialog = depo.getByRole("dialog");
  await dialog.getByLabel("Diğer sebep").fill("iki kelime");
  await dialog.getByRole("button", { name: "Talebi iptal et" }).click();
  await expect(dialog).toContainText(/en az 3 kelimelik/);
  await dialog.getByLabel("Diğer sebep").fill("Misafir talebinden vazgeçti");
  await dialog.getByRole("button", { name: "Talebi iptal et" }).click();
  await expect(depo.getByTestId("mybar-row").filter({ hasText: "103" })).toHaveAttribute("data-status", "IPTAL", { timeout: 10_000 });

  await depo.context().close();
  await guest.context().close();
});
