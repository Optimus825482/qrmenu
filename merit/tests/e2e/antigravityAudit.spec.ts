import { randomInt } from "node:crypto";
import { Client } from "pg";
import { findStartItem } from "./definitionsUi";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";

test.use({ locale: "tr-TR" });
test.beforeAll(() => resetAndSeed({ guestMenu: true }));

test("1) Stüdyo AR/TR önizlemesi ve kapatma ana belgeyi değiştirmemeli", async ({ browser }) => {
  const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  const context = await browser.newContext({
    locale: "tr-TR",
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1600, height: 1000 },
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await context.newPage();
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);

  const windows = page.getByRole("region", { name: /^Menü Tasarım Merkezi/ });
  if ((await windows.count()) === 0) {
    await page.getByRole("button", { name: "başlat" }).click();
    await (await findStartItem(page, "Menü Tasarım Merkezi")).click();
  } else if (!(await windows.first().isVisible())) {
    await page.getByRole("toolbar", { name: "Açık pencereler" }).getByRole("button", { name: /^Menü Tasarım Merkezi/ }).click();
  }
  const win = windows.first();
  await expect(win).toBeVisible();
  const studio = win.getByRole("region", { name: "Menü tasarım merkezi" });
  await expect(studio).toBeVisible();

  const beforeParent = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
  }));

  const frame = studio.frameLocator("iframe.xp-design-frame");
  await frame.locator(".g-lang-btn").click();
  await frame.getByRole("menuitem", { name: /العربية|ar/i }).click();
  await expect(frame.locator(".g-root")).toHaveAttribute("dir", "rtl");
  await expect(frame.locator(":root")).toHaveAttribute("lang", "ar");
  await expect(frame.locator(":root")).toHaveAttribute("dir", "rtl");

  const arParent = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
  }));
  expect(arParent).toEqual(beforeParent);

  // Switch back to TR inside preview
  await frame.locator(".g-lang-btn").click();
  await frame.getByRole("menuitem", { name: /Türkçe/i }).click();
  await expect(frame.locator(".g-root")).toHaveAttribute("dir", "ltr");
  await expect(frame.locator(":root")).toHaveAttribute("lang", "tr");
  await expect(frame.locator(":root")).toHaveAttribute("dir", "ltr");

  const trParent = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
  }));
  expect(trParent).toEqual(beforeParent);

  // Close studio window and confirm parent html.lang/dir stay untouched
  await win.getByRole("button", { name: "Kapat" }).click();
  await expect(win).toHaveCount(0);
  const afterCloseParent = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
  }));
  expect(afterCloseParent).toEqual(beforeParent);

  await context.close();
});

test("2) Normal misafir QR akışı AR/TR dil ve yön senkronunu korumalı", async ({ browser }) => {
  const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  const context = await browser.newContext({
    locale: "tr-TR",
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await context.newPage();

  await page.goto("/q/e2e-guest-m1?lang=ar");
  await expect(page.locator(".g-root")).toHaveAttribute("dir", "rtl");
  await expect(page.locator(":root")).toHaveAttribute("lang", "ar");
  await expect(page.locator(":root")).toHaveAttribute("dir", "rtl");

  await page.goto("/q/e2e-guest-m1?lang=tr");
  await expect(page.locator(".g-root")).toHaveAttribute("dir", "ltr");
  await expect(page.locator(":root")).toHaveAttribute("lang", "tr");
  await expect(page.locator(":root")).toHaveAttribute("dir", "ltr");

  await context.close();
});

// FIXME: standart e2e ortamında outlet değişimi garsonu /giris ekranına düşürüyor (13.11.2026); neden araştırılacak.
test.fixme("3) Garson outlet geçişinde ProfileMenu ile yeni outlet verisi gelmeli", async ({ browser }) => {
  const db = new Client({ connectionString: e2eDatabaseUrl() });
  await db.connect();
  try {
    const havuz = await db.query<{ id: string }>(`SELECT id FROM outlets WHERE name = 'Havuz Bar' LIMIT 1`);
    const beach = await db.query<{ id: string }>(`SELECT id FROM outlets WHERE name = 'Beach Bar' LIMIT 1`);
    const havuzId = havuz.rows[0].id;
    const beachId = beach.rows[0].id;

    let beachArea = await db.query<{ id: string }>(`SELECT id FROM outlet_areas WHERE outlet_id = $1 LIMIT 1`, [beachId]);
    if (!beachArea.rows[0]) {
      beachArea = await db.query<{ id: string }>(
        `INSERT INTO outlet_areas (id, outlet_id, type) VALUES (gen_random_uuid()::text, $1, 'KAPALI') RETURNING id`,
        [beachId],
      );
    }
    let beachTable = await db.query<{ id: string }>(`SELECT id FROM outlet_tables WHERE outlet_id = $1 LIMIT 1`, [beachId]);
    if (!beachTable.rows[0]) {
      beachTable = await db.query<{ id: string }>(
        `INSERT INTO outlet_tables (id, outlet_id, area_id, label, updated_at) VALUES (gen_random_uuid()::text, $1, $2, 'B1', now()) RETURNING id`,
        [beachId, beachArea.rows[0].id],
      );
    }
    const havuzTable = await db.query<{ id: string }>(`SELECT id FROM outlet_tables WHERE outlet_id = $1 AND label = 'M1' LIMIT 1`, [havuzId]);

    await db.query(`DELETE FROM waiter_calls WHERE note IN ('E2E-HAVUZ-CALL', 'E2E-BEACH-CALL')`);
    await db.query(
      `INSERT INTO waiter_calls (id, outlet_id, table_id, type, note, status, updated_at) VALUES
       (gen_random_uuid()::text, $1, $2, 'GARSON', 'E2E-HAVUZ-CALL', 'ACIK', now()),
       (gen_random_uuid()::text, $3, $4, 'HESAP', 'E2E-BEACH-CALL', 'ACIK', now())`,
      [havuzId, havuzTable.rows[0].id, beachId, beachTable.rows[0].id],
    );
  } finally {
    await db.end();
  }

  const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
  const context = await browser.newContext({
    locale: "tr-TR",
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await context.newPage();
  await login(page, "garson.havuz");
  await page.getByRole("button", { name: /Havuz Bar/ }).click();
  await expect(page).toHaveURL(/\/garson/);

  await expect(page.getByText("M1 · GARSON")).toBeVisible();
  await page.getByRole("button", { name: /^Profil menüsü/ }).click();
  await page.getByRole("menuitem", { name: /Beach Bar/ }).click();

  await expect(page.getByText("B1 · HESAP")).toBeVisible();
  await expect(page.getByText("M1 · GARSON")).toHaveCount(0);

  await context.close();
});
