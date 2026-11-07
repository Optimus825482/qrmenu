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

test("Duvar ekranında Demo başlat: modül seçilir, rozet görünür, akış dolar, Demo durdur canlıya döner", async ({ page }) => {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/radar");
  const start = page.getByTestId("radar-demo-start");
  await expect(start).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByTestId("radar-demo-badge")).toHaveCount(0);

  await start.click();
  const dialog = page.getByRole("dialog", { name: "Demo senaryosu" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Minibar").check();
  await dialog.getByRole("button", { name: "Başlat" }).click();
  await expect(page.getByTestId("radar-demo-badge")).toHaveText("DEMO · Minibar");
  // 10x: the script produces an event roughly every second of real time.
  await expect.poll(() => page.locator(".rd-ticker-row").count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);

  await page.getByTestId("radar-demo-stop").click();
  await expect(page.getByTestId("radar-demo-badge")).toHaveCount(0);
  await expect(page.getByTestId("radar-demo-start")).toBeVisible();
});

test("Masaüstü klasöründen Canlı Radar: Demo başlat → Oda Servisi seçilir, görünüm açılır, Demo durdur öncekini geri koyar", async ({
  page,
}) => {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  const desktop = page.getByRole("region", { name: "Masaüstü" });
  await desktop.getByRole("button", { name: "Operasyon Radarı", exact: true }).dblclick();
  const folder = page.getByRole("region", { name: "Operasyon Radarı", exact: true });
  await expect(folder).toBeVisible();
  await folder.getByRole("button", { name: /^Canlı Radar/ }).click();
  const win = page.getByRole("region", { name: /^Canlı Radar · / }).first();
  await expect(win).toBeVisible();
  const toolbar = win.getByRole("toolbar", { name: "Radar araç çubuğu" });
  await expect(win).toHaveAccessibleName("Canlı Radar · Tüm kompleks");

  // "Tüm kompleks": both buttons are usable.
  const start = toolbar.getByTestId("radar-demo-start");
  await expect(start).toBeEnabled({ timeout: 20_000 });
  await expect(toolbar.getByRole("button", { name: "Animasyon" })).toBeEnabled();

  await start.click();
  const dialog = win.getByRole("dialog", { name: "Demo senaryosu" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(3);
  await dialog.getByLabel("Oda Servisi").check();
  await dialog.getByRole("button", { name: "Başlat" }).click();

  await expect(toolbar.getByTestId("radar-demo-badge")).toHaveText("DEMO · Oda Servisi", { timeout: 20_000 });
  await expect(toolbar.getByRole("tab", { name: "Oda Servisi", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(toolbar.getByRole("combobox", { name: "Otel" })).not.toHaveValue("ALL");
  await expect.poll(() => win.locator(".rd-ticker-row").count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);

  await toolbar.getByTestId("radar-demo-stop").click();
  await expect(toolbar.getByTestId("radar-demo-badge")).toHaveCount(0);
  await expect(toolbar.getByRole("combobox", { name: "Otel" })).toHaveValue("ALL");
  await expect(win).toHaveAccessibleName("Canlı Radar · Tüm kompleks");
});
