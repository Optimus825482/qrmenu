import { findStartItem } from "../definitionsUi";
import { expect, login, resetAndSeed, test } from "../fixtures";
import { sql } from "../helpers/acceptanceDb";
import { openAdminShell } from "../menuUi";

/**
 * Kabul 2 (spec §15): yetkisiz ekran/veri erişimi engellenir ve günlüğe yazılır; XP'de yetkisiz simge görünmez.
 */
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

test.beforeAll(() => {
  resetAndSeed();
});

const desktop = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Masaüstü" });

test.describe("@kabul-2 yetkisiz erişim", () => {
  test("@kabul-2 mudur.mr: Başlat menüsünde ve masaüstünde sistem simgeleri (Sistem Yönetimi, Denetim Masası, Hakkında) yok", async ({ page }) => {
    await login(page, "mudur.mr");
    await expect(page).toHaveURL(/\/admin(#.*)?$/);
    await expect(desktop(page)).toBeVisible();
    await expect(desktop(page).getByRole("button", { name: "Sistem Yönetimi", exact: true })).toHaveCount(0);
    await expect(desktop(page).getByRole("button", { name: "Denetim Masası", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "başlat" }).click();
    const menu = page.getByRole("menu", { name: "Başlat menüsü" });
    await expect(menu.getByRole("menuitem", { name: "Komuta Merkezi", exact: true })).toBeVisible();
    for (const hidden of ["Denetim Masası", "Hakkında"]) {
      await page.getByRole("searchbox", { name: "Uygulama ara" }).fill(hidden);
      await expect(menu.getByRole("menuitem", { name: hidden, exact: true })).toHaveCount(0);
    }
  });

  test("@kabul-2 kat.mr /admin → /yetkisiz ve garson /kasa → yetki sayfası; ikisi de günlüğe düşer", async ({ page }) => {
    await login(page, "kat.mr");
    await expect(page).toHaveURL(/\/kat$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/yetkisiz/);
    await page.context().clearCookies();

    await login(page, "garson.havuz");
    await page.getByRole("button", { name: /^Havuz Bar/ }).click(); // two outlets: the session starts at the pick
    await expect(page).not.toHaveURL(/\/(giris|secim)/);
    await page.goto("/kasa");
    await expect(page).not.toHaveURL(/\/kasa$/);

    const rows = await sql<{ username: string }>(
      `SELECT u.username FROM audit_logs a JOIN users u ON u.id = a.user_id
        WHERE a.action = 'YETKISIZ_DENEME' ORDER BY a.created_at`,
    );
    expect(rows.map((r) => r.username)).toEqual(expect.arrayContaining(["kat.mr"]));
  });

  test("@kabul-2 kat.mr QR ZIP ucunda 403, başka otelin oda/otel QR uçlarında 403/404 alır; YETKISIZ_DENEME admin günlüğünde görünür", async ({
    page,
    browser,
  }) => {
    const [outlet] = await sql<{ id: string }>(`SELECT id FROM outlets WHERE name = 'Havuz Bar'`);
    const [diamondHotel] = await sql<{ id: string }>(`SELECT id FROM hotels WHERE code = 'DIAMOND'`);
    const [diamondRoom] = await sql<{ id: string }>(
      `SELECT r.id FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE h.code = 'DIAMOND' AND r.number = '301'`,
    );
    const before = Number((await sql<{ n: string }>(`SELECT count(*) AS n FROM audit_logs WHERE action = 'YETKISIZ_DENEME'`))[0].n);

    await login(page, "kat.mr");
    await expect(page).toHaveURL(/\/kat$/);
    const zip = await page.request.get(`/api/qr/outlet/${outlet.id}/zip`);
    expect(zip.status()).toBe(403);
    expect((await zip.json()).error).toBeTruthy();
    for (const url of [`/api/qr/hotel/${diamondHotel.id}/room-zip`, `/api/qr/room/${diamondRoom.id}`]) {
      const res = await page.request.get(url);
      expect([403, 404], `${url} → ${res.status()}`).toContain(res.status());
    }
    const after = Number((await sql<{ n: string }>(`SELECT count(*) AS n FROM audit_logs WHERE action = 'YETKISIZ_DENEME'`))[0].n);
    expect(after).toBeGreaterThan(before);

    // The attempt is visible to the administrator in the Denetim Günlüğü window.
    const adminPage = await (await browser.newContext({ locale: "tr-TR", baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" })).newPage();
    try {
      await openAdminShell(adminPage);
      await adminPage.getByRole("button", { name: "başlat" }).click();
      await (await findStartItem(adminPage, "Denetim Günlüğü")).click();
      const win = adminPage.getByRole("region", { name: "Denetim Günlüğü", exact: true });
      await win.getByRole("textbox", { name: "İşlem" }).fill("YETKISIZ_DENEME");
      await expect(win.getByRole("row", { name: /YETKISIZ_DENEME/ }).first()).toBeVisible();
    } finally {
      await adminPage.context().close();
    }
  });
});
