import type { Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

/*
 * Kat Planı window on a tablet: the banner's hotel selector decides whose floors the page lists, on the first
 * load and after every step taken inside the window (into a floor and back to the list).
 * World (SEED_MINIBAR=1): ROYAL has "1. Kat" and "2. Kat", DIAMOND has "3. Kat".
 */
test.describe.configure({ mode: "default" });
test.use({ locale: "tr-TR", viewport: { width: 1280, height: 800 }, hasTouch: true });

test.beforeAll(() => {
  process.env.SEED_MINIBAR = "1";
  try {
    resetAndSeed();
  } finally {
    delete process.env.SEED_MINIBAR;
  }
});

const frameOf = (page: Page) => page.frameLocator('iframe[title="Kat Planı"]');
const floorNames = async (page: Page) =>
  (await frameOf(page).locator('a[href^="/kat/doluluk/"] h3').allInnerTexts()).map((t) => t.trim());

test("otel seçici kat listesini değiştirir ve kattan dönünce seçilen otel kalır", async ({ page }) => {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  // A touch tablet gets the Android shell: the folder on the home screen, then the app.
  await page.getByRole("button", { name: "Minibar Operasyonları" }).click();
  await page.getByRole("button", { name: /Kat Planı/ }).first().click();

  const select = page.locator('[id="mb-hotel-minibar.kat"]');
  await expect(select).toBeVisible();
  const frame = frameOf(page);
  await expect(frame.getByRole("heading", { name: "Kat Planı ve Oda Doluluk Durumu" })).toBeVisible();

  const options = await select.locator("option").evaluateAll((els) =>
    els.map((o) => ({ value: (o as HTMLOptionElement).value, text: o.textContent ?? "" })),
  );
  const royal = options.find((o) => /royal/i.test(o.text) && !/diamond|premium/i.test(o.text))!;
  const diamond = options.find((o) => /diamond/i.test(o.text))!;

  for (const [label, target, expected] of [
    ["ROYAL", royal, ["1. Kat", "2. Kat"]],
    ["DIAMOND", diamond, ["3. Kat"]],
    ["ROYAL-2", royal, ["1. Kat", "2. Kat"]],
  ] as const) {
    await select.selectOption(target.value);
    await expect(select).toHaveValue(target.value);
    await expect(frame.getByRole("heading", { name: "Kat Planı ve Oda Doluluk Durumu" })).toBeVisible();
    await expect.poll(() => floorNames(page), { message: `${label} seçilince katlar` }).toEqual([...expected]);
  }

  // Into a floor of ROYAL and back to the list: the selector still names ROYAL, so must the floors.
  await frame.locator('a[href^="/kat/doluluk/"]').first().click();
  await expect(frame.getByTestId("katlar-geri")).toBeVisible();
  await frame.getByTestId("katlar-geri").click();
  await expect(frame.getByRole("heading", { name: "Kat Planı ve Oda Doluluk Durumu" })).toBeVisible();
  await expect(select).toHaveValue(royal.value);
  await expect.poll(() => floorNames(page), { message: "kattan dönünce katlar" }).toEqual(["1. Kat", "2. Kat"]);

  // The reported trip: back from one floor, into another one. Both screens name the hotel, the links carry it,
  // and the second floor is again ROYAL's.
  await expect(frame.getByTestId("kat-otel-adi")).toHaveText(royal.text.trim());
  const second = frame.locator('a[href^="/kat/doluluk/"]').nth(1);
  await expect(second).toHaveAttribute("href", new RegExp(`hotelId=${royal.value}`));
  await second.click();
  await expect(frame.getByRole("heading", { name: /2\. Kat/ })).toBeVisible();
  await expect(frame.getByTestId("kat-otel-adi")).toHaveText(royal.text.trim());
  await expect(frame.getByTestId("katlar-geri")).toHaveAttribute("href", `/kat?hotelId=${royal.value}`);
  await frame.getByTestId("katlar-geri").click();
  await expect.poll(() => floorNames(page), { message: "ikinci kattan dönünce katlar" }).toEqual(["1. Kat", "2. Kat"]);

  // And the selector keeps working after that trip.
  await select.selectOption(diamond.value);
  await expect.poll(() => floorNames(page), { message: "dönüşten sonra DIAMOND" }).toEqual(["3. Kat"]);
});

/* The shell's own back buttons (app bar arrow, the bar at the bottom) and the tablet's back gesture. */
const listHeading = (page: Page) => frameOf(page).getByRole("heading", { name: "Kat Planı ve Oda Doluluk Durumu" });
const appScreen = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const sysBack = (page: Page) => page.getByRole("navigation", { name: "Sistem gezinmesi" }).getByRole("button", { name: "Geri" });

async function openFloorOfDiamond(page: Page): Promise<void> {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: "Minibar Operasyonları" }).click();
  await page.getByRole("button", { name: /Kat Planı/ }).first().click();
  const select = page.locator('[id="mb-hotel-minibar.kat"]');
  await select.selectOption({ label: "Merit Royal Diamond" });
  await expect.poll(() => floorNames(page)).toEqual(["3. Kat"]);
  await frameOf(page).locator('a[href^="/kat/doluluk/"]').first().click();
  await expect(frameOf(page).getByTestId("katlar-geri")).toBeVisible();
}

