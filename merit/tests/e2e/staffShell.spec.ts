import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { newContextPage } from "./menuUi";
import { M1_TOKEN, sendGuestOrder } from "./opsUi";

// One database state for the whole file; the order of the tests matters (the first one seeds the queue).
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });
test.beforeAll(() => resetAndSeed({ guestMenu: true }));

const ROYAL_MINIBAR = /Minibar · Merit Royal(?! Premium)/;
const nav = (page: Page) => page.getByRole("navigation", { name: "Ana gezinme" });

async function sql<T = never>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/** Logs in and, when asked, picks the target card shown on the login page. */
async function signIn(page: Page, username: string, target?: RegExp): Promise<void> {
  await login(page, username);
  if (target) await page.getByRole("button", { name: target }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/giris") && !url.pathname.startsWith("/secim"));
}

/** Opens `path` and checks that the page carries exactly one navigation: the shell's bottom bar / rail. */
async function expectSingleNav(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(nav(page)).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(1);
}

test("tek gezinme: kat sorumlusu üç sayfada yalnız Ana gezinme çubuğunu görür", async ({ page }) => {
  await signIn(page, "kat.mr");
  for (const path of ["/kat", "/kat/tavsiye-is-plani", "/kat/islemlerim"]) await expectSingleNav(page, path);
  const items = nav(page).getByRole("link");
  await expect(items.nth(2)).toHaveText(/QR Okut/);
  await expect(nav(page).getByRole("button", { name: "Daha" })).toBeVisible();
});

test("tek gezinme: garson, iç sekmeler tablist; depo ve oda servisi de tek nav", async ({ page, browser }) => {
  await signIn(page, "garson.havuz", /Havuz Bar/);
  await expectSingleNav(page, "/garson");
  const tabs = page.getByRole("tablist");
  await expect(tabs.getByRole("tab", { name: "Kuyruk" })).toHaveAttribute("aria-selected", "true");
  await expect(tabs.getByRole("tab", { name: "Masalarım" })).toBeVisible();
  await tabs.getByRole("tab", { name: "Masalarım" }).click();
  await expect(page).toHaveURL(/sekme=masalar/);
  await expect(page.getByRole("navigation")).toHaveCount(1);
  await expectSingleNav(page, "/garson/cagrilar");

  const depot = await newContextPage(browser);
  await signIn(depot, "depo.cok", ROYAL_MINIBAR);
  for (const path of ["/depo", "/depo/stok", "/depo/raporlar", "/kat/duzeltme-onay"]) await expectSingleNav(depot, path);
  await depot.context().close();

  const rs = await newContextPage(browser);
  await signIn(rs, "fbm.mr");
  for (const path of ["/oda-servisi", "/oda-servisi?sekme=teslim"]) await expectSingleNav(rs, path);
  await expect(nav(rs).getByRole("link", { name: "Teyit" })).toBeVisible();
  await rs.context().close();
});

test("çıkış iki dokunuşta: avatar sonra Çıkış, yerel kullanıcı verisi silinir", async ({ page }) => {
  await signIn(page, "kat.mr");
  await page.goto("/kat");
  await page.evaluate(() => {
    localStorage.setItem("merit.u.x", "1");
    localStorage.setItem("merit.device", "keep");
    sessionStorage.setItem("tmp", "1");
  });
  await page.getByRole("button", { name: /Profil menüsü/ }).click();
  await page.getByRole("menuitem", { name: "Çıkış" }).click();
  await expect(page).toHaveURL(/\/giris/);
  const left = await page.evaluate(() => ({
    user: localStorage.getItem("merit.u.x"),
    device: localStorage.getItem("merit.device"),
    session: sessionStorage.getItem("tmp"),
  }));
  expect(left).toEqual({ user: null, device: "keep", session: null });
});

test("çevrimdışı: şerit çıkar, Onayla aria-disabled olur; çevrimiçine dönünce kalkar", async ({ page, browser }) => {
  const guest = await newContextPage(browser);
  await sendGuestOrder(guest, "Mojito", M1_TOKEN);
  await guest.context().close();

  await signIn(page, "garson.havuz", /Havuz Bar/);
  await page.goto("/garson");
  const approve = page.getByRole("button", { name: "Onayla" }).first();
  await expect(approve).toBeVisible();
  await expect(approve).not.toHaveAttribute("aria-disabled", "true");

  await page.context().setOffline(true);
  const banner = page.getByText("Bağlantı yok — işlemler gönderilemez");
  await expect(banner).toBeVisible();
  await expect(approve).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText(/Son güncelleme \d{2}:\d{2}/)).toBeVisible();

  await page.context().setOffline(false);
  await expect(banner).toBeHidden({ timeout: 15_000 });
  await expect(approve).not.toHaveAttribute("aria-disabled", "true");
});

