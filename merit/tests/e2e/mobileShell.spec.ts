import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { Page } from "@playwright/test";
import { e2eDatabaseUrl } from "./e2eDb";
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

// Android shell: the home screen's app icons, the three-button bar and a running app's screen.
const launcher = (page: Page) => page.getByRole("navigation", { name: "Uygulamalar" });
const appIcon = (page: Page, name: string) => launcher(page).getByRole("button", { name });
const sysNav = (page: Page) => page.getByRole("navigation", { name: "Sistem gezinmesi" });
const appScreen = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

/** Home button, then the app's launcher icon. */
async function openApp(page: Page, name: string) {
  await sysNav(page).getByRole("button", { name: "Ana ekran" }).click();
  await appIcon(page, name).click();
  await expect(appScreen(page, name)).toBeVisible();
}
const desktop = (page: Page) => page.getByRole("region", { name: "Masaüstü" });

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
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
  await expect(launcher(page)).toBeVisible();
}

test("390px: masaüstü yok, Android ana ekranı var, Tanımlar uygulaması yok @kabul-10", async ({ page }) => {
  const errors = trackErrors(page);
  await openMobile(page);
  await expect(page.locator(".xp-desktop")).toHaveCount(0);
  await expect(page.locator(".xp-taskbar")).toHaveCount(0);
  await expect(page.locator(".mb-shell")).toHaveAttribute("data-screen", "home");
  for (const name of ["İzleme", "Raporlar", "Bildirimler", "Ayarlar"]) {
    await expect(appIcon(page, name)).toBeVisible();
  }
  await expect(appIcon(page, "Tanımlar")).toHaveCount(0);

  // 44 px touch targets: launcher icons and the three system buttons.
  const targets = [
    ...["İzleme", "Raporlar", "Bildirimler", "Ayarlar"].map((name) => appIcon(page, name)),
    ...["Geri", "Ana ekran", "Son uygulamalar"].map((name) => sysNav(page).getByRole("button", { name })),
  ];
  for (const target of targets) {
    const box = (await target.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }

  // The home-screen widget shows the Komuta Merkezi numbers and opens İzleme.
  await expect(page.getByTestId("home-kpi-hotels")).toContainText("3");
  await page.getByRole("button", { name: /Komuta Merkezi/ }).click();
  const panel = appScreen(page, "İzleme");
  await expect(page.locator(".mb-shell")).toHaveAttribute("data-screen", "app");
  await expect(panel.getByTestId("kpi-hotels")).toContainText("3");
  await expect(panel.getByTestId("kpi-online")).toContainText("1");

  // Back returns to the home screen; the app stays in recents and can be closed from there.
  await sysNav(page).getByRole("button", { name: "Geri" }).click();
  await expect(launcher(page)).toBeVisible();
  await sysNav(page).getByRole("button", { name: "Son uygulamalar" }).click();
  const overview = page.getByRole("dialog", { name: "Son uygulamalar" });
  await expect(overview.getByRole("button", { name: "İzleme uygulamasına dön" })).toBeVisible();
  await overview.getByRole("button", { name: "Tümünü temizle" }).click();
  await expect(overview).toHaveCount(0);

  // Desktop apps run on the phone too: Canlı Radar from the home screen, the rest from the drawer.
  await appIcon(page, "Canlı Radar").click();
  await expect(appScreen(page, "Canlı Radar")).toContainText("Tüm kompleks");
  await sysNav(page).getByRole("button", { name: "Ana ekran" }).click();
  await appIcon(page, "Tüm uygulamalar").click();
  const drawer = page.getByRole("dialog", { name: "Tüm uygulamalar" });
  await drawer.getByRole("searchbox", { name: "Uygulama ara" }).fill("denetim g");
  await expect(drawer.getByRole("button")).toHaveCount(1);
  await drawer.getByRole("button", { name: "Denetim Günlüğü" }).click();
  await expect(appScreen(page, "Denetim Günlüğü")).toBeVisible();
  await sysNav(page).getByRole("button", { name: "Ana ekran" }).click();

  // The browser's back button closes an open app instead of leaving /admin.
  await appIcon(page, "Ayarlar").click();
  await expect(appScreen(page, "Ayarlar")).toBeVisible();
  await page.goBack();
  await expect(launcher(page)).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
  expect(errors).toEqual([]);
});

test("Raporlar: Rapor Merkezi kataloğu tek sütunda listelenir; rapor seçilince filtreler açılır", async ({ page }) => {
  await openMobile(page);
  await openApp(page, "Raporlar");
  const panel = appScreen(page, "Raporlar");
  const catalogue = panel.getByRole("navigation", { name: "Raporlar" });
  await expect(catalogue.getByRole("button", { name: /Minibar Tüketim Raporu/ })).toBeVisible();
  await catalogue.getByRole("button", { name: /Minibar Tüketim Raporu/ }).click();
  await expect(panel.getByRole("form", { name: "Rapor filtreleri" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Raporu Göster" })).toBeVisible();
});

test("Ayarlar: anahtar → Tanımlar uygulaması gelir ve Tanımlamalar ekranını açar; oturum boyunca kalır", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openMobile(page);
  await openApp(page, "Ayarlar");
  const toggle = page.getByRole("switch", { name: "Tanımlamaları mobilde aç" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  expect(await page.evaluate(() => window.sessionStorage.getItem("merit.mobileDefs"))).toBe("1");

  await openApp(page, "Tanımlar");
  // The real Tanımlamalar screen of the desktop; it asks for the hotel first.
  await expect(appScreen(page, "Tanımlar")).toContainText("Otel seçin");

  // Same browser tab: sessionStorage survives a reload.
  await page.reload();
  await expect(appIcon(page, "Tanımlar")).toBeVisible();

  // The quick tile of the notification shade is the same switch.
  await page.getByRole("button", { name: "Bildirim paneli" }).click();
  const shade = page.getByRole("dialog", { name: "Bildirim paneli" });
  await expect(shade.getByRole("button", { name: /Tanımlar/ })).toHaveAttribute("aria-pressed", "true");
  await shade.getByRole("button", { name: /Tanımlar/ }).click();
  await sysNav(page).getByRole("button", { name: "Geri" }).click();
  await expect(shade).toHaveCount(0);
  await expect(appIcon(page, "Tanımlar")).toHaveCount(0);
  expect(await page.evaluate(() => window.sessionStorage.getItem("merit.mobileDefs"))).toBe("0");
  expect(errors).toEqual([]);
});

test("Ayarlar: duvar kağıdı seçilir; oturum kapatma düğmesi var", async ({ page }) => {
  await openMobile(page);
  await openApp(page, "Ayarlar");
  const panel = appScreen(page, "Ayarlar");
  await expect(panel.getByRole("button", { name: "Oturumu Kapat" })).toBeVisible();
  // Scoped to the group: the Tema group has a "Royal Gold" option too.
  const wallpapers = panel.getByRole("radiogroup", { name: "Duvar kağıdı" });
  await wallpapers.getByRole("radio", { name: "Royal Gold" }).click();
  await expect(page.locator(".mb-shell")).toHaveAttribute("data-wallpaper", "royal-gold");
  await expect(wallpapers.getByRole("radio", { name: "Royal Gold" })).toBeChecked();
});

test("?mobil=1 ile 1280px'te de mobil; parametresiz 1280px masaüstü; yeniden boyutlandırma @kabul-10", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.setViewportSize(WIDE);
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(desktop(page)).toBeVisible();
  await expect(launcher(page)).toHaveCount(0);

  await page.goto("/admin?mobil=1");
  await expect(launcher(page)).toBeVisible();
  await expect(page.locator(".xp-desktop")).toHaveCount(0);

  // `?mod=personel` and `?kabuk=personel` resolve the same way as the legacy `?mobil=1`.
  for (const query of ["mod=personel", "kabuk=personel"]) {
    await page.goto(`/admin?${query}`);
    await expect(launcher(page)).toBeVisible();
    await expect(page.locator(".xp-desktop")).toHaveCount(0);
  }

  await page.goto("/admin");
  await expect(desktop(page)).toBeVisible();
  await expect(launcher(page)).toHaveCount(0);

  // Resize below 760 px swaps the shell without a reload, and back.
  await page.setViewportSize(PHONE);
  await expect(launcher(page)).toBeVisible();
  await expect(page.locator(".xp-desktop")).toHaveCount(0);
  await page.setViewportSize(WIDE);
  await expect(desktop(page)).toBeVisible();
  await expect(launcher(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Bildirimler: satır görünür, canlı eklenir, dokununca okundu olur; Tümünü okundu işaretle", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const id = await adminId();
  const first = await insertNotification(id, "Oda 101 DND", "Rahatsız etmeyin açıldı");
  await openMobile(page);
  // Unread count: on the launcher icon and in the status bar.
  await expect(appIcon(page, "Bildirimler")).toContainText("1");
  await expect(page.getByTestId("status-unread")).toContainText("1");
  await openApp(page, "Bildirimler");

  const list = page.getByRole("list", { name: "Bildirimler" });
  const row = list.getByRole("button", { name: /Oda 101 DND/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Rahatsız etmeyin açıldı");
  await expect(row).toContainText(/\d{2}:\d{2}/);
  await expect(row.getByTestId("unread-dot")).toBeVisible();

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
  await expect(launcher(page)).toBeVisible();
  await openApp(page, "Ayarlar");
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
