import { randomInt } from "node:crypto";
import { expect, login, resetAndSeed, test } from "./fixtures";

test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });
test.beforeAll(() => resetAndSeed({ guestMenu: true }));

async function sendOrder(page: import("@playwright/test").Page) {
  await page.goto("/q/e2e-guest-m1");
  await page.locator("button.g-card", { hasText: "Mojito" }).click();
  await page.getByRole("dialog", { name: "Mojito" }).getByRole("button", { name: "Seçimlere ekle" }).click();
  await page.getByRole("button", { name: /^Seçimlerim/ }).click();
  await page.getByRole("dialog", { name: "Seçimlerim" }).getByRole("button", { name: "Seçimleri gönder" }).click();
  await expect(page).toHaveURL(/\/siparis\/[^/]+$/);
  return page.url();
}

test("kasa masa panosu, kuyruk, çağrı ve iptal akışı", async ({ page, browser }) => {
  await sendOrder(page);
  const cashierContext = await browser.newContext({ baseURL: "http://localhost:3000", locale: "tr-TR", extraHTTPHeaders: { "x-forwarded-for": `10.21.${randomInt(1, 255)}.${randomInt(1, 255)}` } });
  const cashier = await cashierContext.newPage();
  await login(cashier, "kasa.havuz");
  await expect(cashier).toHaveURL(/\/kasa$/);

  await cashier.getByRole("button", { name: "M1 masa ataması" }).click();
  const assignment = cashier.getByRole("dialog", { name: "M1 · Masa ataması" });
  await assignment.getByRole("combobox", { name: "Garson" }).selectOption({ label: "Test garson.havuz" });
  await assignment.getByRole("button", { name: "Ata", exact: true }).click();
  await expect(cashier.getByRole("button", { name: "M1 masa ataması" })).toContainText("Test garson.havuz");

  const call = await page.request.post("/api/q/e2e-guest-m1/call", { data: { type: "GARSON" } });
  expect(call.ok()).toBeTruthy();
  await expect(cashier.getByRole("button", { name: "M1 masa ataması" })).toContainText("🔔", { timeout: 3_000 });

  await cashier.getByRole("navigation", { name: "Personel bölümleri" }).getByRole("link", { name: "Kuyruk" }).click();
  await cashier.getByRole("button", { name: "Onayla" }).click();
  await expect(cashier.getByLabel("Kasa göstergeleri")).toContainText("Bekleyen0");

  const cancelledStatusUrl = await sendOrder(page);
  await cashier.getByRole("navigation", { name: "Personel bölümleri" }).getByRole("link", { name: "Kuyruk" }).click();
  await cashier.getByRole("button", { name: "Onayla" }).click();
  await cashier.getByRole("navigation", { name: "Personel bölümleri" }).getByRole("link", { name: "İptal" }).click();
  await cashier.getByRole("button", { name: "İptal et" }).first().click();
  await cashier.getByRole("dialog", { name: "Siparişi iptal et" }).getByLabel("İptal sebebi").fill("misafir vazgeçti");
  await cashier.getByRole("dialog", { name: "Siparişi iptal et" }).getByRole("button", { name: "İptal et" }).click();
  await cashier.getByRole("alertdialog", { name: "İptal onayı" }).getByRole("button", { name: "Evet, iptal et" }).click();
  await expect(cashier.getByRole("heading", { name: "#2 · M1" })).toHaveCount(0);
  // The guest tab is already on this order URL; reload to fetch the server's updated status.
  expect(page.url()).toBe(cancelledStatusUrl);
  await page.reload();
  await expect(page.getByRole("main")).toContainText("İptal");
  await cashierContext.close();
});
