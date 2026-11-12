import { randomUUID } from "node:crypto";
import { findStartItem } from "./definitionsUi";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect as baseExpect, login, resetAndSeed, test } from "./fixtures";

// ROYAL rooms 101-104 with QR tokens and the Su / Kola products come from SEED_MINIBAR.
const expect = baseExpect.configure({ timeout: 20_000 });
test.use({ viewport: { width: 1366, height: 768 } });

test.beforeAll(() => {
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

const win = (page: Page) => page.getByRole("region", { name: /^MyBar Talepleri/ });

async function openDepotMybar(page: Page): Promise<void> {
  // Wide window: the left menu lists every screen, there is no "Daha" sheet.
  await page.getByRole("navigation", { name: "Ana gezinme" }).getByRole("link", { name: "MyBar talepleri", exact: true }).click();
  await expect(page).toHaveURL(/\/depo\/mybar$/);
}

async function openFromStart(page: Page): Promise<void> {
  await page.getByRole("button", { name: "başlat" }).press("Enter");
  await (await findStartItem(page, "MyBar Talepleri")).click();
  await expect(win(page)).toBeVisible();
  // The window asks for a hotel first (needsHotel).
  const royal = win(page).getByRole("button").filter({ hasText: /^Merit Royal$/ });
  if (await royal.isVisible().catch(() => false)) await royal.click();
}

async function guestRequest(page: Page, room: string): Promise<void> {
  const { token, productId } = await withDb(async (db) => {
    const t = await db.query<{ qr_token: string }>(
      `SELECT r.qr_token FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE r.number = $1 AND h.code = 'ROYAL'`,
      [room],
    );
    const p = await db.query<{ id: string }>(`SELECT id FROM products WHERE name = 'Su'`);
    return { token: t.rows[0].qr_token, productId: p.rows[0].id };
  });
  const res = await page.request.post(`/api/q/${token}/mybar`, {
    headers: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.9` },
    data: { idempotencyKey: randomUUID(), locale: "tr", note: `Oda ${room} icin su`, items: [{ productId, qty: 2 }] },
  });
  expect(res.status(), await res.text()).toBe(200);
}

test("sys: Başlat menüsünden açar, durumla süzer, nedenle iptal eder (denetim satırı), CSV indirir, yeni talep canlı düşer; axe serious 0", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await guestRequest(page, "101");
  await guestRequest(page, "102");
  await guestRequest(page, "103");
  // 103 is already closed: the status filter then has something to separate.
  await withDb((db) =>
    db.query(
      `UPDATE mybar_requests SET status = 'TAMAMLANDI', completed_at = now()
       WHERE room_id = (SELECT id FROM rooms WHERE number = '103' LIMIT 1)`,
    ),
  );

  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await openFromStart(page);

  await expect(win(page)).toBeVisible();
  const grid = win(page).getByRole("grid");
  await expect(grid.getByRole("row")).toHaveCount(4); // header + 3
  await expect(win(page).getByLabel("Özet")).toContainText("Bekleyen");
  await expect(grid).toContainText("101");
  await expect(grid).toContainText("Tamamlandı");

  const { violations } = await new AxeBuilder({ page }).include('[role="region"]').withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);

  // Status filter.
  await win(page).getByLabel("Durum", { exact: true }).selectOption("TAMAMLANDI");
  await expect(grid.getByRole("row")).toHaveCount(2);
  await expect(grid).toContainText("103");
  await win(page).getByLabel("Durum", { exact: true }).selectOption("BEKLEMEDE");
  await expect(grid.getByRole("row")).toHaveCount(3);

  // Cancel 101 with a reason.
  await grid.getByRole("row").filter({ hasText: "101" }).click();
  await win(page).getByRole("button", { name: "Talebi iptal et" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Diğer sebep").fill("kısa not");
  await expect(dialog.getByRole("button", { name: "İptal et" })).toBeDisabled();
  await dialog.getByLabel("Diğer sebep").fill("kısa açıklama");
  await dialog.getByRole("button", { name: "İptal et" }).click();
  await expect(dialog.getByText(/en az 3 kelimelik geçerli bir açıklama/)).toBeVisible();
  await dialog.getByLabel("Diğer sebep").fill("misafir odadan ayrıldı");
  await dialog.getByRole("button", { name: "İptal et" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await win(page).getByLabel("Durum", { exact: true }).selectOption("IPTAL");
  await expect(grid.getByRole("row")).toHaveCount(2);
  await expect(grid).toContainText("101");
  const cancelAudit = await withDb((db) =>
    db.query(`SELECT after FROM audit_logs WHERE action = 'MYBAR_CANCEL'`),
  );
  expect(cancelAudit.rows).toHaveLength(1);
  expect(cancelAudit.rows[0].after).toMatchObject({ cancelNote: "misafir odadan ayrıldı" });

  // Export the filtered list.
  await win(page).getByLabel("Durum", { exact: true }).selectOption("");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    win(page).getByRole("button", { name: "CSV'ye aktar" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^mybar-talepleri-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = readFileSync((await download.path())!, "utf8");
  expect(text.startsWith("﻿Oda;Kat;Durum;Dil;")).toBe(true);
  expect(text.trim().split("\n")).toHaveLength(4);
  await expect
    .poll(() => withDb(async (db) => (await db.query(`SELECT 1 FROM audit_logs WHERE action = 'MYBAR_EXPORT'`)).rowCount))
    .toBe(1);

  // Live: a new guest request drops into the open window without a reload (SSE mybar.created).
  await expect(grid.getByRole("row")).toHaveCount(4);
  await guestRequest(page, "104");
  await expect(grid.getByRole("row")).toHaveCount(5, { timeout: 10_000 });
  await expect(win(page).getByLabel("Özet")).toContainText("Görülmemiş");
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test("depo ve housekeeping MyBar'a personel menüsünden ulaşır; salt okunur liste canlı yenilenir", async ({ page, browser }) => {
  await guestRequest(page, "201");
  await withDb((db) =>
    db.query("UPDATE users SET role_id = (SELECT id FROM roles WHERE code = 'R-HKS') WHERE username = 'kat2.mr'"),
  );
  await login(page, "depo.mr");
  await expect(page).toHaveURL(/\/depo\/stok$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/yetkisiz/);
  await page.goto("/depo/stok");
  await openDepotMybar(page);
  const depot = page.getByRole("region", { name: "MyBar Talepleri" });
  await expect(depot.getByRole("button", { name: "CSV'ye aktar" })).toBeVisible();

  const observer = await browser.newPage();
  try {
    await login(observer, "kat2.mr");
    await expect(observer).toHaveURL(/\/depo\/raporlar$/);
    await Promise.all([
      observer.waitForResponse((response) => new URL(response.url()).pathname === "/api/sse" && response.ok()),
      openDepotMybar(observer),
    ]);
    const readonly = observer.getByRole("region", { name: "MyBar Talepleri" });
    await readonly.getByLabel("Durum", { exact: true }).selectOption("BEKLEMEDE");
    const readonlyRow = readonly.getByRole("row").filter({ hasText: "201" });
    await readonlyRow.click();
    await expect(readonly.getByLabel("Talep ayrıntısı")).toBeVisible();
    await expect(readonly.getByRole("button", { name: "Talebi iptal et" })).toHaveCount(0);
    await expect(readonly.getByRole("button", { name: "CSV'ye aktar" })).toHaveCount(0);

    await depot.getByRole("row").filter({ hasText: "201" }).click();
    await depot.getByRole("button", { name: "Talebi iptal et" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Misafir odadan ayrıldı" }).click();
    await dialog.getByRole("button", { name: "İptal et" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(readonlyRow).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await observer.close();
  }
});

test("MyBar depo ekranı oturum ve MB-PERS görüntüleme hakkı ister", async ({ page }) => {
  await page.goto("/depo/mybar");
  await expect(page).toHaveURL(/\/giris\?next=%2Fdepo%2Fmybar/);
  await login(page, "garson.havuz");
  await page.getByRole("button", { name: /Havuz Bar/ }).click();
  await expect(page).toHaveURL(/\/garson$/);
  await page.goto("/depo/mybar");
  await expect(page).toHaveURL(/\/yetkisiz\?ekran=MB-PERS/);
});
