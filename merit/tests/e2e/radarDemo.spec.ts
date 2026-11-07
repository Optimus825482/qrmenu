import { expect, login, resetAndSeed, test } from "./fixtures";

// The demo is client-side only: it needs the seeded hotels for ids, nothing else.
test.use({ locale: "tr-TR" });
test.beforeAll(() => {
  process.env.SEED_MINIBAR = "1";
  try {
    resetAndSeed({ guestMenu: true });
  } finally {
    delete process.env.SEED_MINIBAR;
  }
});

test("Duvar ekranında Demo başlat: rozet görünür, akış dolar, Demo durdur canlıya döner", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/radar");
  const start = page.getByTestId("radar-demo-start");
  await expect(start).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByTestId("radar-demo-badge")).toHaveCount(0);

  await start.click();
  await expect(page.getByTestId("radar-demo-badge")).toBeVisible();
  await expect(page.getByTestId("radar-demo-badge")).toHaveText("DEMO");
  // 10x: the script produces an event roughly every second of real time.
  await expect(page.locator(".rd-ticker-row")).not.toHaveCount(0, { timeout: 20_000 });
  await expect.poll(() => page.locator(".rd-ticker-row").count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);

  await page.getByTestId("radar-demo-stop").click();
  await expect(page.getByTestId("radar-demo-badge")).toHaveCount(0);
  await expect(page.getByTestId("radar-demo-start")).toBeVisible();
});
