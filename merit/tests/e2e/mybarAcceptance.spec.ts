import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect as baseExpect, login, resetAndSeed, test } from "./fixtures";

// P4 T10 acceptance beyond mybarFlow: depot cancel, short reasons, closing with missing products.
// ROYAL rooms 101-104 with QR tokens and the Su / Kola products come from SEED_MINIBAR.
const expect = baseExpect.configure({ timeout: 20_000 });
test.use({ viewport: { width: 1366, height: 768 } });

test.beforeEach(() => {
  process.env.SEED_MINIBAR = "1";
  try {
    resetAndSeed();
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

async function roomToken(room: string): Promise<string> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ qr_token: string }>(
      `SELECT r.qr_token FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE r.number = $1 AND h.code = 'ROYAL'`,
      [room],
    );
    return rows[0].qr_token;
  });
}

async function guestRequest(page: Page, room: string, products: Record<string, number>): Promise<void> {
  const token = await roomToken(room);
  const items = await withDb(async (db) => {
    const { rows } = await db.query<{ id: string; name: string }>(`SELECT id, name FROM products WHERE name = ANY($1)`, [
      Object.keys(products),
    ]);
    return rows.map((p) => ({ productId: p.id, qty: products[p.name] }));
  });
  const res = await page.request.post(`/api/q/${token}/mybar`, {
    headers: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.7` },
    data: { idempotencyKey: randomUUID(), locale: "tr", note: `Oda ${room} icin istek`, items },
  });
  expect(res.status(), await res.text()).toBe(200);
}

async function openDepotMybar(page: Page) {
  await login(page, "depo.mr");
  await expect(page).toHaveURL(/\/depo\/stok$/);
  await page.goto("/depo/mybar");
  const region = page.getByRole("region", { name: "MyBar Talepleri" });
  await expect(region).toBeVisible();
  return region;
}

test("depo MyBar talebini >= 10 karakterlik gerekçeyle iptal eder; misafir sayfası iptal gösterir", async ({ page, browser }) => {
  await guestRequest(page, "101", { Su: 2 });
  const guest = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.77.1.1" } })).newPage();
  try {
    await guest.goto(`/q/${await roomToken("101")}/mybar`);
    await expect(guest.locator(".mb-status")).toHaveAttribute("data-status", /BEKLIYOR|GORULDU/);

    const depot = await openDepotMybar(page);
    await depot.getByRole("row").filter({ hasText: "101" }).click();
    await depot.getByRole("button", { name: "Talebi iptal et" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Diğer sebep").fill("misafir odadan ayrıldı");
    await dialog.getByRole("button", { name: "İptal et" }).click();
    await expect(dialog).toHaveCount(0);

    await expect(guest.locator(".mb-status")).toHaveAttribute("data-status", "IPTAL", { timeout: 10_000 });
    const row = await withDb(async (db) =>
      (await db.query(`SELECT status, cancel_note FROM mybar_requests`)).rows[0] as { status: string; cancel_note: string },
    );
    expect(row).toEqual({ status: "IPTAL", cancel_note: "misafir odadan ayrıldı" });
  } finally {
    await guest.context().close();
  }
});

test("kısa gerekçe (< 10 karakter ve < 3 kelime) iptali başlatmaz; iki kelimelik gerekçe Türkçe doğrulama iletisiyle reddedilir", async ({ page }) => {
  await guestRequest(page, "101", { Su: 1 });
  const depot = await openDepotMybar(page);
  await depot.getByRole("row").filter({ hasText: "101" }).click();
  await depot.getByRole("button", { name: "Talebi iptal et" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Diğer sebep").fill("kısa not");
  await expect(dialog.getByRole("button", { name: "İptal et" })).toBeDisabled();
  await dialog.getByLabel("Diğer sebep").fill("kısa açıklama");
  await dialog.getByRole("button", { name: "İptal et" }).click();
  await expect(dialog.getByText(/en az 3 kelimelik geçerli bir açıklama/)).toBeVisible();
  const status = await withDb(async (db) => (await db.query(`SELECT status FROM mybar_requests`)).rows[0].status);
  expect(status).toBe("BEKLEMEDE");
});

test("eksik ürünle kapatma: havuzda olmayan ürün karşılanmaz, açıklamayla kapatılır, kısmi karşılama kaydedilir", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await withDb((db) =>
    db.query(
      `UPDATE hotel_stocks SET used_qty = total_qty, remaining_qty = 0
       WHERE product_id = (SELECT id FROM products WHERE name = 'Kola')
         AND hotel_id = (SELECT id FROM hotels WHERE code = 'ROYAL')`,
    ),
  );
  const guest = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.77.2.2" } })).newPage();
  try {
    await login(page, "kat.mr");
    await expect(page).toHaveURL(/\/kat$/, { timeout: 30_000 });
    await page.goto("/kat/mybar");
    await guestRequest(page, "101", { Su: 2, Kola: 2 });
    await guest.goto(`/q/${await roomToken("101")}/mybar`);

    await page.getByRole("alertdialog").getByRole("button", { name: "Gördüm" }).click();
    const row = page.getByTestId("mybar-row").filter({ hasText: "101" });
    await row.getByRole("button", { expanded: false }).click();
    await expect(page.getByText("Havuzda yok")).toBeVisible();
    await page.getByRole("button", { name: "Seçilenleri Ekle" }).click();
    await expect(page.getByTestId("fulfill-line-" + (await productId("Kola")))).toContainText("Kalan 2");

    await page.getByRole("button", { name: "Eksiklerle Kapat" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("list", { name: "Eksik ürünler" })).toContainText("Kola");
    await expect(dialog.getByRole("button", { name: "Eksik ürünlerle kapat" })).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await dialog.getByLabel("Açıklama").fill("kola havuzda yoktu");
    await dialog.getByRole("button", { name: "Eksik ürünlerle kapat" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toHaveAttribute("data-status", "TAMAMLANDI", { timeout: 10_000 });

    // The guest sees the request as handled (the status screen has no separate partial wording).
    await expect(guest.locator(".mb-status")).toHaveAttribute("data-status", "KARSILANDI", { timeout: 10_000 });
    const state = await withDb(async (db) => {
      const req = (await db.query(`SELECT status, closed_with_missing AS missing, close_note FROM mybar_requests`)).rows[0];
      const items = (
        await db.query(
          `SELECT p.name, i.requested_qty AS req, i.delivered_qty AS del FROM mybar_request_items i
           JOIN products p ON p.id = i.product_id ORDER BY p.name`,
        )
      ).rows;
      return { req, items };
    });
    expect(state.req).toMatchObject({ status: "TAMAMLANDI", missing: true, close_note: "kola havuzda yoktu" });
    expect(state.items).toEqual([
      { name: "Kola", req: 2, del: 0 },
      { name: "Su", req: 2, del: 2 },
    ]);
  } finally {
    await guest.context().close();
  }
});

async function productId(name: string): Promise<string> {
  return withDb(async (db) => (await db.query(`SELECT id FROM products WHERE name = $1`, [name])).rows[0].id);
}
