import type { Locator, Page } from "@playwright/test";
import { expect, login, resetAndSeed, test } from "./fixtures";

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  resetAndSeed();
});

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

const desktop = (page: Page) => page.getByRole("region", { name: "Masaüstü" });

async function openAdmin(page: Page) {
  await login(page, "admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(desktop(page)).toBeVisible();
}

const MR = { name: "Merit Royal", code: "MR" };

/** Başlat → Kurulum Rehberi, then the hotel card (admin has three hotels: a picker shows). */
async function openGuide(page: Page, hotel: { name: string; code: string }): Promise<Locator> {
  await page.getByRole("button", { name: "başlat" }).click();
  await page
    .getByRole("menu", { name: "Başlat menüsü" })
    .getByRole("menuitem", { name: "Kurulum Rehberi", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Kurulum Rehberi", exact: true })
    .getByRole("button", { name: new RegExp(`^${hotel.name}\\s*${hotel.code}$`) })
    .click();
  const win = page.getByRole("region", { name: `Kurulum Rehberi · ${hotel.name}`, exact: true });
  await expect(win).toBeVisible();
  return win;
}

test("Kurulum Rehberi: ilerleme ve adımlar görünür; Katlar adımında Aç → Tanımlamalar Katlar panelinde açılır", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  const win = await openGuide(page, MR);

  await expect(win.getByRole("progressbar", { name: "Kurulum ilerlemesi" })).toBeVisible();
  await expect(win.getByTestId("guide-percent")).toHaveText(/^%\d+$/);
  const steps = win.getByRole("list", { name: "Kurulum adımları" }).getByRole("listitem");
  await expect(steps).toHaveCount(10);
  await expect(steps.first()).toContainText("Otel bilgileri");
  await expect(steps.first().getByRole("img", { name: "Tamamlandı" })).toBeVisible();
  // Product setup arrives with P2: optional and not openable yet.
  const product = steps.filter({ hasText: "Ürün ve minibar setup" });
  await expect(product).toContainText("Zorunlu değil");
  await expect(product.getByRole("button", { name: "Aç" })).toBeDisabled();

  await steps.filter({ hasText: "Katlar" }).getByRole("button", { name: "Aç" }).click();

  const defs = page.getByRole("region", { name: `Tanımlamalar · ${MR.name}`, exact: true });
  await expect(defs).toBeVisible();
  await expect(defs.getByRole("treeitem", { name: "Katlar", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(defs.getByRole("treeitem", { name: "Otel", exact: true })).toHaveAttribute(
    "aria-selected",
    "false",
  );

  expect(errors).toEqual([]);
});

test("Komuta Merkezi: otel başına Kurulum % kartı", async ({ page }) => {
  const errors = trackErrors(page);
  await openAdmin(page);
  await desktop(page).getByRole("button", { name: "Komuta Merkezi", exact: true }).dblclick();
  const win = page.getByRole("region", { name: "Komuta Merkezi", exact: true });
  await expect(win).toBeVisible();

  const card = win.getByRole("list", { name: "Kurulum durumu" });
  await expect(card.getByRole("listitem")).toHaveCount(3);
  await expect(card.getByTestId("setup-MR")).toContainText(MR.name);
  await expect(card.getByTestId("setup-MR")).toContainText(/%\d+/);
  await expect(card.getByRole("progressbar", { name: `${MR.name} kurulum ilerlemesi` })).toBeVisible();

  expect(errors).toEqual([]);
});