test("depo çok otelli: otel değişince gezinme yeni otelin ekranlarıyla yenilenir", async ({ page }) => {
  const [{ id: roleId }] = await sql<{ id: string }>("SELECT id FROM roles WHERE code = 'R-DEP'");
  const [{ id: screenId }] = await sql<{ id: string }>("SELECT id FROM app_screens WHERE code = 'MB-ZIM'");
  const [{ id: hotelId }] = await sql<{ id: string }>("SELECT id FROM hotels WHERE code = 'PREMIUM'");
  await sql(
    `INSERT INTO role_screen_permissions (id, role_id, screen_id, hotel_id, can_view, can_create, can_edit, can_approve, can_report, created_at, updated_at)
     VALUES ($1, $2, $3, $4, false, false, false, false, false, now(), now())`,
    [randomUUID(), roleId, screenId, hotelId],
  );

  await signIn(page, "depo.cok", ROYAL_MINIBAR);
  await page.goto("/depo/stok");
  await expect(nav(page).getByRole("link", { name: "Havuz" })).toBeVisible();
  await expect(page.getByText("Merit Royal", { exact: true }).first()).toBeVisible();
  await page.evaluate(() => localStorage.setItem("merit.u.x", "1"));

  await page.getByRole("button", { name: /Profil menüsü/ }).click();
  await page.getByRole("menuitem", { name: "Minibar · Merit Royal Premium" }).click();
  // The switch ends in /baslat (landing of the new hotel); then open a depot page of the new context.
  await expect(page).toHaveURL(/\/kat$|\/depo\/raporlar$/, { timeout: 15_000 });
  await page.goto("/depo/raporlar");
  await expect(nav(page)).toBeVisible();
  await expect(nav(page).getByRole("link", { name: "Havuz" })).toHaveCount(0);
  await expect(nav(page).getByRole("link", { name: "Raporlar" })).toBeVisible();
  await expect(page.getByText(/Merit Royal Premium/).first()).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(1);
});

test("oturum bitişine 60 dakikadan az kalınca kalıcı şerit görünür", async ({ page }) => {
  await signIn(page, "kat.mr");
  await page.goto("/kat");
  await expect(page.getByText(/Oturum \d+ dk sonra kapanacak/)).toHaveCount(0);
  await sql(
    `UPDATE user_sessions SET expires_at = now() + interval '42 minutes'
      WHERE user_id = (SELECT id FROM users WHERE username = 'kat.mr') AND status IN ('ONLINE', 'UYARI')`,
  );
  await page.reload();
  await expect(page.getByText(/Oturum (4[12]) dk sonra kapanacak/)).toBeVisible();
});

test("depo ana sayfası: yetkili kartlar, her kart ilgili ekrana gider; Geri bağlantısı /depo", async ({ page }) => {
  await signIn(page, "depo.cok", ROYAL_MINIBAR);
  await page.goto("/depo");
  const main = page.getByRole("main");
  await expect(main).toHaveCount(1);
  await expect(main.getByRole("heading", { level: 1, name: "Depo panosu" })).toBeVisible();
  await expect(main.getByRole("link", { name: /Minibar Stok & Talepler/ })).toHaveAttribute("href", "/depo/stok");
  await expect(main.getByRole("link", { name: /Geçmiş Kayıt Düzeltme Onayları/ })).toHaveAttribute("href", "/kat/duzeltme-onay");
  await expect(main.getByRole("link", { name: /Doluluk Excel Yükleme/ })).toHaveAttribute("href", "/depo/doluluk-yukle");
  await page.goto("/depo/stok");
  await expect(page.getByRole("link", { name: "Geri" })).toHaveAttribute("href", "/depo");
});

test("depo panosu otel kapsamı dışındaki havuz kartını göstermez", async ({ page }) => {
  await signIn(page, "depo.cok", /Minibar · Merit Royal Premium/);
  await page.goto("/depo");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Depo panosu" })).toBeVisible();
  await expect(main.getByRole("link", { name: /Minibar Stok & Talepler/ })).toHaveCount(0);
  await expect(main.getByRole("link", { name: /Minibar Raporları/ })).toBeVisible();
});

test("kat panosu gün özetini yerel tarih biçiminde gösterir", async ({ page }) => {
  await signIn(page, "kat.mr");
  await page.goto("/kat");
  await expect(page.getByText(/^Günün Özeti · \d{2}\.\d{2}\.\d{4}$/)).toBeVisible();
});

test.describe("telefon görünümü", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("390x844: yatay kaydırma yok, gezinme altta", async ({ page }) => {
    await signIn(page, "kat.mr");
    for (const path of ["/kat", "/kat/islemlerim"]) {
      await expectSingleNav(page, path);
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
    }
    const box = await nav(page).boundingBox();
    expect(Math.round(box?.height ?? 0)).toBe(80);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThanOrEqual(843);
  });
});
