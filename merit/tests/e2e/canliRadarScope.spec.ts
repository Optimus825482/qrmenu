import { Client } from "pg";
import type { Page } from "@playwright/test";
import { formatInTimeZone } from "date-fns-tz";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { newContextPage } from "./menuUi";
import { sendGuestOrder } from "./opsUi";
import { RADAR_VIEWPORTS, openRadar, radarTab, radarToolbar, tableCard } from "./radarUi";

test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

test.beforeAll(() => {
  process.env.SEED_MINIBAR = "1";
  try {
    resetAndSeed({ guestMenu: true });
  } finally {
    delete process.env.SEED_MINIBAR;
  }
});

const MR_NAME = "Merit Royal";

async function openDesktop(page: Page, user: string): Promise<void> {
  await login(page, user);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("region", { name: "Masaüstü" })).toBeVisible();
}

async function queryDb<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    const res = await client.query<T>(sql, params);
    return res.rows;
  } finally {
    await client.end();
  }
}

test("mudur.mr kapsamı: araç çubuğunda yalnız ROYAL; PREMIUM replay 403 + YETKISIZ_DENEME; ROYAL replay 200 NDJSON", async ({
  page,
}) => {
  await page.setViewportSize(RADAR_VIEWPORTS[0]);
  await openDesktop(page, "mudur.mr");
  const win = await openRadar(page);

  const toolbar = radarToolbar(win);
  await expect(toolbar).toContainText(MR_NAME);
  await expect(toolbar.getByRole("combobox", { name: "Otel" })).toHaveCount(0);
  await expect(toolbar).not.toContainText("Tüm kompleks");
  await expect(toolbar).not.toContainText(/Diamond|Premium/);

  const hotels = await queryDb<{ id: string; code: string }>(
    "SELECT id, code FROM hotels WHERE code IN ('ROYAL', 'PREMIUM')",
  );
  const royalId = hotels.find((h) => h.code === "ROYAL")!.id;
  const premiumId = hotels.find((h) => h.code === "PREMIUM")!.id;
  const today = formatInTimeZone(new Date(), "Europe/Nicosia", "yyyy-MM-dd");

  const beforeAudit = await queryDb<{ cnt: string }>(
    "SELECT count(*)::text AS cnt FROM audit_logs WHERE action = 'YETKISIZ_DENEME'",
  );

  const forbiddenRes = await page.request.get(
    `/api/radar/replay?hotelId=${encodeURIComponent(premiumId)}&day=${today}&from=00:00&to=24:00`,
  );
  expect(forbiddenRes.status()).toBe(403);

  const afterAudit = await queryDb<{ cnt: string }>(
    "SELECT count(*)::text AS cnt FROM audit_logs WHERE action = 'YETKISIZ_DENEME'",
  );
  expect(Number(afterAudit[0].cnt)).toBeGreaterThan(Number(beforeAudit[0].cnt));

  const okRes = await page.request.get(
    `/api/radar/replay?hotelId=${encodeURIComponent(royalId)}&day=${today}&from=00:00&to=24:00`,
  );
  expect(okRes.status()).toBe(200);
  expect(okRes.headers()["content-type"]).toContain("application/x-ndjson");
  const body = await okRes.text();
  const lines = body
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { kind: string });
  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(lines[0].kind).toBe("snapshot");
  expect(lines[lines.length - 1].kind).toBe("end");
});

test("kat.mr: /radar 'Bu ekran sana atanmadı' ve replay 403", async ({ browser }) => {
  const katPage = await newContextPage(browser);
  await login(katPage, "kat.mr");
  await katPage.waitForURL((url) => !url.pathname.startsWith("/giris"));
  await katPage.goto("/radar");
  await expect(katPage.getByText(/Bu ekran sana atanmadı/i)).toBeVisible();

  const hotels = await queryDb<{ id: string }>("SELECT id FROM hotels WHERE code = 'ROYAL'");
  const royalId = hotels[0].id;
  const today = formatInTimeZone(new Date(), "Europe/Nicosia", "yyyy-MM-dd");
  const res = await katPage.request.get(
    `/api/radar/replay?hotelId=${encodeURIComponent(royalId)}&day=${today}&from=00:00&to=24:00`,
  );
  expect(res.status()).toBe(403);
});

test("reducedMotion: reduce altında sipariş olayından sonra masa kartında pulse-once sınıfı uygulanmaz", async ({
  page,
  browser,
}) => {
  await page.setViewportSize(RADAR_VIEWPORTS[0]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDesktop(page, "admin");
  const win = await openRadar(page);
  await radarToolbar(win).getByRole("combobox", { name: "Otel" }).selectOption({ label: MR_NAME });
  await radarTab(win, "Masa").click();
  await win.getByRole("combobox", { name: "Outlet" }).selectOption({ label: "Havuz Bar" });

  const m1 = tableCard(win, "M1");
  await expect(m1).toBeVisible();

  const guest = await newContextPage(browser);
  await sendGuestOrder(guest);
  await expect(m1).toContainText("Onay bekliyor", { timeout: 2_000 });
  await expect(m1).not.toHaveClass(/pulse-once/);
});

test("Komuta Merkezi: admin için 'Canlı Radar\\'ı aç' pencereyi açar; CR-RAD yetkisi olmayan rolde düğme görünmez", async ({
  page,
  browser,
}) => {
  await page.setViewportSize(RADAR_VIEWPORTS[0]);
  await openDesktop(page, "admin");
  const desktop = page.getByRole("region", { name: "Masaüstü" });
  await desktop.getByRole("button", { name: "Komuta Merkezi", exact: true }).dblclick();
  const ccWin = page.getByRole("region", { name: "Komuta Merkezi", exact: true });
  await expect(ccWin).toBeVisible();

  const openBtn = ccWin.getByRole("button", { name: "Canlı Radar'ı aç" });
  await expect(openBtn).toBeVisible();
  await openBtn.click();

  const radarWin = page.getByRole("region", { name: /^Canlı Radar · / }).first();
  await expect(radarWin).toBeVisible();

  // Temporarily strip CR-RAD view permission from R-OTM to verify a shell user without CR-RAD does not see the button
  await queryDb(
    `UPDATE role_screen_permissions
     SET can_view = false
     WHERE role_id = (SELECT id FROM roles WHERE code = 'R-OTM')
       AND screen_id = (SELECT id FROM app_screens WHERE code = 'CR-RAD')`,
  );
  try {
    const mudurPage = await newContextPage(browser);
    await mudurPage.setViewportSize(RADAR_VIEWPORTS[0]);
    await openDesktop(mudurPage, "mudur.mr");
    const mDesktop = mudurPage.getByRole("region", { name: "Masaüstü" });
    await mDesktop.getByRole("button", { name: "Komuta Merkezi", exact: true }).dblclick();
    const mCcWin = mudurPage.getByRole("region", { name: "Komuta Merkezi", exact: true });
    await expect(mCcWin).toBeVisible();
    await expect(mCcWin.getByRole("button", { name: "Canlı Radar'ı aç" })).toHaveCount(0);
  } finally {
    await queryDb(
      `UPDATE role_screen_permissions
       SET can_view = true
       WHERE role_id = (SELECT id FROM roles WHERE code = 'R-OTM')
         AND screen_id = (SELECT id FROM app_screens WHERE code = 'CR-RAD')`,
    );
  }
});
