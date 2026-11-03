import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { expectNoHorizontalScroll } from "./matrix/a11y";
import { newContextPage } from "./menuUi";
import { approveOrder, openStaff, sendGuestOrder } from "./opsUi";
import { RADAR_VIEWPORTS, expectRadarAxeClean, openRadar, radarTab, radarToolbar, tableCard } from "./radarUi";

// One database state for the whole file; the order of the second test is approved in the same test.
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

for (const viewport of RADAR_VIEWPORTS) {
  test(`Genel Bakış, Kat ve Masa görünümleri düzenli ve erişilebilir (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openDesktop(page, "admin");
    const win = await openRadar(page);
    await expect(win).toHaveAccessibleName("Canlı Radar · Tüm kompleks");

    // Several hotels: Genel Bakış with one card per hotel and the "Tüm kompleks" choice.
    await expect(radarTab(win, "Genel Bakış")).toHaveAttribute("aria-selected", "true");
    await expect(win.getByRole("article")).toHaveCount(3);
    await expect(win.getByRole("menubar", { name: "Radar menüsü", exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectRadarAxeClean(page, "radar-pencere");

    // One hotel: Kat is the first view (Minibar layer on), then Masa.
    await radarToolbar(win).getByRole("combobox", { name: "Otel" }).selectOption({ label: MR_NAME });
    await expect(win).toHaveAccessibleName(`Canlı Radar · ${MR_NAME}`);
    await expect(radarTab(win, "Kat")).toHaveAttribute("aria-selected", "true");
    await expect(win.getByRole("grid", { name: "Kat ve oda ızgarası" }).or(win.getByText("Bu otelde oda tanımlı değil."))).toBeVisible();
    await expect(win.getByText("Doluluk yüklenmedi", { exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectRadarAxeClean(page, "radar-pencere");

    await radarTab(win, "Masa").click();
    await expect(tableCard(win, "M1")).toBeVisible();
    await expect(tableCard(win, "M1")).toContainText("Boş");
    await expectNoHorizontalScroll(page);
    await expectRadarAxeClean(page, "radar-pencere");
  });
}

test("Masa kartı sipariş ve onay akışını 2 sn içinde gösterir", async ({ page, browser }) => {
  await page.setViewportSize(RADAR_VIEWPORTS[0]);
  await openDesktop(page, "admin");
  const win = await openRadar(page);
  await radarToolbar(win).getByRole("combobox", { name: "Otel" }).selectOption({ label: MR_NAME });
  await radarTab(win, "Masa").click();
  await win.getByRole("combobox", { name: "Outlet" }).selectOption({ label: "Havuz Bar" });
  await expect(tableCard(win, "M1")).toContainText("Boş");

  const guest = await newContextPage(browser);
  const order = await sendGuestOrder(guest);
  await expect(tableCard(win, "M1")).toContainText("Onay bekliyor", { timeout: 2_000 });
  await expect(tableCard(win, "M1")).toContainText("1 sipariş");

  // The side panel is read-only: it shows the order and has no button that changes it.
  await tableCard(win, "M1").click();
  const panel = win.getByRole("region", { name: "Masa M1 ayrıntısı" });
  await expect(panel).toContainText(`Sipariş ${order.orderNo}`);
  // Only "Kapat" and the link into the app: nothing in the panel changes an order.
  await expect(panel.getByRole("button")).toHaveText(["Kapat", "Uygulamada aç"]);

  const cashier = await openStaff(browser, "kasa.havuz");
  await approveOrder(cashier, order.orderNo);
  await expect(tableCard(win, "M1")).toContainText("Hazırlanıyor", { timeout: 2_000 });
});

test("Tek otelli yönetici yalnız kendi otelini ve yetkili katmanları görür", async ({ page }) => {
  await page.setViewportSize(RADAR_VIEWPORTS[0]);
  await openDesktop(page, "mudur.mr");
  const win = await openRadar(page);
  await expect(win).toHaveAccessibleName(`Canlı Radar · ${MR_NAME}`);

  const toolbar = radarToolbar(win);
  await expect(toolbar).toContainText(MR_NAME);
  await expect(toolbar.getByRole("combobox", { name: "Otel" })).toHaveCount(0);
  await expect(toolbar).not.toContainText("Tüm kompleks");
  await expect(toolbar).not.toContainText(/Diamond|Premium/);
  // R-OTM has no Oda Servisi module: its layer button is not drawn at all.
  await expect(toolbar.getByRole("button", { name: /Oda Servisi/ })).toHaveCount(0);
  await expect(toolbar.getByRole("group", { name: "Katmanlar" }).getByRole("button", { name: /Sistem/ })).toBeVisible();
});

test("Oda kontrolü Kat görünümünde 2 sn içinde onay işareti verir", async ({ page, browser }) => {
  await page.setViewportSize(RADAR_VIEWPORTS[0]);
  await openDesktop(page, "admin");
  const win = await openRadar(page);
  await radarToolbar(win).getByRole("combobox", { name: "Otel" }).selectOption({ label: MR_NAME });
  await expect(radarTab(win, "Kat")).toHaveAttribute("aria-selected", "true");

  const cell101 = win.getByRole("gridcell", { name: /^101:/ });
  await expect(cell101).toBeVisible();
  const roomId = await cell101.getAttribute("data-room-id");
  expect(roomId).toBeTruthy();

  const katPage = await newContextPage(browser);
  await login(katPage, "kat.mr");
  await katPage.waitForURL((url) => !url.pathname.startsWith("/giris"));
  const res = await katPage.context().request.post(`/api/minibar/room/${roomId}/no-consumption`, {
    data: { clientRequestId: randomUUID() },
  });
  expect(res.status()).toBe(200);

  await expect(win.getByRole("gridcell", { name: /101:.*kontrol edildi/ })).toBeVisible({ timeout: 2_000 });
});

test("Kuyruklar, Personel, lejant ve klavye kısayolları canlı çalışır", async ({ page, browser }) => {
  await page.setViewportSize(RADAR_VIEWPORTS[0]);
  await openDesktop(page, "admin");
  const win = await openRadar(page);
  await radarToolbar(win).getByRole("combobox", { name: "Otel" }).selectOption({ label: MR_NAME });

  // Legend is visible on initial opens, and ticker is present on the right.
  await expect(win.getByRole("region", { name: "Görünüm açıklaması" })).toBeVisible();
  await expect(win.getByRole("complementary", { name: "Olay şeridi" })).toBeVisible();

  // Switch to Kuyruklar (key "4" or tab)
  await radarTab(win, "Kuyruklar").click();
  await expect(radarTab(win, "Kuyruklar")).toHaveAttribute("aria-selected", "true");
  const havuzRow = win.locator("tr.rd-queue-row", { hasText: "Havuz Bar" });
  await expect(havuzRow).toBeVisible();

  const guest = await newContextPage(browser);
  const order = await sendGuestOrder(guest);
  await expect(havuzRow).toContainText(/[1-9]\d* bekleyen/, { timeout: 2_000 });

  const cashier = await openStaff(browser, "kasa.havuz");
  await approveOrder(cashier, order.orderNo);
  await expect(havuzRow).toContainText(/Yeni [1-9]/, { timeout: 2_000 });

  // Switch to Personel via keyboard shortcut "6"
  await win.locator(".rd-root").press("6");
  await expect(radarTab(win, "Personel")).toHaveAttribute("aria-selected", "true");

  // Alt+1 toggles Minibar layer off
  const minibarBtn = radarToolbar(win).getByRole("group", { name: "Katmanlar" }).getByRole("button", { name: /Minibar/ });
  await expect(minibarBtn).toHaveAttribute("aria-pressed", "true");
  await win.locator(".rd-root").press("Alt+1");
  await expect(minibarBtn).toHaveAttribute("aria-pressed", "false");

  await expectNoHorizontalScroll(page);
  await expectRadarAxeClean(page, "radar-kuyruk-personel");
});

test("Zaman şeridinde 10 sn geri sarma ve Gün tekrarı oynatıcısı (60x / Sona atla) çalışır", async ({ page, browser }) => {
  await page.setViewportSize(RADAR_VIEWPORTS[0]);
  await openDesktop(page, "admin");
  const win = await openRadar(page);
  await radarToolbar(win).getByRole("combobox", { name: "Otel" }).selectOption({ label: MR_NAME });
  await radarTab(win, "Masa").click();
  await win.getByRole("combobox", { name: "Outlet" }).selectOption({ label: "Havuz Bar" });

  // Create a new order on M1, wait 2 seconds, approve it -> M1 has a new order
  const guest = await newContextPage(browser);
  const order = await sendGuestOrder(guest);
  await expect(tableCard(win, "M1")).toContainText("Onay bekliyor", { timeout: 2_000 });
  await page.waitForTimeout(2_000);

  const cashier = await openStaff(browser, "kasa.havuz");
  await approveOrder(cashier, order.orderNo);
  await expect(tableCard(win, "M1")).toContainText("Hazırlanıyor", { timeout: 2_000 });

  // Scrub back 10 seconds -> banner shows "Geçmiş görünüm"
  await win.getByRole("button", { name: "10 saniye geri" }).click();
  await expect(win.getByText(/Geçmiş görünüm/)).toBeVisible();

  // While in scrub mode, a new event arrives -> "+1 yeni olay"
  const order2 = await sendGuestOrder(guest);
  await expect(win.getByText(/\+[1-9]\d* yeni olay/)).toBeVisible({ timeout: 2_000 });
  void order2;

  // Press End -> return to live
  await win.locator(".rd-root").press("End");
  await expect(win.getByText(/Geçmiş görünüm/)).toHaveCount(0);

  // Open Oynat -> Gün tekrarı…
  await win.getByRole("menuitem", { name: "Oynat" }).click();
  await win.getByRole("menuitem", { name: "Gün tekrarı…" }).click();
  const dialog = win.getByRole("dialog", { name: "Gün tekrarı" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Tekrarı başlat" }).click();

  await expect(win.getByText(/Tekrar ·/)).toBeVisible({ timeout: 5_000 });
  await win.getByRole("button", { name: "Sona atla" }).click();
  await expect(tableCard(win, "M1")).toContainText("Onay bekliyor");

  // Esc -> exit replay and return to live
  await win.locator(".rd-root").press("Escape");
  await expect(win.getByText(/Tekrar ·/)).toHaveCount(0);
});


