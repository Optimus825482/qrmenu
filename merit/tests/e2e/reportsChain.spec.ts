import { Client } from "pg";
import type { Locator, Page } from "@playwright/test";
import { findStartItem } from "./definitionsUi";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";

// P7 acceptance (T12): Rapor Merkezi from sign-in to the Excel/PDF download, role-scoped report access and the
// Komuta Merkezi KPI chips. One seeded database for the whole file (ROYAL minibar world + three kat.mr transactions).
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  process.env.SEED_MINIBAR = "1";
  process.env.SEED_REPORTS = "1";
  try {
    resetAndSeed();
  } finally {
    delete process.env.SEED_MINIBAR;
    delete process.env.SEED_REPORTS;
  }
});

async function sql<T = Record<string, unknown>>(text: string): Promise<T[]> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return (await client.query(text)).rows as T[];
  } finally {
    await client.end();
  }
}

/** A 31-day window ending tomorrow (report range limit is 366 days). */
const RANGE = (() => {
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  return { from: day(-30), to: day(1) };
})();

const hotelIdOf = async (code: string) => (await sql<{ id: string }>(`SELECT id FROM hotels WHERE code = '${code}'`))[0].id;

const desktop = (page: Page) => page.getByRole("region", { name: "Masaüstü" });
const appWindow = (page: Page, name: string): Locator => page.getByRole("region", { name, exact: true });

async function openFromStart(page: Page, name: string) {
  await page.getByRole("button", { name: "başlat" }).click();
  await (await findStartItem(page, name)).click();
}

/** Opens Rapor Merkezi (core.rapor) and picks a report from the catalogue. */
async function openReport(page: Page, title: string): Promise<Locator> {
  await openFromStart(page, "Rapor Merkezi");
  const win = appWindow(page, "Rapor Merkezi");
  await expect(win).toBeVisible();
  await win.getByRole("navigation", { name: "Raporlar" }).getByRole("button", { name: title, exact: true }).click();
  await expect(win.getByRole("heading", { name: title })).toBeVisible();
  return win;
}

test("Rapor Merkezi: müdür tüketim raporunu 'Bu ay' ile çalıştırır; grid, özet ve toplamlar; Excel ve PDF iner", async ({ page }) => {
  await login(page, "mudur.mr");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(desktop(page)).toBeVisible();

  const win = await openReport(page, "Minibar Tüketim Raporu");
  await expect(win.getByRole("group", { name: "Tarih ön ayarları" })).toBeVisible();
  await win.getByRole("group", { name: "Tarih ön ayarları" }).getByRole("button", { name: "Bu ay", exact: true }).click();
  await expect(win.getByRole("button", { name: "Bu ay", exact: true })).toHaveAttribute("aria-pressed", "true");
  await win.getByRole("button", { name: "Raporu Göster" }).click();

  // Seed: Su 2+3 = 5 and Kola 1 consumed in ROYAL rooms 101/102.
  const summary = win.getByRole("term").filter({ hasText: "Toplam tüketim" });
  await expect(summary).toBeVisible();
  await expect(win.locator(".rc-summary").getByText("Toplam tüketim").locator("xpath=following-sibling::dd")).toHaveText("6");
  const grid = win.locator(".rc-grid");
  await expect(grid.getByRole("row").filter({ hasText: "Su" }).first()).toBeVisible();
  await expect(grid.getByRole("row").filter({ hasText: "Kola" }).first()).toBeVisible();
  await expect(win.getByTestId("rc-totals")).toContainText("Toplam");
  await expect(win.getByRole("status").filter({ hasText: /\d+ satır · üretim/ })).toBeVisible();

  const xlsx = page.waitForEvent("download");
  await win.getByRole("button", { name: "Excel", exact: true }).click();
  expect((await xlsx).suggestedFilename()).toMatch(/\.xlsx$/);

  const pdf = page.waitForEvent("download");
  await win.getByRole("button", { name: "PDF", exact: true }).click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
  await expect(win.getByTestId("rc-download-error")).toHaveCount(0);
});

