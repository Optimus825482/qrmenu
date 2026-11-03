import { expect, login, resetAndSeed, test } from "./fixtures";
import { expectNoHorizontalScroll } from "./matrix/a11y";
import { newContextPage } from "./menuUi";
import { RADAR_VIEWPORTS, expectRadarAxeClean } from "./radarUi";

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

for (const viewport of RADAR_VIEWPORTS) {
  test(`Duvar ekranı (/radar) dönüş, wakeLock, ses kapısı ve erişilebilirlik (${viewport.width}x${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      (window as unknown as { __wakeLockCalls: number }).__wakeLockCalls = 0;
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: {
          request: async () => {
            (window as unknown as { __wakeLockCalls: number }).__wakeLockCalls++;
            return { release: async () => undefined };
          },
        },
      });
    });

    await login(page, "mudur.mr");
    await page.goto("/radar?duvar=1&sure=5&gorunumler=genel,kat,masa&otel=ROYAL");

    const banner = page.getByRole("banner", { name: "Duvar ekranı üst çubuğu" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Merit Royal");

    // Sound button is visible on the wall screen
    const soundBtn = banner.getByRole("button", { name: "Ses" });
    await expect(soundBtn).toBeVisible();

    // Click "Tam ekran başlat" -> wakeLock.request is called once
    await banner.getByRole("button", { name: "Tam ekran başlat" }).click();
    const calls = await page.evaluate(() => (window as unknown as { __wakeLockCalls: number }).__wakeLockCalls);
    expect(calls).toBe(1);

    // Mouse move pauses rotation -> "Dönüş duraklatıldı"
    await page.mouse.move(200, 200);
    await expect(banner).toContainText("Dönüş duraklatıldı");

    await expectNoHorizontalScroll(page);
    await expectRadarAxeClean(page, `radar-duvar-${viewport.width}`);
  });
}

test("Yetkisiz rol (kat.mr) /radar sayfasında 'Bu ekran sana atanmadı' görür", async ({ browser }) => {
  const katPage = await newContextPage(browser);
  await login(katPage, "kat.mr");
  await katPage.goto("/radar");
  await expect(katPage.getByText(/Bu ekran sana atanmadı/i)).toBeVisible();
});
