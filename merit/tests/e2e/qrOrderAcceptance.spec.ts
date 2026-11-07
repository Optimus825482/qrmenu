import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, resetAndSeed, test } from "./fixtures";
import { approveOrder, assignWaiter, M1_TOKEN, openStaff, prepareOrder, sendGuestOrder, serveOrder } from "./opsUi";

test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function createReceiptPrinter(): Promise<void> {
  await withDb(async (client) => {
    const hotel = await client.query<{ id: string }>("SELECT id FROM hotels WHERE code = 'ROYAL'");
    const printer = await client.query<{ id: string }>(
      `INSERT INTO printers (id, hotel_id, name, ip, port, codepage, paper_width, is_active, created_at, updated_at)
       VALUES ($1, $2, 'Kabul yazıcısı', '127.0.0.1', 9100, 'cp857', 80, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
      [randomUUID(), hotel.rows[0].id],
    );
    await client.query("UPDATE outlets SET printer_id = $1 WHERE name = 'Havuz Bar'", [printer.rows[0].id]);
  });
}

test.beforeAll(async () => {
  resetAndSeed({ guestMenu: true });
  await createReceiptPrinter();
});

test("QR sipariş kabul zinciri: fiyat gizli/göster, KDS-servis, fiş ve onay eskalasyonu @kabul-7", async ({ page, browser }) => {
  // HIDE is the default: the guest and KDS must not expose a currency or totals.
  await page.goto(`/q/${M1_TOKEN}`);
  await expect(page.locator(".g-price")).toHaveCount(0);
  const hidden = await sendGuestOrder(page);

  const cashier = await openStaff(browser, "kasa.havuz");
  await expect(cashier).toHaveURL(/\/kasa$/);
  await assignWaiter(cashier, "M1", "Test garson.havuz");
  await approveOrder(cashier, hidden.orderNo);

  const kitchen = await openStaff(browser, "kds.havuz");
  const readyCard = await prepareOrder(kitchen, hidden.orderNo);
  await expect(readyCard).not.toContainText("€");

  const waiter = await openStaff(browser, "garson.havuz");
  await serveOrder(waiter, hidden.orderNo);
  await page.goto(hidden.url);
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
    return page.request.post(`/api/q/${M1_TOKEN}/order`, {
      data: { idempotencyKey: randomUUID(), locale: "tr", items: [{ menuNodeId: menu.rows[0].id, qty: 1 }] },
    });
  });
  expect(closed.status()).toBe(409);

  // SHOW is frozen onto the new order and its receipt alone carries the subtotal.
  await withDb((client) => client.query("UPDATE outlets SET ordering_enabled = true, price_display = 'SHOW' WHERE name = 'Havuz Bar'"));
  await page.goto(`/q/${M1_TOKEN}`);
  await expect(page.locator(".g-price").first()).toContainText("€");
  const shown = await sendGuestOrder(page);
  await cashier.reload();
  await approveOrder(cashier, shown.orderNo);
  await expect.poll(() => withDb(async (client) => {
    const result = await client.query<{ status: string }>("SELECT status FROM orders WHERE order_no = $1", [shown.orderNo]);
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
  await sendGuestOrder(page);
  await withDb(async (client) => {
    const hotel = await client.query<{ id: string }>("SELECT id FROM hotels WHERE code = 'ROYAL'");
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
  // The job must run against the e2e database, never the DATABASE_URL of .env.
  const escalationOutput = execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      "-e",
      "void (async () => { const { escalation } = await import('./src/modules/order/server/escalation'); const { prisma } = await import('./src/lib/prisma'); console.log(await escalation.run(new Date(Date.now() + 120000))); await prisma.$disconnect(); })().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });",
    ],
    { cwd: root, env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() } },
  );
  expect(escalationOutput.toString()).toContain("1");

  const chief = await openStaff(browser, "sef.havuz");
  await expect(chief).toHaveURL(/\/garson$/);
  await expect(chief.getByTestId("bell-badge")).toBeVisible();
  await chief.getByRole("button", { name: /^Bildirimler/ }).click();
  await expect(chief.getByRole("dialog", { name: "Bildirimler" })).toContainText("Onay bekleyen sipariş");

  await chief.context().close();
  await waiter.context().close();
  await kitchen.context().close();
  await cashier.context().close();
});