test("Rapor Merkezi: müdürün kataloğu yalnız yetkili raporları içerir", async ({ page }) => {
  await login(page, "mudur.mr");
  await expect(desktop(page)).toBeVisible();
  await openFromStart(page, "Rapor Merkezi");
  const catalogue = appWindow(page, "Rapor Merkezi").getByRole("navigation", { name: "Raporlar" });
  await expect(catalogue.getByRole("button", { name: "Minibar Tüketim Raporu", exact: true })).toBeVisible();
  await expect(catalogue.getByRole("button", { name: "Gün Sonu Raporu", exact: true })).toBeVisible();
  // R-OTM has no room-service report right (RO-SLA), the F&B manager does.
  await expect(catalogue.getByRole("button", { name: "Oda Servisi SLA", exact: true })).toHaveCount(0);
});

test("Kat sorumlusu (yalnız V): self-servis gün sonu raporunu indirir; yetki gerektiren raporlar 403", async ({ page }) => {
  await login(page, "kat.mr");
  await page.waitForURL((url) => !url.pathname.startsWith("/giris"));
  const royal = await hotelIdOf("ROYAL");
  const base = (key: string, format: string) =>
    `/api/reports/${key}/export?format=${format}&hotelIds=${royal}&from=${RANGE.from}&to=${RANGE.to}`;

  const own = await page.request.get(base("gun-sonu", "xlsx"));
  expect(own.status()).toBe(200);
  expect(own.headers()["content-disposition"]).toMatch(/\.xlsx/);
  expect((await own.body()).length).toBeGreaterThan(500);

  for (const key of ["tuketim", "zimmet-durum", "gorev-performans"]) {
    const denied = await page.request.get(base(key, "xlsx"));
    expect(denied.status(), key).toBe(403);
  }
});

test("Outlet oturumu (şef garson): yalnız outlet kapsamlı raporlar; minibar raporu 403", async ({ page }) => {
  await login(page, "sef.havuz");
  await page.getByRole("button", { name: /Havuz Bar/ }).click(); // outlet picker: the session outlet
  await page.waitForURL((url) => !url.pathname.startsWith("/giris"));
  const royal = await hotelIdOf("ROYAL");
  const pool = (await sql<{ id: string }>(`SELECT id FROM outlets WHERE name = 'Havuz Bar'`))[0].id;
  const url = (key: string) =>
    `/api/reports/${key}/export?format=xlsx&hotelIds=${royal}&from=${RANGE.from}&to=${RANGE.to}&outletId=${pool}`;

  const mine = await page.request.get(url("siparis-ozet"));
  expect(mine.status()).toBe(200);
  expect(mine.headers()["content-disposition"]).toMatch(/\.xlsx/);

  for (const key of ["tuketim", "gun-sonu", "merkez-ozet"]) {
    const denied = await page.request.get(url(key));
    expect(denied.status(), key).toBe(403);
  }
});

test("Komuta Merkezi: KPI çipleri çizilir; kapsam seçici sistem yöneticisinde var, otel müdüründe yok", async ({ browser }) => {
  const admin = await browser.newPage();
  await login(admin, "admin");
  await expect(admin).toHaveURL(/\/admin$/);
  await desktop(admin).getByRole("button", { name: "Komuta Merkezi", exact: true }).dblclick();
  const adminWin = appWindow(admin, "Komuta Merkezi");
  await expect(adminWin.getByTestId("kpi-chips")).toBeVisible();
  await expect(adminWin.getByTestId("kpi-scope")).toBeVisible();
  await expect(adminWin.getByTestId("kpi-scope").locator("option")).not.toHaveCount(0);
  await admin.close();

  const manager = await browser.newPage();
  await login(manager, "mudur.mr");
  await expect(manager).toHaveURL(/\/admin$/);
  const managerWin = appWindow(manager, "Komuta Merkezi");
  // The manager's landing screen may already have opened it.
  if (!(await managerWin.isVisible())) await openFromStart(manager, "Komuta Merkezi");
  await expect(managerWin.getByTestId("kpi-chips")).toBeVisible();
  await expect(managerWin.getByTestId("kpi-scope")).toHaveCount(0);
  await manager.close();
});
