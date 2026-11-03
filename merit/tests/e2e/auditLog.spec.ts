import { randomUUID } from "node:crypto";
import { findStartItem } from "./definitionsUi";
import { Client } from "pg";
import type { Page } from "@playwright/test";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function adminId(): Promise<string> {
  return withDb(async (client) => {
    const res = await client.query<{ id: string }>("SELECT id FROM users WHERE username = 'admin'");
    return res.rows[0].id;
  });
}

test("Denetim Günlüğü SETTING_UPDATE satırında before/after; zil rozeti 1, tık sonrası 0", async ({ page }) => {
  const errors = trackErrors(page);
  const userId = await adminId();
  const noteId = randomUUID();
  const auditId = randomUUID();
  await withDb(async (client) => {
    const hotel = await client.query<{ id: string }>("SELECT id FROM hotels WHERE code = 'ROYAL'");
    await client.query(
      `INSERT INTO notifications (id, user_id, type, title, body, created_at, updated_at)
       VALUES ($1, $2, 'test.note', 'Deneme bildirimi', 'Zil denemesi', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [noteId, userId],
    );
    await client.query(
      `INSERT INTO audit_logs (id, user_id, hotel_id, action, entity, entity_id, before, after, created_at)
       VALUES ($1, $2, $3, 'SETTING_UPDATE', 'Setting', 'eski-anahtar', $4::jsonb, $5::jsonb, CURRENT_TIMESTAMP)`,
      [
        auditId,
        userId,
        hotel.rows[0].id,
        JSON.stringify({ n: "eski-deger" }),
        JSON.stringify({ n: "yeni-deger" }),
      ],
    );
  });

  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("bell-badge")).toHaveText("1");
  await page.getByRole("button", { name: "Bildirimler, 1 okunmamış" }).click();
  const panel = page.getByRole("dialog", { name: "Bildirimler" });
  await panel.getByRole("button", { name: /Deneme bildirimi/ }).click();
  await expect(page.getByTestId("bell-badge")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "başlat" }).click();
  await (await findStartItem(page, "Denetim Günlüğü")).click();
  const win = page.getByRole("region", { name: "Denetim Günlüğü", exact: true });
  await expect(win).toBeVisible();
  await win.getByRole("textbox", { name: "İşlem" }).fill("SETTING_UPDATE");
  const row = win.getByRole("row", { name: /eski-anahtar/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(win.getByLabel("Önce", { exact: true })).toContainText("eski-deger");
  await expect(win.getByLabel("Sonra", { exact: true })).toContainText("yeni-deger");
  expect(errors).toEqual([]);
});
