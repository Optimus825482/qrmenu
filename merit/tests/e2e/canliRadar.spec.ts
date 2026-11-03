import type { Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { expectNoHorizontalScroll } from "./matrix/a11y";
import { newContextPage } from "./menuUi";
import { approveOrder, openStaff, sendGuestOrder } from "./opsUi";
import { RADAR_VIEWPORTS, expectRadarAxeClean, openRadar, radarTab, radarToolbar, tableCard } from "./radarUi";

// One database state for the whole file; the order of the second test is approved in the same test.
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });
test.beforeAll(() => resetAndSeed({ guestMenu: true }));

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
    await expect(win.getByText("Doluluk yüklenmedi")).toBeVisible();
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
  await expect(panel.getByRole("button")).toHaveCount(1); // only "Kapat"

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

test.fixme("Oda kontrolü Kat görünümünde 2 sn içinde onay işareti verir (radar Task 3 yayınları birleşince açılır)", async ({ page }) => {
  await openDesktop(page, "admin");
  const win = await openRadar(page);
  await expect(win.getByRole("gridcell", { name: /kontrol edildi/ })).toBeVisible({ timeout: 2_000 });
});