async function expectDiamondFloorList(page: Page): Promise<void> {
  await expect(appScreen(page, "Kat Planı")).toBeVisible();
  await expect(listHeading(page)).toBeVisible();
  await expect(page.locator('[id="mb-hotel-minibar.kat"]')).toHaveValue(/.+/);
  await expect(page.locator('[id="mb-hotel-minibar.kat"] option:checked')).toHaveText("Merit Royal Diamond");
  await expect.poll(() => floorNames(page)).toEqual(["3. Kat"]);
}

for (const [name, press] of [
  // Inside a floor the page's own "Katlar" is the only arrow on screen: the app bar hides its own there.
  ["sayfanın Katlar düğmesi, sonra uygulama çubuğundaki Geri", async (page: Page) => {
    const bar = page.locator(".mb-app:not([hidden]) .mb-appbar").getByRole("button", { name: "Geri" });
    const own = frameOf(page).getByTestId("katlar-geri");
    if (await own.isVisible()) {
      await expect(bar).toBeHidden();
      await own.click();
    } else {
      await bar.click();
    }
  }],
  ["alt çubuktaki Geri", (page: Page) => sysBack(page).click()],
  ["tabletin geri hareketi", (page: Page) => page.evaluate(() => window.history.back())],
] as const) {
  test(`kata girdikten sonra ${name} kat listesine döner, sonra klasöre, sonra ana ekrana`, async ({ page }) => {
    await openFloorOfDiamond(page);

    await press(page);
    await expectDiamondFloorList(page);

    await press(page);
    await expect(appScreen(page, "Minibar Operasyonları")).toBeVisible();
    await expect(appScreen(page, "Kat Planı")).toBeHidden();

    await press(page);
    await expect(page.getByRole("main", { name: "Ana ekran" })).toBeVisible();
    await expect(sysBack(page)).toBeDisabled();
    await expect(page).toHaveURL(/\/admin$/);
  });
}

test("kat içindeyken Ana ekran'a basıp uygulamayı yeniden açınca Geri yine adım adım çalışır", async ({ page }) => {
  await openFloorOfDiamond(page);
  await page.getByRole("navigation", { name: "Sistem gezinmesi" }).getByRole("button", { name: "Ana ekran" }).click();
  await expect(page.getByRole("main", { name: "Ana ekran" })).toBeVisible();

  await page.getByRole("button", { name: "Minibar Operasyonları" }).click();
  await expect(appScreen(page, "Minibar Operasyonları")).toBeVisible();
  // The floor's own history entries are walked off in the background; the page then rests on the folder's entry.
  await expect.poll(() => page.evaluate(() => (window.history.state as { mbDepth?: number } | null)?.mbDepth ?? 0)).toBe(1);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => (window.history.state as { mbDepth?: number } | null)?.mbDepth ?? 0)).toBe(1);

  await page.evaluate(() => window.history.back());
  await expect(page.getByRole("main", { name: "Ana ekran" })).toBeVisible();
  await expect(sysBack(page)).toBeDisabled();
  await expect(page).toHaveURL(/\/admin$/);
});

test("kata girdikten sonra otel değiştirip geri basınca eski otelin sayfası geri gelmez", async ({ page }) => {
  await openFloorOfDiamond(page);
  const select = page.locator('[id="mb-hotel-minibar.kat"]');
  await select.selectOption({ label: "Merit Royal" });
  await expect.poll(() => floorNames(page)).toEqual(["1. Kat", "2. Kat"]);

  await page.evaluate(() => window.history.back());
  await page.waitForTimeout(1500);
  // Whatever the step back did (nothing, or a layer of the shell), the window must not show DIAMOND under ROYAL.
  if (await appScreen(page, "Kat Planı").isVisible()) {
    await expect(page.locator('[id="mb-hotel-minibar.kat"] option:checked')).toHaveText("Merit Royal");
    await expect(frameOf(page).getByTestId("kat-otel-adi")).toHaveText("Merit Royal");
    expect(await floorNames(page).catch(() => [])).not.toContain("3. Kat");
  }
});

test("pencerenin alt ekranları oturumun değil seçilen otelin verisini gösterir", async ({ page }) => {
  await login(page, "admin");
  await page.getByRole("button", { name: "Minibar Operasyonları" }).click();
  await page.getByRole("button", { name: /Kat Planı/ }).first().click();
  const select = page.locator('[id="mb-hotel-minibar.kat"]');
  // Both hotels in turn: whichever one the session is on, the other proves the screen follows the selector.
  for (const name of ["Merit Royal", "Merit Royal Diamond"]) {
    await select.selectOption({ label: name });
    await expect(frameOf(page).getByTestId("kat-otel-adi")).toHaveText(name);
    await frameOf(page).locator("body").evaluate(() => window.location.assign("/kat/stok"));
    await expect(frameOf(page).getByRole("heading", { name: `Otel Deposu · ${name}` })).toBeVisible();
    // Back at the list for the next round (the selector re-keys the frame only when the hotel changes).
    await frameOf(page).locator("body").evaluate(() => window.location.assign("/kat"));
    await expect(frameOf(page).getByTestId("kat-otel-adi")).toHaveText(name);
  }
});
