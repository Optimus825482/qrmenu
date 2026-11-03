import { spawn } from "node:child_process";
import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { e2eDatabaseUrl } from "./e2eDb";
import { newContextPage } from "./menuUi";
import { approveOrder, openStaff, sendGuestOrder } from "./opsUi";
import { RADAR_VIEWPORTS, expectRadarAxeClean, openRadar, radarTab, radarToolbar } from "./radarUi";

// Animasyonlu gösterim katmanı (RD-13): sahne, anahtar, reduced-motion, duvar sorgusu ve kare süresi.
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
const WALL_URL = "/radar?duvar=1&sure=300&gorunumler=masa&otel=ROYAL";

const layer = (page: Page): Locator => page.locator(".rd-motion");
const sprite = (page: Page, kind: string): Locator => page.locator(`.rd-motion [data-kind="${kind}"]`);
const motionSwitch = (scope: Page | Locator): Locator => scope.getByRole("button", { name: "Animasyon", exact: true });

async function openMasa(page: Page): Promise<Locator> {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  const win = await openRadar(page);
  await radarToolbar(win).getByRole("combobox", { name: "Otel" }).selectOption({ label: MR_NAME });
  await radarTab(win, "Masa").click();
  await win.getByRole("combobox", { name: "Outlet" }).selectOption({ label: "Havuz Bar" });
  return win;
}

test("Sipariş akışı sahnede görünür: onay, hazırlanıyor ve hazır tepsisi 3 sn içinde kaybolur", async ({ page, browser }) => {
  await page.setViewportSize(RADAR_VIEWPORTS[0]);
  const win = await openMasa(page);

  // Varsayılan açık: anahtar basılı, katman DOM'da ve ekran okuyucudan gizli.
  await expect(motionSwitch(radarToolbar(win))).toHaveAttribute("aria-pressed", "true");
  await expect(layer(page)).toHaveCount(1);
  await expect(layer(page)).toHaveAttribute("aria-hidden", "true");

  const guest = await newContextPage(browser);
  const order = await sendGuestOrder(guest);
  const cashier = await openStaff(browser, "kasa.havuz");
  await approveOrder(cashier, order.orderNo);
  await expect(sprite(page, "order.flow").first()).toBeAttached({ timeout: 2_000 });

  const kitchen = await openStaff(browser, "kds.havuz");
  const card = (column: string) =>
    kitchen
      .getByRole("region", { name: column, exact: true })
      .getByRole("article")
      .filter({ hasText: new RegExp(`#${order.orderNo}\\b`) });
  await expect(card("Yeni")).toBeVisible();
  await card("Yeni").getByRole("button", { name: "Başla" }).click();
  await expect(card("Hazırlanıyor")).toBeVisible();
  await card("Hazırlanıyor").getByRole("button", { name: "Hazır" }).click();

  // Hazır: mutfaktan masaya tepsi 2 sn içinde belirir, 3 sn içinde kaybolur.
  await expect(sprite(page, "order.ready")).toBeAttached({ timeout: 2_000 });
  await expectRadarAxeClean(page, "radar-animasyon");
  await expect(sprite(page, "order.ready")).toHaveCount(0, { timeout: 3_000 });

  // Katman yalnız şekil taşır: fiyat, ad veya not yok.
  const text = (await layer(page).textContent()) ?? "";
  expect(text).not.toMatch(/[€₺]|price|name|note/i);

  await kitchen.context().close();
  await cashier.context().close();
  await guest.context().close();
});

test("Animasyon anahtarı katmanı kapatır, tercih kalıcıdır", async ({ page }) => {
  await page.setViewportSize(RADAR_VIEWPORTS[0]);
  const win = await openMasa(page);
  const toggle = motionSwitch(radarToolbar(win));
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(layer(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem("merit.u.radar.motion"))).toBe("0");

  // Sayfa yenilenince kapalı kalır.
  await page.reload();
  const again = await openRadar(page);
  await radarToolbar(again).getByRole("combobox", { name: "Otel" }).selectOption({ label: MR_NAME });
  await radarTab(again, "Masa").click();
  await expect(motionSwitch(radarToolbar(again))).toHaveAttribute("aria-pressed", "false");
  await expect(layer(page)).toHaveCount(0);

  await motionSwitch(radarToolbar(again)).click();
  await expect(motionSwitch(radarToolbar(again))).toHaveAttribute("aria-pressed", "true");
  await expect(layer(page)).toHaveCount(1);
  expect(await page.evaluate(() => window.localStorage.getItem("merit.u.radar.motion"))).toBe("1");
});

