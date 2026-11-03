import { randomUUID } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { Client } from "pg";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { newContextPage } from "./menuUi";
import { M1_TOKEN, openStaff, railLink, sendGuestOrder, tablePanel, tableTile } from "./opsUi";

test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR", viewport: { width: 1280, height: 800 } });

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Cashier in a fresh context with browser API stubs installed before any page script runs. */
async function openCashier(browser: Browser, stubs: string): Promise<Page> {
  const cashier = await newContextPage(browser);
  await cashier.addInitScript(stubs);
  await login(cashier, "kasa.havuz");
  await cashier.getByRole("button", { name: /Havuz Bar/ }).click();
  await expect(cashier).toHaveURL(/\/kasa$/);
  return cashier;
}

const FULLSCREEN_OK = `
  window.__fs = 0; window.__wl = 0;
  Element.prototype.requestFullscreen = async function () {
    window.__fs++;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => document.documentElement });
    document.dispatchEvent(new Event("fullscreenchange"));
  };
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: {
    request: async () => { window.__wl++; return { release: async () => {}, addEventListener() {} }; },
  } });
`;

const FULLSCREEN_DENIED = `
  Element.prototype.requestFullscreen = async function () { throw new Error("denied"); };
  Object.defineProperty(navigator, "wakeLock", { configurable: true, value: undefined });
`;

test.beforeAll(() => resetAndSeed({ guestMenu: true }));

test("kasa ilk ekranı masa haritası; 72 px ray solda, durum şeridi altta", async ({ browser }) => {
  const cashier = await openCashier(browser, "");
  await expect(cashier.getByRole("region", { name: "Masa panosu" })).toBeVisible();
  const rail = await cashier.getByRole("navigation", { name: "Personel bölümleri" }).boundingBox();
  const strip = await cashier.getByRole("contentinfo", { name: "Durum şeridi" }).boundingBox();
  const size = cashier.viewportSize()!;
  expect(Math.round(rail!.width)).toBe(72);
  expect(rail!.x).toBe(0);
  expect(Math.round(strip!.y + strip!.height)).toBe(size.height);
  expect(strip!.width).toBeGreaterThanOrEqual(size.width - 1);
  await expect(cashier.getByText("Ses: Etkinleştirmek için dokunun")).toBeVisible();
  await expect(cashier.getByText("Canlı", { exact: true })).toBeVisible();
  await cashier.context().close();
});

test("'Tam ekranı başlat' tam ekran, uyku kilidi ve sesi tek dokunuşta açar", async ({ browser }) => {
  const cashier = await openCashier(browser, FULLSCREEN_OK);
  await cashier.getByRole("button", { name: "Tam ekranı başlat" }).click();
  await expect.poll(() => cashier.evaluate(() => (window as unknown as { __fs: number }).__fs)).toBe(1);
  await expect.poll(() => cashier.evaluate(() => (window as unknown as { __wl: number }).__wl)).toBe(1);
  await expect(cashier.getByText("Ses: Açık")).toBeVisible();
  await expect(cashier.getByRole("button", { name: "Tam ekranı başlat" })).toHaveCount(0);
  await cashier.context().close();
});

test("tam ekran reddedilir ve uyku kilidi yok: sayfa çalışır, şerit nedeni yazar", async ({ browser }) => {
  const cashier = await openCashier(browser, FULLSCREEN_DENIED);
  await cashier.getByRole("button", { name: "Tam ekranı başlat" }).click();
  await expect(cashier.getByRole("button", { name: "Tam ekran başlatılamadı" })).toBeVisible();
  await expect(cashier.getByText("Uyku kilidi desteklenmiyor")).toBeVisible();
  await expect(cashier.getByRole("region", { name: "Masa panosu" })).toBeVisible();
  await cashier.context().close();
});

