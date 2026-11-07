import { randomInt } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { SHOTS } from "./shots";
import { appWindow } from "../definitionsUi";

const out = path.resolve(__dirname, "../../../../docs/kilavuz/img");
let table = "";
let room = "";
let unseen = 0;

test.beforeAll(async () => {
  const url = process.env.GUIDE_DATABASE_URL;
  if (!url || !process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 10) {
    throw new Error("GUIDE_DATABASE_URL ve DEMO_PASSWORD eğitim ortamından verilmelidir");
  }
  const parsed = new URL(url);
  if (!/_(egitim|demo)$/.test(parsed.pathname) || !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw new Error("Kılavuz yalnız yerel ve ayrı eğitim/demo veritabanında çekilir");
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    table = (await client.query(`SELECT t.qr_token FROM outlet_tables t JOIN outlets o ON o.id=t.outlet_id
      JOIN hotels h ON h.id=o.hotel_id WHERE h.code='ROYAL' AND o.name='Havuz Bar' ORDER BY t.label LIMIT 1`)).rows[0]?.qr_token;
    room = (await client.query(`SELECT r.qr_token FROM rooms r JOIN hotels h ON h.id=r.hotel_id
      WHERE h.code='ROYAL' AND r.number='102'`)).rows[0]?.qr_token;
    unseen = Number((await client.query(`SELECT count(*) AS n FROM mybar_requests m JOIN hotels h ON h.id=m.hotel_id
      WHERE h.code='ROYAL' AND m.status='BEKLEMEDE' AND m.seen_at IS NULL`)).rows[0].n);
    if (!table || !room) throw new Error("Eğitim seed'i eksik: masa/oda QR bulunamadı");
  } finally { await client.end(); }
  await mkdir(out, { recursive: true });
});

for (const shot of SHOTS) {
  test(`${shot.guide}/${shot.id}`, async ({ page, context }) => {
    await page.setViewportSize(shot.viewport);
    await context.setExtraHTTPHeaders({ "x-forwarded-for": `10.126.${randomInt(1, 255)}.${randomInt(1, 255)}` });
    if (shot.user) {
      await page.goto("/giris");
      await page.getByLabel("Kullanıcı adı").fill(shot.user);
      await page.getByLabel("Şifre").fill(process.env.DEMO_PASSWORD!);
      await page.getByRole("button", { name: "Giriş Yap" }).click();
      const target = page.getByRole("button", { name: new RegExp(shot.target ?? "Merit Royal") }).first();
      await expect.poll(async () => !/\/(giris|secim)$/.test(new URL(page.url()).pathname) || await target.isVisible()).toBe(true);
      if (/\/(giris|secim)$/.test(new URL(page.url()).pathname)) {
        await target.click();
        await expect(page).not.toHaveURL(/\/(giris|secim)(\?|$)/);
      }
    }
    const route = shot.path.replace("{table}", table).replace("{room}", room);
    const lang = new URL(route, "http://localhost").searchParams.get("lang") ?? "tr";
    await context.addCookies([{ name: "merit_lang", value: lang, url: process.env.BASE_URL ?? "http://localhost:3100" }]);
    await page.goto(route);
    await expect(page).not.toHaveURL(/\/(giris|yetkisiz|secim)(\?|$)/);
    if (shot.guide === "kat-sorumlusu" && unseen > 0) {
      // Read/acknowledge synthetic demo alerts through the real UI before showing another screen.
      for (let n = 0; n < unseen; n++) {
        await page.getByRole("alertdialog").getByRole("button", { name: "Gördüm", exact: true }).click();
      }
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      unseen = 0;
    }
    if (shot.app) await appWindow(page, shot.app, shot.hotel);
    if (shot.prepare) await shot.prepare(page);
    await expect(page.getByText(/yükleniyor/i)).toHaveCount(0);
    if (shot.guide === "kat-sorumlusu" && shot.id === "stok") {
      await expect(page.getByTestId("stok-tablo").locator("tbody tr").first()).toBeVisible();
    }
    await expect(page.locator("body")).not.toContainText("Application error");
    if (shot.user && !(shot.guide === "yonetici" && shot.id === "mobil")) {
      await expect(page.getByTestId("env-label").first()).toBeVisible();
    }
    await page.evaluate(() => document.fonts.ready);
    const mask = [page.locator('input[type="password"], time, .xp-clock, .staff-session-banner, [data-testid="session-clock"]'),
      ...(shot.mask ?? []).map((s) => page.locator(s))];
    const options = { path: path.join(out, `${shot.guide}-${shot.id}.png`), mask, animations: "disabled" as const, scale: "css" as const };
    if (shot.clip) await page.locator(shot.clip).screenshot(options);
    else await page.screenshot(options);
  });
}
