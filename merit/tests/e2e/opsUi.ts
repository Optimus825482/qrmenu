import type { Browser, Locator, Page } from "@playwright/test";
import { expect, login } from "./fixtures";
import { newContextPage } from "./menuUi";

/** Shared flows of the staff screens (/kasa, /kds, /garson) and the guest ordering pages. */

export const M1_TOKEN = "e2e-guest-m1";

/** Logs a field user in (own context + IP) and picks the outlet card shown on the login page. */
export async function openStaff(browser: Browser, username: string, outlet: RegExp = /Havuz Bar/): Promise<Page> {
  const page = await newContextPage(browser);
  await login(page, username);
  await page.getByRole("button", { name: outlet }).click();
  return page;
}

/** Adds one `item` to the selections of table `token` and sends them; resolves to the status page. */
export async function sendGuestOrder(
  page: Page,
  item = "Mojito",
  token = M1_TOKEN,
): Promise<{ url: string; orderNo: number }> {
  await page.goto(`/q/${token}`);
  await page.locator("button.g-card", { hasText: item }).click();
  await page.getByRole("dialog", { name: item }).getByRole("button", { name: "Seçimlere ekle" }).click();
  await page.getByRole("button", { name: /^Seçimlerim/ }).click();
  await page.getByRole("dialog", { name: "Seçimlerim" }).getByRole("button", { name: "Seçimleri gönder" }).click();
  await expect(page).toHaveURL(/\/siparis\/[^/]+$/);
  const heading = await page.getByRole("main").getByRole("heading", { level: 2 }).textContent();
  const orderNo = Number(heading?.match(/#(\d+)/)?.[1]);
  expect(orderNo).toBeGreaterThan(0);
  return { url: page.url(), orderNo };
}

/** The tile of table `label` on the cashier's Masalar board. */
export const tableTile = (cashier: Page, label: string): Locator =>
  cashier.getByRole("button", { name: `${label} masa detayları` });

/** A link of the POS rail (Masalar, Kuyruk, Çağrılar, Menü, Yazıcı, İptal). */
export const railLink = (cashier: Page, name: string | RegExp): Locator =>
  cashier.getByRole("navigation", { name: "Personel bölümleri" }).getByRole("link", { name });

/** The side panel (landscape) or bottom sheet (portrait) of table `label`. */
export const tablePanel = (cashier: Page, label: string): Locator =>
  cashier.getByRole("complementary", { name: label, exact: true }).or(cashier.getByRole("dialog", { name: label, exact: true }));

/** Assigns `waiter` to table `label` through the table's side panel. */
export async function assignWaiter(cashier: Page, label: string, waiter: string): Promise<void> {
  await railLink(cashier, "Masalar").click();
  await tableTile(cashier, label).click();
  const panel = tablePanel(cashier, label);
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Değiştir" }).click();
  await panel.getByRole("combobox", { name: "Garson" }).selectOption({ label: waiter });
  await panel.getByRole("button", { name: "Ata", exact: true }).click();
  await expect(tableTile(cashier, label)).toContainText(waiter);
}

/** The card of order `orderNo` in the cashier's Kuyruk tab. */
export function queueCard(cashier: Page, orderNo: number): Locator {
  return cashier
    .getByRole("region", { name: "Onay kuyruğu" })
    .getByRole("article")
    .filter({ hasText: new RegExp(`#${orderNo}\\b`) });
}

/** Approves order `orderNo` from the cashier's queue tab. */
export async function approveOrder(cashier: Page, orderNo: number): Promise<void> {
  await railLink(cashier, /^Kuyruk/).click();
  const card = queueCard(cashier, orderNo);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /Onayla/ }).click();
  await expect(card).toHaveCount(0);
}

/** The value of the "Bekleyen sipariş" KPI tile. */
export const pendingKpi = (cashier: Page): Locator =>
  cashier.getByRole("region", { name: "Kasa göstergeleri" }).locator("p:text-is('Bekleyen sipariş') + p");

/** Runs the kitchen flow of `orderNo` on the KDS page (Yeni → Hazırlanıyor → Hazır). */
export async function prepareOrder(kitchen: Page, orderNo: number): Promise<Locator> {
  const card = (column: string) =>
    kitchen
      .getByRole("region", { name: column, exact: true })
      .getByRole("article")
      .filter({ hasText: new RegExp(`#${orderNo}\\b`) });
  await expect(card("Yeni")).toBeVisible();
  await card("Yeni").getByRole("button", { name: "Başla" }).click();
  await expect(card("Hazırlanıyor")).toBeVisible();
  await card("Hazırlanıyor").getByRole("button", { name: "Hazır" }).click();
  await expect(card("Hazır")).toBeVisible();
  return card("Hazır");
}

/** Marks order `orderNo` served from the waiter's Masalarım tab. */
export async function serveOrder(waiter: Page, orderNo: number): Promise<void> {
  await waiter.getByRole("tab", { name: "Masalarım" }).click();
  const line = waiter.getByText(new RegExp(`^#${orderNo} ·`));
  await expect(line).toContainText("HAZIR");
  await line.locator("..").getByRole("button", { name: "Servis edildi" }).click();
  await expect(line).toHaveCount(0);
}