test("masa → Onayla: en fazla 2 dokunuş; Reddet sebep akışı; Atanmadı etiketi", async ({ page, browser }) => {
  await sendGuestOrder(page, "Mojito", M1_TOKEN);
  const cashier = await openStaff(browser, "kasa.havuz");
  await expect(tableTile(cashier, "M1")).toContainText("Onay bekliyor · 1");
  await expect(tableTile(cashier, "M1")).toContainText("Atanmadı");

  // 1. dokunuş masa, 2. dokunuş Onayla: sayılan tıklamalar.
  let taps = 0;
  await tableTile(cashier, "M1").click();
  taps++;
  const panel = tablePanel(cashier, "M1");
  await expect(panel.getByRole("button", { name: "Onayla" })).toBeVisible();
  await panel.getByRole("button", { name: "Onayla" }).click();
  taps++;
  await expect(tableTile(cashier, "M1")).toContainText("Hazırlanıyor");
  await expect(panel.getByRole("button", { name: "Onayla" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Fiş yeniden bas" })).toBeVisible();
  expect(taps).toBeLessThanOrEqual(2);

  // İkinci sipariş: Reddet -> sebep diyaloğu -> kart boşalır.
  await sendGuestOrder(page, "Mojito", M1_TOKEN);
  await expect(tableTile(cashier, "M1")).toContainText("Onay bekliyor · 1");
  await panel.getByRole("button", { name: "Reddet" }).click();
  const dialog = cashier.getByRole("dialog", { name: /reddedilecek$/ });
  await dialog.getByLabel("Diğer sebep").fill("misafir vazgeçti");
  await dialog.getByRole("button", { name: "Reddet" }).click();
  await expect(panel.getByRole("button", { name: "Reddet" })).toHaveCount(0);
  await expect(tableTile(cashier, "M1")).not.toContainText("Onay bekliyor");
  await cashier.context().close();
});

test("yazıcı olayı en geç 5 sn içinde şeride yansır", async ({ browser }) => {
  const printerId = await withDb(async (client) => {
    const hotel = await client.query<{ id: string }>("SELECT id FROM hotels WHERE code = 'ROYAL'");
    const id = randomUUID();
    await client.query(
      `INSERT INTO printers (id, hotel_id, name, ip, port, codepage, paper_width, is_active, created_at, updated_at)
       VALUES ($1, $2, 'Kasa yazıcısı', '127.0.0.1', 9100, 'cp857', 80, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, hotel.rows[0].id],
    );
    return id;
  });
  const cashier = await openStaff(browser, "kasa.havuz");
  const heartbeat = (ok: boolean) =>
    cashier.request.post("/api/print-queue/heartbeat", {
      headers: { authorization: `Bearer ${process.env.PRINT_GATEWAY_KEY ?? ""}` },
      data: { hotel: "ROYAL", printers: [{ id: printerId, ok, message: ok ? undefined : "Kağıt bitti" }] },
    });
  // Yazıcı henüz hiç görülmedi ("Bilinmiyor") ve canlı bağlantı açık: ilk "Hazır" olaydan gelir, sayfa yüklemesinden değil.
  await expect(cashier.getByText("Yazıcı: Bilinmiyor")).toBeVisible();
  await expect(cashier.getByText("Canlı", { exact: true })).toBeVisible();
  expect((await heartbeat(true)).ok()).toBeTruthy();
  await expect(cashier.getByText("Yazıcı: Hazır")).toBeVisible({ timeout: 5_000 });
  expect((await heartbeat(false)).ok()).toBeTruthy();
  await expect(cashier.getByText("Yazıcı: Hata")).toBeVisible({ timeout: 5_000 });
  await cashier.context().close();
});

test("yerleşim: 1024x768 harita ve panel yan yana; 768x1024 panel altta, ray alta iner", async ({ page, browser }) => {
  await sendGuestOrder(page, "Mojito", M1_TOKEN);
  const cashier = await openStaff(browser, "kasa.havuz");

  await cashier.setViewportSize({ width: 1024, height: 768 });
  await tableTile(cashier, "M1").click();
  const panel = tablePanel(cashier, "M1");
  await expect(panel).toBeVisible();
  const board = await cashier.getByRole("region", { name: "Masa panosu" }).boundingBox();
  const side = await panel.boundingBox();
  expect(side!.x).toBeGreaterThanOrEqual(board!.x + board!.width - 1);
  expect(Math.abs(side!.width / 1024 - 0.38)).toBeLessThan(0.05);
  expect(await cashier.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await cashier.setViewportSize({ width: 768, height: 1024 });
  const rail = await cashier.getByRole("navigation", { name: "Personel bölümleri" }).boundingBox();
  const strip = await cashier.getByRole("contentinfo", { name: "Durum şeridi" }).boundingBox();
  expect(rail!.y).toBeLessThan(strip!.y);
  expect(rail!.width).toBeGreaterThan(500);
  await expect(cashier.getByRole("dialog", { name: "M1", exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const box = await tablePanel(cashier, "M1").boundingBox();
      return box ? Math.round(box.y + box.height) : Infinity;
    })
    .toBeLessThanOrEqual(Math.round(rail!.y) + 1);
  const sheet = await tablePanel(cashier, "M1").boundingBox();
  expect(sheet!.height / 1024).toBeGreaterThan(0.5);
  await expect(cashier.getByRole("region", { name: "Masa panosu" })).toBeVisible();
  expect(await cashier.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await railLink(cashier, "Masalar").click();
  await cashier.context().close();
});
