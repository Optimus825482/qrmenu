import { expect, resetAndSeed, test } from "./fixtures";
import {
  approveOrder,
  assignWaiter,
  M1_TOKEN,
  openStaff,
  pendingKpi,
  prepareOrder,
  queueCard,
  railLink,
  sendGuestOrder,
  serveOrder,
  tablePanel,
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

  // The board already carries the open order (GONDERILDI = "Onay bekliyor · 1"), its panel lists #N, and the KPI counts it.
  await expect(tableTile(cashier, "M1")).toContainText("Onay bekliyor · 1");
  await tableTile(cashier, "M1").click();
  await expect(tablePanel(cashier, "M1").getByRole("article", { name: `Sipariş #${first.orderNo}` })).toBeVisible();
  await expect(pendingKpi(cashier)).toHaveText("1");

  // Assignment through the tile dialog; it is server state: still there after a reload.
  await assignWaiter(cashier, "M1", WAITER);
  await cashier.reload();
  await expect(tableTile(cashier, "M1")).toContainText(WAITER);
  await expect(tableTile(cashier, "M2")).toContainText("Atanmadı");

  // A guest call reaches the tile live (SSE), with its type badge.
  const call = await page.request.post(`/api/q/${M1_TOKEN}/call`, { data: { type: "GARSON" } });
  expect(call.ok()).toBeTruthy();
  await expect(tableTile(cashier, "M1")).toContainText("GARSON", { timeout: 3_000 });
  await expect(railLink(cashier, /^Çağrılar/)).toContainText("1");

  // Approve from the queue tab: the pending KPI drops to 0 and the tile moves on to "Hazırlanıyor".
  await approveOrder(cashier, first.orderNo);
  await expect(pendingKpi(cashier)).toHaveText("0");
  await railLink(cashier, "Masalar").click();
  await expect(tableTile(cashier, "M1")).toContainText("Hazırlanıyor");

  // Second order: approve, then cancel it from İptal / İade with a reason (single reason dialog).
  await railLink(cashier, /^Kuyruk/).click();
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

test("KDS yenilenmiş tahta: üç sütun, 64 px bump, kart bazlı bekleme, Hazır geri alma, dar ekran kaydırma", async ({ page, browser }) => {
  const cashier = await openStaff(browser, "kasa.havuz");
  const first = await sendGuestOrder(page);
  const second = await sendGuestOrder(page);
  await approveOrder(cashier, first.orderNo);
  await approveOrder(cashier, second.orderNo);

  const kitchen = await openStaff(browser, "kds.havuz");
  await kitchen.setViewportSize({ width: 1024, height: 768 });
  const column = (name: string) => kitchen.getByRole("region", { name, exact: true });
  const card = (name: string, orderNo: number) => column(name).getByRole("article").filter({ hasText: new RegExp(`#${orderNo}\\b`) });
  await expect(card("Yeni", first.orderNo)).toBeVisible();
  await expect(card("Yeni", second.orderNo)).toBeVisible();

  // Ses henüz açılmadı: durum şeridi nedenini söyler.
  await expect(kitchen.getByText("Ses: Etkinleştirmek için dokunun")).toBeVisible();

  // Üç sütun yan yana (aynı üst kenar, soldan sağa artan).
  const boxes = await Promise.all(["Yeni", "Hazırlanıyor", "Hazır"].map((name) => column(name).boundingBox()));
  const [b1, b2, b3] = boxes.map((box) => box!);
  expect(Math.abs(b1.y - b2.y)).toBeLessThan(1);
  expect(Math.abs(b2.y - b3.y)).toBeLessThan(1);
  expect(b1.x).toBeLessThan(b2.x);
  expect(b2.x).toBeLessThan(b3.x);

  // Bump düğmesi en az 64 px yüksek ve kart genişliğinde.
  const bump = card("Yeni", first.orderNo).getByRole("button", { name: "Başla" });
  const bumpBox = (await bump.boundingBox())!;
  expect(bumpBox.height).toBeGreaterThanOrEqual(64);

  // Bekleyen işlem yalnız kendi kartını kilitler: sunucu eylemleri geciktirilir.
  let slow = true;
  await kitchen.route("**/kds", async (route) => {
    if (slow && route.request().method() === "POST" && route.request().headers()["next-action"]) await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await bump.click();
  await expect(card("Yeni", first.orderNo).getByRole("button", { name: "Başla" })).toBeDisabled();
  await expect(card("Yeni", second.orderNo).getByRole("button", { name: "Başla" })).toBeEnabled();
  slow = false;
  await expect(card("Hazırlanıyor", first.orderNo)).toBeVisible();

  // Hazır -> Geri al -> kart Hazırlanıyor sütununa döner.
  await card("Hazırlanıyor", first.orderNo).getByRole("button", { name: "Hazır" }).click();
  await expect(card("Hazır", first.orderNo)).toBeVisible();
  await kitchen.getByRole("button", { name: "Geri al" }).click();
  await expect(card("Hazırlanıyor", first.orderNo)).toBeVisible();
  await expect(card("Hazır", first.orderNo)).toHaveCount(0);

  // Süre dolunca (8 sn) Geri al düğmesi kalmaz.
  await card("Hazırlanıyor", first.orderNo).getByRole("button", { name: "Hazır" }).click();
  await expect(card("Hazır", first.orderNo)).toBeVisible();
  await expect(kitchen.getByRole("button", { name: "Geri al" })).toBeVisible();
  await kitchen.waitForTimeout(8000);
  await expect(kitchen.getByRole("button", { name: "Geri al" })).toHaveCount(0);

  // Dikey tablet: sütunlar tek yatay kaydırma kabında, sayfa kaymaz.
  await kitchen.setViewportSize({ width: 768, height: 1024 });
  const scroll = await kitchen.locator("[data-kds-board]").evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(scroll.scroll).toBeGreaterThan(scroll.client);
  const doc = await kitchen.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(doc.scroll).toBeLessThanOrEqual(doc.client);

  await kitchen.context().close();
  await cashier.context().close();
});