test("Hareketi azalt ayarında katman kapalıdır ve anahtar kilitlidir", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(RADAR_VIEWPORTS[0]);
  const win = await openMasa(page);
  const toggle = motionSwitch(radarToolbar(win));
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(layer(page)).toHaveCount(0);
});

test("Duvar ekranında ?motion= sorgusu katmanı yönetir", async ({ page }) => {
  await page.setViewportSize(RADAR_VIEWPORTS[1]);
  await login(page, "mudur.mr");
  await page.waitForURL((url) => !url.pathname.startsWith("/giris"));

  await page.goto(`${WALL_URL}&motion=0`);
  await expect(page.getByRole("banner", { name: "Duvar ekranı üst çubuğu" })).toBeVisible();
  await expect(motionSwitch(page)).toHaveAttribute("aria-pressed", "false");
  await expect(layer(page)).toHaveCount(0);

  await page.goto(`${WALL_URL}&motion=1`);
  await expect(motionSwitch(page)).toHaveAttribute("aria-pressed", "true");
  await expect(layer(page)).toHaveCount(1);
});

test("Duvar ekranı 1920x1080: 10 sn simülatör yükünde ortalama kare süresi 20 ms altında", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(RADAR_VIEWPORTS[1]);
  await login(page, "mudur.mr");
  await page.waitForURL((url) => !url.pathname.startsWith("/giris"));
  await page.goto(`${WALL_URL}&motion=1`);
  await page.getByRole("combobox", { name: "Outlet" }).selectOption({ label: "Havuz Bar" });
  await expect(layer(page)).toHaveCount(1);

  // T12 simülatörü, sahne kipinde: masa yaşam döngüleri, çağrılar, oda kontrolleri.
  const root = path.resolve(__dirname, "../..");
  const sim = spawn(
    process.execPath,
    [path.join(root, "node_modules/tsx/dist/cli.mjs"), "scripts/radar-sim.ts", "--hotel", "ROYAL", "--rate", "20", "--duration", "25", "--scene"],
    { cwd: root, env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() }, stdio: "inherit" },
  );
  try {
    // Sahnenin dolması için ısınma, sonra 10 sn ölçüm.
    await expect.poll(async () => page.locator(".rd-motion [data-kind]").count(), { timeout: 20_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(2_000);
    const stats = await page.evaluate(
      () =>
        new Promise<{ frames: number; meanMs: number; p95Ms: number; maxMs: number; peakSprites: number }>((resolve) => {
          const deltas: number[] = [];
          let last = performance.now();
          const start = last;
          let peak = 0;
          const tick = (t: number) => {
            deltas.push(t - last);
            last = t;
            peak = Math.max(peak, document.querySelectorAll(".rd-motion [data-kind]").length);
            if (t - start < 10_000) requestAnimationFrame(tick);
            else {
              deltas.shift();
              const sorted = [...deltas].sort((a, b) => a - b);
              resolve({
                frames: deltas.length,
                meanMs: deltas.reduce((a, b) => a + b, 0) / deltas.length,
                p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
                maxMs: sorted[sorted.length - 1] ?? 0,
                peakSprites: peak,
              });
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(`[radar-motion] kare süresi: ${JSON.stringify(stats)}`);
    test.info().annotations.push({ type: "kare-suresi", description: JSON.stringify(stats) });
    expect(stats.frames).toBeGreaterThan(300);
    expect(stats.meanMs).toBeLessThanOrEqual(20);
    expect(stats.peakSprites).toBeLessThanOrEqual(120);
    await expectRadarAxeClean(page, "radar-duvar-animasyon");
  } finally {
    sim.kill();
  }
});
