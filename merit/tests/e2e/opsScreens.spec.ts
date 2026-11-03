import { expect, resetAndSeed, test } from "./fixtures";
import {
  approveOrder,
  assignWaiter,
  M1_TOKEN,
  openStaff,
  pendingKpi,
  prepareOrder,
  queueCard,
  sendGuestOrder,
  serveOrder,
  tableTile,
} from "./opsUi";

test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });
test.beforeAll(() => resetAndSeed({ guestMenu: true }));

const WAITER = "Test garson.havuz";

test("kasa masa panosu, kuyruk, çağrı ve iptal akışı", async ({ page, browser }) => {
  const first = await sendGuestOrder(page);
  const cashier = await openStaff(browser, "kasa.havuz");
  await expect(cashier).toHaveURL(/\/kasa$/);

  // The board already carries the open order (GONDERILDI = "Onay Bekliyor") and the KPI counts it.
  await expect(tableTile(cashier, "M1")).toContainText(`#${first.orderNo}`);
  await expect(tableTile(cashier, "M1")).toContainText("Onay Bekliyor");
  await expect(pendingKpi(cashier)).toHaveText("1");

  // Assignment through the tile dialog; it is server state: still there after a reload.
  await assignWaiter(cashier, "M1", WAITER);
  await cashier.reload();
  await expect(tableTile(cashier, "M1")).toContainText(WAITER);
  await expect(tableTile(cashier, "M2")).toContainText("Garson atanmamış");

  // A guest call reaches the tile live (SSE), with its type badge.
  const call = await page.request.post(`/api/q/${M1_TOKEN}/call`, { data: { type: "GARSON" } });
  expect(call.ok()).toBeTruthy();
  await expect(tableTile(cashier, "M1")).toContainText("GARSON", { timeout: 3_000 });
  await expect(cashier.getByRole("button", { name: "Garson Çağrıları" })).toContainText("1");

  // Approve from the queue tab: the pending KPI drops to 0 and the tile moves on to "Hazırlanıyor".
  await approveOrder(cashier, first.orderNo);
  await expect(pendingKpi(cashier)).toHaveText("0");
  await cashier.getByRole("button", { name: "Masalar" }).click();
  await expect(tableTile(cashier, "M1")).toContainText("Hazırlanıyor");

  // Second order: approve, then cancel it from İptal / İade with a reason (single reason dialog).
  await cashier.getByRole("button", { name: "Adisyon Kuyruğu" }).click();
  const second = await sendGuestOrder(page);
  await expect(queueCard(cashier, second.orderNo)).toBeVisible({ timeout: 3_000 }); // live, no reload
  await approveOrder(cashier, second.orderNo);
  await cashier.getByRole("navigation", { name: "Personel bölümleri" }).getByRole("link", { name: "İptal" }).click();
  await expect(cashier).toHaveURL(/\/kasa\/iptal$/);
  const secondRow = cashier.getByRole("article").filter({ hasText: `#${second.orderNo} · M1` });
  await secondRow.getByRole("button", { name: "İptal et" }).click();
  const reasonDialog = cashier.getByRole("dialog", { name: /siparişini iptal et$/ });
  await reasonDialog.getByLabel("Diğer sebep").fill("misafir vazgeçti");
  await reasonDialog.getByRole("button", { name: "İptal et" }).click();
  await expect(secondRow).toHaveCount(0);
  await expect(cashier.getByRole("article").filter({ hasText: `#${first.orderNo} · M1` })).toBeVisible(); // untouched

  // The guest tab is already on this order URL; reload to fetch the server's updated status.
  expect(page.url()).toBe(second.url);
  await page.reload();
  await expect(page.getByRole("main")).toContainText("İptal");
  await cashier.context().close();
});

test("KDS canlı mutfak akışı: yeni, hazırlanıyor, hazır ve servis", async ({ page, browser }) => {
  const cashier = await openStaff(browser, "kasa.havuz");
  await assignWaiter(cashier, "M1", WAITER);

  const order = await sendGuestOrder(page);
  await approveOrder(cashier, order.orderNo);

  const kitchen = await openStaff(browser, "kds.havuz");
  await expect(kitchen).toHaveURL(/\/kds$/);
  const readyCard = await prepareOrder(kitchen, order.orderNo);
  await expect(readyCard).not.toContainText("€"); // prices are hidden on the kitchen display

  const waiter = await openStaff(browser, "garson.havuz");
  await expect(waiter).toHaveURL(/\/garson$/);
  await serveOrder(waiter, order.orderNo);
  await expect(readyCard).toHaveCount(0); // the KDS column follows live

  expect(page.url()).toBe(order.url);
  await page.reload();
  await expect(page.getByRole("main")).toContainText("Servis");
  await waiter.context().close();
  await kitchen.context().close();
  await cashier.context().close();
});
