import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Client } from "pg";
import type { Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function createReceiptPrinter(): Promise<void> {
  await withDb(async (client) => {
    const hotel = await client.query<{ id: string }>("SELECT id FROM hotels WHERE code = 'MR'");
    const printer = await client.query<{ id: string }>(
      `INSERT INTO printers (id, hotel_id, name, ip, port, codepage, paper_width, is_active, created_at, updated_at)
       VALUES ($1, $2, 'Kabul yazıcısı', '127.0.0.1', 9100, 'cp857', 80, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
      [randomUUID(), hotel.rows[0].id],
    );
    await client.query("UPDATE outlets SET printer_id = $1 WHERE name = 'Havuz Bar'", [printer.rows[0].id]);
  });
}

async function sendOrder(page: Page): Promise<string> {
  await page.goto("/q/e2e-guest-m1");
  await page.locator("button.g-card", { hasText: "Mojito" }).click();
  await page.getByRole("dialog", { name: "Mojito" }).getByRole("button", { name: "Seçimlere ekle" }).click();
  await page.getByRole("button", { name: /^Seçimlerim/ }).click();
  await page.getByRole("dialog", { name: "Seçimlerim" }).getByRole("button", { name: "Seçimleri gönder" }).click();
  await expect(page).toHaveURL(/\/siparis\/[^/]+$/);
  return page.url();
}

async function approve(cashier: Page): Promise<void> {
  await cashier.getByRole("navigation", { name: "Personel bölümleri" }).getByRole("link", { name: "Kuyruk" }).click();
  await cashier.getByRole("button", { name: "Onayla" }).click();
}

async function approveOrderNo(cashier: Page, orderNo: number): Promise<void> {
  await cashier.getByRole("navigation", { name: "Personel bölümleri" }).getByRole("link", { name: "Kuyruk" }).click();
  const card = cashier.getByRole("article").filter({ hasText: `#${orderNo} ·` });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Onayla" }).click();
}

test.beforeAll(async () => {
  resetAndSeed({ guestMenu: true });
  await createReceiptPrinter();
});

test("QR sipariş kabul zinciri: fiyat gizli/göster, KDS-servis, fiş ve onay eskalasyonu", async ({ page, browser }) => {
  // HIDE is the default: the guest and KDS must not expose a currency or totals.
  await page.goto("/q/e2e-guest-m1");
  await expect(page.locator(".g-price")).toHaveCount(0);
  const hiddenStatusUrl = await sendOrder(page);

  const cashierContext = await browser.newContext({
    baseURL: "http://localhost:3000",
    locale: "tr-TR",
    extraHTTPHeaders: { "x-forwarded-for": "10.31.1.1" },
  });
  const cashier = await cashierContext.newPage();
  await login(cashier, "kasa.havuz");
  await expect(cashier).toHaveURL(/\/kasa$/);
  await cashier.getByRole("button", { name: "M1 masa ataması" }).click();
  const assignment = cashier.getByRole("dialog", { name: "M1 · Masa ataması" });
  await assignment.getByRole("combobox", { name: "Garson" }).selectOption({ label: "Test garson.havuz" });
  await assignment.getByRole("button", { name: "Ata", exact: true }).click();
  await approve(cashier);

  const kitchenContext = await browser.newContext({
    baseURL: "http://localhost:3000",
    locale: "tr-TR",
    extraHTTPHeaders: { "x-forwarded-for": "10.31.1.2" },
  });
  const kitchen = await kitchenContext.newPage();
  await login(kitchen, "kds.havuz");
  const newCard = kitchen.getByLabel("Yeni").getByRole("article").first();
  await expect(newCard).toBeVisible();
  await expect(newCard).not.toContainText("€");
  await newCard.getByRole("button", { name: "Başla" }).click();
  const prepCard = kitchen.getByLabel("Hazırlanıyor").getByRole("article").first();
  await expect(prepCard).toBeVisible();
  await prepCard.getByRole("button", { name: "Hazır" }).click();

  const waiterContext = await browser.newContext({
    baseURL: "http://localhost:3000",
    locale: "tr-TR",
    extraHTTPHeaders: { "x-forwarded-for": "10.31.1.3" },
  });
  const waiter = await waiterContext.newPage();
  await login(waiter, "garson.havuz");
  await waiter.getByRole("button", { name: /Havuz Bar/ }).click();
  await waiter.getByRole("button", { name: "Masalarım" }).click();
  await waiter.getByRole("button", { name: "Servis edildi" }).click();
  await page.goto(hiddenStatusUrl);
  await expect(page.getByRole("main")).toContainText("Servis");

  const hiddenReceipt = await withDb(async (client) =>
    client.query<{ payload: { subtotal?: string } }>(
      `SELECT p.payload FROM print_jobs p JOIN orders o ON o.id = p.order_id WHERE o.prices_shown = false`,
    ),
  );
  expect(hiddenReceipt.rows).toHaveLength(1);
  expect(hiddenReceipt.rows[0].payload).not.toHaveProperty("subtotal");

  // Acceptance 7: a valid table token cannot place an order once the outlet is closed.
  const closed = await withDb(async (client) => {
    const menu = await client.query<{ id: string }>("SELECT id FROM menu_nodes WHERE name = 'Mojito' LIMIT 1");
    await client.query("UPDATE outlets SET ordering_enabled = false WHERE name = 'Havuz Bar'");
    return page.request.post("/api/q/e2e-guest-m1/order", {
      data: { idempotencyKey: randomUUID(), locale: "tr", items: [{ menuNodeId: menu.rows[0].id, qty: 1 }] },
    });
  });
  expect(closed.status()).toBe(409);

  // SHOW is frozen onto the new order and its receipt alone carries the subtotal.
  await withDb((client) => client.query("UPDATE outlets SET ordering_enabled = true, price_display = 'SHOW' WHERE name = 'Havuz Bar'"));
  await page.goto("/q/e2e-guest-m1");
  await expect(page.locator(".g-price").first()).toContainText("€");
  await sendOrder(page);
  await cashier.reload();
  await approveOrderNo(cashier, 2);
  await expect.poll(() => withDb(async (client) => {
    const result = await client.query<{ status: string }>("SELECT status FROM orders WHERE order_no = 2");
    return result.rows[0]?.status;
  })).toBe("ONAYLANDI");
  const shownReceipt = await withDb(async (client) =>
    client.query<{ payload: { subtotal?: string } }>(
      `SELECT p.payload FROM print_jobs p JOIN orders o ON o.id = p.order_id WHERE o.prices_shown = true`,
    ),
  );
  expect(shownReceipt.rows).toHaveLength(1);
  expect(shownReceipt.rows[0].payload).toHaveProperty("subtotal");

  // Exercise the job entry point directly: the clock is advanced two minutes after an unapproved order.
  await sendOrder(page);
  await withDb(async (client) => {
    const hotel = await client.query<{ id: string }>("SELECT id FROM hotels WHERE code = 'MR'");
    const sgf = await client.query<{ id: string }>("SELECT id FROM users WHERE username = 'sef.havuz'");
    await client.query("DELETE FROM settings WHERE hotel_id = $1 AND key = 'order.approvalEscalationMinutes'", [hotel.rows[0].id]);
    await client.query(
      `INSERT INTO settings (id, hotel_id, key, value, created_at, updated_at)
       VALUES ($1, $2, 'order.approvalEscalationMinutes', '1'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [randomUUID(), hotel.rows[0].id],
    );
    await client.query("DELETE FROM notifications WHERE user_id = $1", [sgf.rows[0].id]);
  });
  const root = path.resolve(__dirname, "../..");
  const escalationOutput = execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      "-e",
      "import { config } from 'dotenv'; import path from 'node:path'; void (async () => { config({ path: path.resolve(process.cwd(), '.env'), quiet: true }); const { escalation } = await import('./src/modules/order/server/escalation'); const { prisma } = await import('./src/lib/prisma'); console.log(await escalation.run(new Date(Date.now() + 120000))); await prisma.$disconnect(); })().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });",
    ],
    { cwd: root, env: process.env },
  );
  expect(escalationOutput.toString()).toContain("1");

  const chiefContext = await browser.newContext({ baseURL: "http://localhost:3000", locale: "tr-TR", extraHTTPHeaders: { "x-forwarded-for": "10.31.1.4" } });
  const chief = await chiefContext.newPage();
  await login(chief, "sef.havuz");
  await expect(chief).toHaveURL(/\/garson$/);
  await expect(chief.getByTestId("bell-badge")).toBeVisible();
  await chief.getByRole("button", { name: /^Bildirimler/ }).click();
  await expect(chief.getByRole("dialog", { name: "Bildirimler" })).toContainText("Onay bekleyen sipariş");

  await chiefContext.close();
  await waiterContext.close();
  await kitchenContext.close();
  await cashierContext.close();
});
