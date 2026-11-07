import type { Page } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { newContextPage } from "./menuUi";

async function fixture<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: e2eDatabaseUrl() });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

async function sendWater(page: Page) {
  await page.getByRole("tab", { name: "İçecek" }).click();
  const add = page.getByRole("button", { name: "زيادة Su" });
  await add.click();
  await add.click();
  await page.getByLabel("ملاحظات إضافية أو طلبات خاصة").fill("iki bardak rica ederim");
  await page.getByRole("button", { name: "إرسال طلب MYBAR" }).click();
}

test("Arapça misafir talebi kat sorumlusu, havuz ve canlı misafir durumuna ulaşır", async ({ page: guest, browser }) => {
  test.setTimeout(180_000);
  process.env.SEED_MINIBAR = "1";
  try {
    resetAndSeed();
  } finally {
    delete process.env.SEED_MINIBAR;
  }

  const rooms = await fixture(async (db) => {
    const { rows } = await db.query<{ number: string; qr_token: string }>(
      `SELECT r.number, r.qr_token FROM rooms r JOIN hotels h ON h.id = r.hotel_id
       WHERE h.code = 'ROYAL' AND r.number IN ('101', '104')`,
    );
    await db.query(
      `UPDATE rooms SET is_active = false
       WHERE number = '104' AND hotel_id = (SELECT id FROM hotels WHERE code = 'ROYAL')`,
    );
    return new Map(rows.map((room) => [room.number, room.qr_token]));
  });
  const roomUrl = (number: string) => `/q/${rooms.get(number)}?lang=ar`;
  const staff = await newContextPage(browser);
  const duplicate = await newContextPage(browser, "ar");
  try {
    await login(staff, "kat.mr");
    await expect(staff).toHaveURL(/\/kat$/, { timeout: 30_000 });
    await staff.goto("/kat/mybar");
    await expect(staff.getByRole("heading", { name: "MyBar Talepleri" })).toBeVisible();

    await guest.goto(roomUrl("101"));
    await duplicate.goto(roomUrl("101"));
    await expect(guest.locator("html")).toHaveAttribute("dir", "rtl");
    await sendWater(guest);
    await expect(guest.getByText("تم استلام طلبك بنجاح!")).toBeVisible();

    const acknowledgement = staff.getByRole("alertdialog");
    await expect(acknowledgement).toContainText("Oda 101", { timeout: 10_000 });
    await expect(acknowledgement).toContainText("Su");
    await acknowledgement.getByRole("button", { name: "Gördüm" }).click();
    await expect(guest.locator(".mb-status")).toHaveAttribute("data-status", "GORULDU", { timeout: 10_000 });

    const row = staff.getByTestId("mybar-row").filter({ hasText: "101" });
    await row.getByRole("button", { expanded: false }).click();
    await staff.getByRole("button", { name: "Tümünü Karşıla" }).click();
    await staff.getByRole("button", { name: "Talebi Kapat" }).click();
    await staff.getByRole("dialog").getByRole("button", { name: "Kapat", exact: true }).click();
    await expect(row).toHaveAttribute("data-status", "TAMAMLANDI", { timeout: 10_000 });
    await expect(guest.locator(".mb-status")).toHaveAttribute("data-status", "KARSILANDI", { timeout: 10_000 });

    const state = await fixture(async (db) => {
      const { rows } = await db.query<{ remaining: number; transactions: number; pushed: number }>(
        `SELECT s.remaining_qty AS remaining,
          (SELECT count(*)::int FROM minibar_transactions WHERE type = 'MYBAR_KARSILAMA') AS transactions,
          (SELECT count(*)::int FROM notifications WHERE type = 'mybar.created' AND pushed_at IS NOT NULL) AS pushed
         FROM hotel_stocks s JOIN products p ON p.id = s.product_id JOIN hotels h ON h.id = s.hotel_id
         WHERE p.name = 'Su' AND h.code = 'ROYAL'`,
      );
      return rows[0];
    });
    expect(state).toMatchObject({ remaining: 98, transactions: 1, pushed: 0 });

    const conflict = duplicate.waitForResponse((response) =>
      response.request().method() === "POST" && response.url().endsWith("/mybar"),
    );
    await sendWater(duplicate);
    expect((await conflict).status()).toBe(409);
    await expect(duplicate.getByText("تم إرسال طلب من هذه الغرفة اليوم. يسمح بطلب واحد يومياً.")).toBeVisible();

    await guest.goto(roomUrl("104"));
    await expect(guest.getByRole("button", { name: "إرسال طلب MYBAR" })).toHaveCount(0);
  } finally {
    await staff.context().close();
    await duplicate.context().close();
  }
});
