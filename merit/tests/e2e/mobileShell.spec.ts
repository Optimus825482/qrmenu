import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

// One database state for the whole file (reset once).
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

const PHONE = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 800 };

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const tabs = (page: Page) => page.getByRole("tablist", { name: "Ana sekmeler" });
const tab = (page: Page, name: string) => tabs(page).getByRole("tab", { name });
const desktop = (page: Page) => page.getByRole("region", { name: "Masaüstü" });

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function adminId(): Promise<string> {
  return withDb(async (c) => {
    const res = await c.query<{ id: string }>("SELECT id FROM users WHERE username = 'admin'");
    return res.rows[0].id;
  });
}

async function insertNotification(userId: string, title: string, body: string): Promise<string> {
  const id = randomUUID();
  await withDb((c) =>
    c.query(
      `INSERT INTO notifications (id, user_id, type, title, body, created_at, updated_at)
       VALUES ($1, $2, 'test.note', $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, userId, title, body],
    ),
  );
  return id;
}

async function pgNotify(event: Record<string, unknown>): Promise<void> {
  await withDb((c) => c.query("SELECT pg_notify('merit_events', $1)", [JSON.stringify(event)]));
}

async function openMobile(page: Page) {
  await page.setViewportSize(PHONE);
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(tabs(page)).toBeVisible();
}

test("390px: masaüstü yok, alt sekmeler var, Tanımlar sekmesi yok", async ({ page }) => {
  const errors = trackErrors(page);
  await openMobile(page);
  await expect(page.locator(".xp-desktop")).toHaveCount(0);
  await expect(page.locator(".xp-taskbar")).toHaveCount(0);
  for (const name of ["İzleme", "Raporlar", "Bildirimler", "Ayarlar"]) {
    await expect(tab(page, name)).toBeVisible();
  }
  await expect(tab(page, "Tanımlar")).toHaveCount(0);

  // 44 px touch targets.
  for (const name of ["İzleme", "Raporlar", "Bildirimler", "Ayarlar"]) {
    const box = (await tab(page, name).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }

  // İzleme is the first tab and shows the Komuta Merkezi KPIs.
  await expect(tab(page, "İzleme")).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel", { name: "İzleme" });
  await expect(panel.getByTestId("kpi-hotels")).toContainText("3");
  await expect(panel.getByTestId("kpi-online")).toContainText("1");
  expect(errors).toEqual([]);
});

test("Raporlar: boş durum", async ({ page }) => {
  await openMobile(page);
  await tab(page, "Raporlar").click();
  await expect(tab(page, "Raporlar")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Raporlar" })).toContainText(
    "Rapor Merkezi P7'de",
  );
});

test("Ayarlar: anahtar → Tanımlar sekmesi gelir ve yer tutucuyu gösterir; oturum boyunca kalır", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openMobile(page);
  await tab(page, "Ayarlar").click();
  const toggle = page.getByRole("switch", { name: "Tanımlamaları mobilde aç" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(tab(page, "Tanımlar")).toBeVisible();
  expect(await page.evaluate(() => window.sessionStorage.getItem("merit.mobileDefs"))).toBe("1");

  await tab(page, "Tanımlar").click();
  await expect(page.getByRole("tabpanel", { name: "Tanımlar" })).toContainText("Tanımlar P1'de");

  // Same browser tab: sessionStorage survives a reload.
  await page.reload();
  await expect(tab(page, "Tanımlar")).toBeVisible();

  await tab(page, "Ayarlar").click();
  await page.getByRole("switch", { name: "Tanımlamaları mobilde aç" }).click();
  await expect(tab(page, "Tanımlar")).toHaveCount(0);
  expect(await page.evaluate(() => window.sessionStorage.getItem("merit.mobileDefs"))).toBe("0");
  expect(errors).toEqual([]);
});

test("Ayarlar: duvar kağıdı seçilir; oturum kapatma düğmesi var", async ({ page }) => {
  await openMobile(page);
  await tab(page, "Ayarlar").click();
  const panel = page.getByRole("tabpanel", { name: "Ayarlar" });
  await expect(panel.getByRole("button", { name: "Oturumu Kapat" })).toBeVisible();
  // Scoped to the group: the Tema group has a "Royal Gold" option too.
  const wallpapers = panel.getByRole("radiogroup", { name: "Duvar kağıdı" });
  await wallpapers.getByRole("radio", { name: "Royal Gold" }).click();
  await expect(page.locator(".mb-shell")).toHaveAttribute("data-wallpaper", "royal-gold");
  await expect(wallpapers.getByRole("radio", { name: "Royal Gold" })).toBeChecked();
});

test("?mobil=1 ile 1280px'te de mobil; parametresiz 1280px masaüstü; yeniden boyutlandırma", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.setViewportSize(WIDE);
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(desktop(page)).toBeVisible();
  await expect(tabs(page)).toHaveCount(0);

  await page.goto("/admin?mobil=1");
  await expect(tabs(page)).toBeVisible();
  await expect(page.locator(".xp-desktop")).toHaveCount(0);

  await page.goto("/admin");
  await expect(desktop(page)).toBeVisible();
  await expect(tabs(page)).toHaveCount(0);

  // Resize below 760 px swaps the shell without a reload, and back.
  await page.setViewportSize(PHONE);
  await expect(tabs(page)).toBeVisible();
  await expect(page.locator(".xp-desktop")).toHaveCount(0);
  await page.setViewportSize(WIDE);
  await expect(desktop(page)).toBeVisible();
  await expect(tabs(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Bildirimler: satır görünür, canlı eklenir, dokununca okundu olur; Tümünü okundu işaretle", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const id = await adminId();
  const first = await insertNotification(id, "Oda 101 DND", "Rahatsız etmeyin açıldı");
  await openMobile(page);
  await tab(page, "Bildirimler").click();

  const list = page.getByRole("list", { name: "Bildirimler" });
  const row = list.getByRole("button", { name: /Oda 101 DND/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Rahatsız etmeyin açıldı");
  await expect(row).toContainText(/\d{2}:\d{2}/);
  await expect(row.getByTestId("unread-dot")).toBeVisible();
  await expect(tab(page, "Bildirimler")).toContainText("1"); // unread badge

  // Live prepend: a notification created while the tab is open shows up on top. Wait for the SSE
  // connection first, or the pg_notify below can be sent before anyone listens.
  await expect(page.locator('.mb-sse[data-status="open"]')).toBeVisible();
  await insertNotification(id, "Yeni sipariş", "Salon 2");
  await pgNotify({ type: "notification.created", userIds: [id], at: new Date().toISOString() });
  const live = list.getByRole("button", { name: /Yeni sipariş/ });
  await expect(live).toBeVisible({ timeout: 5000 });
  await expect(list.getByRole("listitem").first()).toContainText("Yeni sipariş");

  // Tap marks the row read: the dot disappears and the DB row is read.
  await row.click();
  await expect(row.getByTestId("unread-dot")).toHaveCount(0);
  await expect
    .poll(() =>
      withDb(async (c) => {
        const res = await c.query<{ is_read: boolean }>(
          "SELECT is_read FROM notifications WHERE id = $1",
          [first],
        );
        return res.rows[0].is_read;
      }),
    )
    .toBe(true);

  // Mark everything read.
  await page.getByRole("button", { name: "Tümünü okundu işaretle" }).click();
  await expect(list.getByTestId("unread-dot")).toHaveCount(0);
  await expect
    .poll(() =>
      withDb(async (c) => {
        const res = await c.query<{ n: string }>(
          "SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND is_read = false",
          [id],
        );
        return res.rows[0].n;
      }),
    )
    .toBe("0");
  expect(errors).toEqual([]);
});

test("mobil kabuk masaüstü düzenini bozmaz: simge konumu korunur, yalnız duvar kağıdı değişir", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const waitForPrefsSave = () =>
    page.waitForResponse(
      (r) => r.request().method() === "POST" && "next-action" in r.request().headers(),
    );
  const icon = () => desktop(page).getByRole("button", { name: "Komuta Merkezi", exact: true });
  const iconPos = () => icon().evaluate((el) => {
    const e = el as HTMLElement;
    return { left: parseFloat(e.style.left), top: parseFloat(e.style.top) };
  });

  // 1. Desktop: drag the icon to a known position and wait for the save.
  await page.setViewportSize(WIDE);
  await login(page, "admin");
  await expect(desktop(page)).toBeVisible();
  const box = (await icon().boundingBox())!;
  const saved1 = waitForPrefsSave();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  // A short first move starts the drag (and captures the pointer) before the long one.
  await page.mouse.move(box.x + 45, box.y + 45, { steps: 3 });
  await page.mouse.move(box.x + 600, box.y + 300, { steps: 10 });
  await page.mouse.up();
  await saved1;
  const known = await iconPos();
  expect(known.left).toBeGreaterThan(400);

  // 2. Phone: change the wallpaper, wait for the save.
  await page.setViewportSize(PHONE);
  await page.reload();
  await expect(tabs(page)).toBeVisible();
  await tab(page, "Ayarlar").click();
  await page
    .getByRole("radiogroup", { name: "Duvar kağıdı" })
    .getByRole("radio", { name: "Gümüş" })
    .click();
  await expect
    .poll(() =>
      withDb(async (c) => {
        const res = await c.query<{ wallpaper: string | null }>(
          `SELECT prefs #>> '{shell,wallpaper}' AS wallpaper FROM users WHERE username = 'admin'`,
        );
        return res.rows[0]?.wallpaper ?? null;
      }),
    )
    .toBe("gumus");

  // 3. Desktop again (fresh load, no localStorage copy): same icon position, new wallpaper.
  await page.evaluate(() => window.localStorage.clear());
  await page.setViewportSize(WIDE);
  await page.reload();
  await expect(desktop(page)).toBeVisible();
  await expect(page.locator("[data-wallpaper]")).toHaveAttribute("data-wallpaper", "gumus");
  expect(await iconPos()).toEqual(known);
  expect(errors).toEqual([]);
});
