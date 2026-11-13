import type { Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

/*
 * Kat Planı window on a tablet: the banner's hotel selector decides whose floors the page lists, on the first
 * load and after every step taken inside the window (into a floor and back to the list).
 * World (SEED_MINIBAR=1): ROYAL has "1. Kat" and "2. Kat", DIAMOND has "3. Kat".
 */
test.describe.configure({ mode: "serial" });
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
