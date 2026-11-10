import { expect, login, resetAndSeed, test } from "../fixtures";
import { sql } from "../helpers/acceptanceDb";
import deMessages from "../../../src/lib/i18n/messages/de.json";
import enMessages from "../../../src/lib/i18n/messages/en.json";
import arMessages from "../../../src/lib/i18n/messages/ar.json";
import ruMessages from "../../../src/lib/i18n/messages/ru.json";
import trMessages from "../../../src/lib/i18n/messages/tr.json";

/**
 * Kabul 10 (spec §15): misafir ekranları 5 dilde (tr, en, de, ru, ar), AR RTL; çevirisi olmayan öğe Türkçe;
 * XP kabuğu dar ekranda Android görünümüne düşer.
 */
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

test.beforeAll(() => {
  resetAndSeed({ guestMenu: true });
});

type Msg = { guest: { menu: { search: string }; room: { card: { roomService: string } } } };
const LANGS: [string, Msg][] = [
  ["tr", trMessages as Msg],
  ["en", enMessages as Msg],
  ["de", deMessages as Msg],
  ["ru", ruMessages as Msg],
  ["ar", arMessages as Msg],
];
const TABLE = "/q/e2e-guest-m1";

test.describe("@kabul-10 diller ve mobil", () => {
  for (const [lang, msg] of LANGS) {
    test(`@kabul-10 masa tokenı ${lang}: arayüz o dilde, html lang/dir doğru`, async ({ page }) => {
      await page.goto(`${TABLE}?lang=${lang}`);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      await expect(page.getByRole("searchbox", { name: msg.guest.menu.search })).toBeVisible();
      if (lang === "ar") {
        expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe("rtl");
        // Çevirisi olmayan öğe Türkçe (temel ad) kalır.
        await expect(page.locator("button.g-card", { hasText: "Aperol Spritz" })).toBeVisible();
      }
    });

    test(`@kabul-10 oda tokenı ${lang}: Oda Servisi kartı o dilde`, async ({ page }) => {
      const [{ qr_token }] = await sql<{ qr_token: string }>(
        `SELECT r.qr_token FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE r.number = '101' AND h.code = 'ROYAL'`,
      );
      await page.goto(`/q/${qr_token}?lang=${lang}`);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      await expect(page.getByRole("link", { name: new RegExp(msg.guest.room.card.roomService) })).toBeVisible();
      if (lang === "ar") expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe("rtl");
    });
  }

  test("@kabul-10 390×844: /admin Android ana ekranı İzleme/Raporlar/Bildirimler/Ayarlar, XP görev çubuğu yok", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "admin");
    await expect(page).toHaveURL(/\/admin$/);
    const launcher = page.getByRole("navigation", { name: "Uygulamalar" });
    await expect(launcher).toBeVisible();
    for (const name of ["İzleme", "Raporlar", "Bildirimler", "Ayarlar"]) {
      await expect(launcher.getByRole("button", { name })).toBeVisible();
    }
    for (const name of ["Geri", "Ana ekran", "Son uygulamalar"]) {
      await expect(page.getByRole("navigation", { name: "Sistem gezinmesi" }).getByRole("button", { name })).toBeVisible();
    }
    await expect(page.locator(".xp-taskbar")).toHaveCount(0);
    await expect(page.locator(".xp-desktop")).toHaveCount(0);
  });

  test("@kabul-10 masaüstünde ?mobil=1 aynı mobil görünümü verir", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, "admin");
    await expect(page.getByRole("region", { name: "Masaüstü" })).toBeVisible();
    await page.goto("/admin?mobil=1");
    await expect(page.getByRole("navigation", { name: "Uygulamalar" })).toBeVisible();
    await expect(page.locator(".xp-taskbar")).toHaveCount(0);
  });

  test("@kabul-10 tanımlama ekranları Ayarlar anahtarı kapalıyken gizli, açıkken görünür", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "admin");
    const launcher = page.getByRole("navigation", { name: "Uygulamalar" });
    const home = page.getByRole("navigation", { name: "Sistem gezinmesi" }).getByRole("button", { name: "Ana ekran" });
    await expect(launcher).toBeVisible();
    await expect(launcher.getByRole("button", { name: "Tanımlar" })).toHaveCount(0);
    await launcher.getByRole("button", { name: "Ayarlar" }).click();
    const toggle = page.getByRole("switch", { name: "Tanımlamaları mobilde aç" });
    await toggle.click();
    await expect(toggle).toBeChecked();
    await home.click();
    await expect(launcher.getByRole("button", { name: "Tanımlar" })).toBeVisible();
    await launcher.getByRole("button", { name: "Ayarlar" }).click();
    await toggle.click();
    await home.click();
    await expect(launcher.getByRole("button", { name: "Tanımlar" })).toHaveCount(0);
  });
});
