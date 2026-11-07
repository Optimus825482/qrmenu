import { randomUUID } from "node:crypto";
import { expect, resetAndSeed, test } from "../fixtures";
import { approveOrder, assignWaiter, M1_TOKEN, openStaff, prepareOrder, queueCard, railLink, serveOrder } from "../opsUi";
import { newContextPage, openAdminShell, openMenuManager, setPriceDisplay } from "../menuUi";
import { sql } from "./order-support";

test.use({ locale: "tr-TR" });

test.describe("@kabul-7 QR siparişin onay, fiyat ve alım kapısı", () => {
  test.beforeAll(() => resetAndSeed({ guestMenu: true }));
  test("onaysız sipariş KDS/fişe ulaşmaz; garson yetkisi, kasa onayı ve servis zinciri doğrulanır", async ({ page, browser }) => {
    test.setTimeout(120_000);
    await sql(`INSERT INTO printers (id, hotel_id, name, ip, port, codepage, paper_width, is_active, created_at, updated_at)
      VALUES ($1, (SELECT id FROM hotels WHERE code='ROYAL'), 'K07 yazıcı', '192.0.2.50', 9100, 'cp857', 80, true, now(), now())`, [randomUUID()]);
    await sql("UPDATE outlets SET printer_id=(SELECT id FROM printers WHERE name='K07 yazıcı') WHERE name='Havuz Bar'");
    await page.goto(`/q/${M1_TOKEN}`);
    await expect(page.locator(".g-price")).toHaveCount(0);
    await page.locator("button.g-card", { hasText: "Mojito" }).click();
    await page.getByRole("dialog", { name: "Mojito" }).getByRole("button", { name: "Seçimlere ekle" }).click();
    await page.getByRole("button", { name: /^Seçimlerim/ }).click();
    const drawer = page.getByRole("dialog", { name: "Seçimlerim" });
    await expect(drawer).not.toContainText("€");
    await drawer.getByRole("button", { name: "Seçimleri gönder" }).click();
    await expect(page).toHaveURL(/\/siparis\/[^/]+$/);
    const order = { orderNo: Number((await page.getByRole("main").getByRole("heading", { level: 2 }).textContent())!.match(/#(\d+)/)![1]) };
    await expect(page.getByRole("main")).not.toContainText("€");
    const kitchen = await openStaff(browser, "kds.havuz");
    const waiter = await openStaff(browser, "garson.havuz");
    const cashier = await openStaff(browser, "kasa.havuz");
    try {
      await expect(kitchen.locator("[data-kds-board]")).not.toContainText(`#${order.orderNo}`);
      expect(await sql("SELECT id FROM print_jobs")).toHaveLength(0);
      await expect(waiter.getByRole("button", { name: "Onayla", exact: true })).toBeDisabled();
      await expect(waiter.locator("article")).not.toContainText("€");
      await assignWaiter(cashier, "M1", "Test garson.havuz");
      await expect(waiter.getByRole("button", { name: "Onayla", exact: true })).toBeEnabled();
      // Cashier approval is authorized independently of table assignment.
      await railLink(cashier, /^Kuyruk/).click();
      await expect(queueCard(cashier, order.orderNo)).not.toContainText("€");
      await approveOrder(cashier, order.orderNo);
      const ready = await prepareOrder(kitchen, order.orderNo);
      await expect(ready).not.toContainText("€");
      const jobs = await sql<{ payload: object }>("SELECT payload FROM print_jobs");
      expect(jobs).toHaveLength(1);
      expect(jobs[0].payload).not.toHaveProperty("subtotal");
      await serveOrder(waiter, order.orderNo);
      await expect(page.getByRole("main")).toContainText("Servis", { timeout: 3000 });
      await sql("UPDATE outlets SET ordering_enabled=false WHERE name='Havuz Bar'");
      const [item] = await sql<{ id: string }>("SELECT id FROM menu_nodes WHERE name='Mojito'");
      const refused = await page.request.post(`/api/q/${M1_TOKEN}/order`, { data: { idempotencyKey: randomUUID(), locale: "tr", items: [{ menuNodeId: item.id, qty: 1 }] } });
      expect(refused.status()).toBe(409);
      await page.reload();
      await expect(page.getByRole("main")).toContainText("Servis");
      await page.goto(`/q/${M1_TOKEN}`);
      await expect(page.locator("button.g-card", { hasText: "Mojito" })).toBeVisible();
      await expect(page.locator(".g-price")).toHaveCount(0);
      const admin = await newContextPage(browser);
      try {
        await openAdminShell(admin);
        const menu = await openMenuManager(admin);
        await setPriceDisplay(admin, menu, "SHOW");
        await expect(page.locator(".g-price").first()).toContainText("€", { timeout: 3000 });
      } finally { await admin.context().close(); }
    } finally {
      await Promise.all([kitchen, waiter, cashier].map(p => p.context().close()));
    }
  });
});
