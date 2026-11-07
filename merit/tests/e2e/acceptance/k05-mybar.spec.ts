import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, login, test } from "../fixtures";
import { count, product, room, seedMinibar, setting, sql } from "./helpers/minibar";

async function request(page: Page, number = "101", idempotencyKey = randomUUID()) {
  return page.request.post(`/api/q/${(await room(number)).qr_token}/mybar`, { data: {
    idempotencyKey, locale: "tr", items: [{ productId: await product("Su"), qty: 2 }],
  } });
}

test.describe("@kabul-5 MyBar günlük sınır, canlı onay, eksik kapatma ve iptal yetkisi", () => {
  test.beforeEach(() => seedMinibar());

  test("günlük ikinci talep reddedilir, aynı anahtar aynı kaydı döndürür; sınır kapatılınca yeni talep kabul edilir", async ({ page }) => {
    const key = randomUUID();
    const first = await request(page, "101", key);
    expect(first.status(), await first.text()).toBe(200);
    const firstBody = (await first.json()).data;
    const replay = await request(page, "101", key);
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toMatchObject({ ok: true, data: { requestId: firstBody.requestId, duplicate: true } });
    const second = await request(page);
    expect(second.status(), await second.text()).toBe(409);
    expect(await second.json()).toMatchObject({ ok: false, error: { code: "DAILY_LIMIT", message: "Bugün bu odadan talep gönderildi" } });
    expect(await count("SELECT count(*) AS n FROM mybar_requests")).toBe(1);
    await setting("mybar.dailyLimit", false);
    const allowed = await request(page);
    expect(allowed.status(), await allowed.text()).toBe(200);
    expect(await count("SELECT count(*) AS n FROM mybar_requests")).toBe(2);
  });

  test("talep üç saniyede zorunlu onayda görünür; Gördüm kaydedilir; eksik kapatma kısa açıklamayı reddeder", async ({ page, browser }) => {
    test.setTimeout(120_000);
    await login(page, "kat.mr");
    await expect(page).toHaveURL(/\/kat$/);
    await page.goto("/kat/mybar");
    await expect(page.getByRole("heading", { name: "MyBar Talepleri" })).toBeVisible();
    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      const start = Date.now();
      expect((await request(guestPage)).status()).toBe(200);
      const acknowledgement = page.getByRole("alertdialog");
      await expect(acknowledgement).toContainText("Oda 101", { timeout: Math.max(1, 3000 - (Date.now() - start)) });
      expect(Date.now() - start).toBeLessThanOrEqual(3000);
      await acknowledgement.getByRole("button", { name: "Gördüm" }).click();
      await expect(acknowledgement).toHaveCount(0);
      await expect.poll(async () => (await sql("SELECT seen_at FROM mybar_requests"))[0].seen_at).not.toBeNull();
      const row = page.getByTestId("mybar-row").filter({ hasText: "101" });
      await row.getByRole("button", { expanded: false }).click();
      await expect(row.getByRole("button", { name: /İptal/ })).toHaveCount(0);
      await page.getByRole("button", { name: "Eksiklerle Kapat" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("checkbox").check();
      await dialog.getByLabel("Açıklama").fill("az");
      await expect(dialog.getByRole("button", { name: "Eksik ürünlerle kapat" })).toBeDisabled();
      await dialog.getByLabel("Açıklama").fill("uzunca açıklama");
      await expect(dialog.getByRole("button", { name: "Eksik ürünlerle kapat" })).toBeDisabled();
      await expect(dialog.getByTestId("rule-hint")).toHaveAttribute("data-valid", "false");
      await dialog.getByLabel("Açıklama").fill("misafir ürün istemedi");
      await dialog.getByRole("button", { name: "Eksik ürünlerle kapat" }).click();
      await expect(dialog).toHaveCount(0);
      expect((await sql("SELECT status,closed_with_missing,close_note FROM mybar_requests"))[0]).toMatchObject({ status: "TAMAMLANDI", closed_with_missing: true, close_note: "misafir ürün istemedi" });
    } finally { await guest.close(); }
  });

  test("depo ve yönetimde iptal görünür, gerekçe zorunludur; iptalden sonra aynı gün yeniden talep verilir", async ({ page, browser }) => {
    test.setTimeout(120_000);
    expect((await request(page)).status()).toBe(200);
    await login(page, "depo.mr");
    await expect(page).toHaveURL(/\/depo\/stok$/);
    await page.goto("/depo/mybar");
    const depot = page.getByRole("region", { name: "MyBar Talepleri" });
    await depot.getByRole("row").filter({ hasText: "101" }).click();
    await depot.getByRole("button", { name: "Talebi iptal et" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "İptal et" })).toBeDisabled();
    await dialog.getByLabel("Diğer sebep").fill("misafir odadan ayrıldı");
    await dialog.getByRole("button", { name: "İptal et" }).click();
    await expect(dialog).toHaveCount(0);
    expect((await sql("SELECT status FROM mybar_requests"))[0].status).toBe("IPTAL");
    const renewed = await request(page);
    expect(renewed.status(), await renewed.text()).toBe(200);
    const manager = await browser.newContext();
    try {
      const managerPage = await manager.newPage();
      await login(managerPage, "mudur.mr");
      await managerPage.waitForURL(url => !url.pathname.startsWith("/giris"));
      await managerPage.goto("/depo/mybar");
      const region = managerPage.getByRole("region", { name: "MyBar Talepleri" });
      await region.getByRole("row").filter({ hasText: "101" }).filter({ hasText: "Beklemede" }).click();
      await expect(region.getByRole("button", { name: "Talebi iptal et" })).toBeVisible();
    } finally { await manager.close(); }
  });
});
