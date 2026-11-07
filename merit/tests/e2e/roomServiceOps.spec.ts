import { randomUUID } from "node:crypto";
import type { Browser, Locator, Page } from "@playwright/test";
import { Client } from "pg";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { e2eDatabaseUrl, loadInHouse, setPhoneConfirm } from "./e2eDb";
import { newContextPage } from "./menuUi";

// One database state for the whole file: the S0 room-service world (ROYAL rooms 101 ext 4101 / 102 no extension,
// menu "Çay" 25). Order numbers count up through the file (#1, #2, ...).
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

test.beforeAll(() => {
  resetAndSeed();
});

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const roomToken = (number: string) =>
  withDb(async (db) => {
    const { rows } = await db.query<{ qr_token: string }>(
      `SELECT r.qr_token FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE r.number = $1 AND h.code = 'ROYAL'`,
      [number],
    );
    return rows[0].qr_token;
  });

const teaId = () =>
  withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      `SELECT n.id FROM menu_nodes n JOIN outlets o ON o.id = n.outlet_id JOIN hotels h ON h.id = o.hotel_id
        WHERE n.name = 'Çay' AND o.type = 'ODA_SERVISI' AND h.code = 'ROYAL'`,
    );
    return rows[0].id;
  });

/** Guest API call: one Çay for the room; resolves to the HTTP status and the new order id (when created). */
async function guestOrder(page: Page, roomNumber: string): Promise<{ status: number; id?: string; token: string }> {
  const token = await roomToken(roomNumber);
  const res = await page.request.post(`/api/q/${token}/order`, {
    data: { idempotencyKey: randomUUID(), items: [{ menuNodeId: await teaId(), qty: 1 }], locale: "tr" },
  });
  const body = (await res.json()) as { data?: { id?: string; orderId?: string } };
  return { status: res.status(), id: body.data?.id ?? body.data?.orderId, token };
}

async function staffPage(browser: Browser, username: string, path = "/oda-servisi"): Promise<Page> {
  const page = await newContextPage(browser);
  await login(page, username);
  await page.getByRole("button", { name: /^Oda Servisi/ }).click();
  await expect(page).not.toHaveURL(/\/giris/);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: /Oda Servisi/ })).toBeVisible();
  return page;
}

type ColumnId = "CONFIRM" | "NEW" | "PREP" | "READY" | "ONWAY";
const column = (page: Page, id: ColumnId): Locator => page.locator(`[data-column-id=${id}]`);
const cardIn = (page: Page, id: ColumnId, heading: RegExp): Locator =>
  column(page, id).locator("article", { has: page.getByRole("heading", { level: 3, name: heading }) });

async function guestStep(guest: Page, token: string, orderId: string, label: RegExp): Promise<void> {
  await guest.goto(`/q/${token}/siparis/${orderId}`);
  await expect(guest.getByRole("main").locator('li[aria-current="step"]')).toContainText(label);
}

let ops: Page;
let kitchen: Page;

test.afterAll(async () => {
  await ops?.context().close();
  await kitchen?.context().close();
  await setPhoneConfirm("ROYAL", false);
});

test("oda.mr: Yeni → Onayla → mutfak Hazır → Yola çıktı → Teslim edildi, misafir durumu her adımı yansıtır", async ({ browser, page: guest }) => {
  ops = await staffPage(browser, "oda.mr");
  kitchen = await staffPage(browser, "mutfak.oda");

  const order = await guestOrder(guest, "101");
  expect(order.status).toBe(200);
  expect(order.id).toBeTruthy();

  const heading101 = /^#1 · Oda 101 · Dahili 4101$/;
  await expect(cardIn(ops, "NEW", heading101)).toBeVisible({ timeout: 15_000 });
  await guestStep(guest, order.token, order.id!, /Gönderildi/);

  await cardIn(ops, "NEW", heading101).getByRole("button", { name: "Onayla", exact: true }).click();
  await expect(cardIn(ops, "PREP", heading101)).toBeVisible();
  await guestStep(guest, order.token, order.id!, /Onaylandı|Hazırlanıyor/);

  await expect(cardIn(kitchen, "PREP", heading101)).toBeVisible({ timeout: 15_000 });
  await cardIn(kitchen, "PREP", heading101).getByRole("button", { name: "Hazır", exact: true }).click();
  await expect(cardIn(kitchen, "READY", heading101)).toBeVisible();
  await expect(cardIn(ops, "READY", heading101)).toBeVisible({ timeout: 15_000 });
  await guestStep(guest, order.token, order.id!, /Hazır/);

  await cardIn(ops, "READY", heading101).getByRole("button", { name: "Yola çıktı", exact: true }).click();
  await expect(cardIn(ops, "ONWAY", heading101)).toBeVisible();
  await guestStep(guest, order.token, order.id!, /Yolda/);

  await cardIn(ops, "ONWAY", heading101).getByRole("button", { name: "Teslim edildi", exact: true }).click();
  await expect(ops.getByRole("heading", { level: 3, name: heading101 })).toHaveCount(0);
  await guestStep(guest, order.token, order.id!, /Teslim edildi/);
});

test("dahilisiz oda 102 ve doluluk: \"Dahili tanımlı değil\"; yalnız 102 dolu → 101 \"Oda boş görünüyor\"", async ({ page: guest }) => {
  const order = await guestOrder(guest, "102");
  expect(order.status).toBe(200);
  const heading102 = /^#2 · Oda 102 · Dahili tanımlı değil$/;
  await ops.reload();
  const card102 = cardIn(ops, "NEW", heading102);
  await expect(card102).toBeVisible({ timeout: 15_000 });
  await expect(card102).toContainText("Dahili tanımlı değil");
  await expect(card102).not.toContainText("Oda boş görünüyor");

  const second = await guestOrder(guest, "101");
  expect(second.status).toBe(200);
  const heading101 = /^#3 · Oda 101 · Dahili 4101$/;

  // Only room 102 is in house: 101 reads as empty, 102 does not.
  await loadInHouse("ROYAL", ["102"]);
  await ops.reload();
  await expect(cardIn(ops, "NEW", heading101)).toContainText("Oda boş görünüyor");
  await expect(cardIn(ops, "NEW", heading102)).not.toContainText("Oda boş görünüyor");

  // No occupancy data at all: nothing is flagged.
  await loadInHouse("ROYAL", []);
  await ops.reload();
  await expect(cardIn(ops, "NEW", heading101)).toBeVisible();
  await expect(ops.getByText("Oda boş görünüyor")).toHaveCount(0);
});

test("teyit varyantı: sipariş Teyit sütununda, Onayla pasif; Telefonla teyit edildi → Hazırlanıyor", async ({ page: guest }) => {
  await setPhoneConfirm("ROYAL", true);
  await ops.reload();

  const order = await guestOrder(guest, "101");
  expect(order.status).toBe(200);
  const heading = /^#4 · Oda 101 · Dahili 4101$/;
  const confirmCard = cardIn(ops, "CONFIRM", heading);
  await expect(confirmCard).toBeVisible({ timeout: 15_000 });
  await expect(confirmCard.getByRole("button", { name: "Onayla", exact: true })).toBeDisabled();
  await expect(confirmCard).toContainText("Önce telefonla teyit edin");
  await guestStep(guest, order.token, order.id!, /Teyit/);

  // The dedicated Teyit tab renders the same board; the phone confirmation is recorded there
  // (the same page object: a second login of oda.mr would end this session).
  await ops.goto("/oda-servisi/teyit");
  const teyitCard = cardIn(ops, "CONFIRM", heading);
  await expect(teyitCard).toBeVisible();
  await teyitCard.getByRole("button", { name: "Telefonla teyit edildi" }).click();
  await ops.getByRole("dialog", { name: "Telefon teyidi" }).getByRole("button", { name: "Teyidi kaydet" }).click();
  await expect(cardIn(ops, "CONFIRM", heading)).toHaveCount(0);
  await ops.goto("/oda-servisi");

  // Phone confirmation approves the order (ONAYLANDI): it leaves Teyit and shows up under Hazırlanıyor.
  await expect(cardIn(ops, "PREP", heading)).toBeVisible({ timeout: 15_000 });
  await expect(cardIn(ops, "CONFIRM", heading)).toHaveCount(0);
  await expect(cardIn(ops, "PREP", heading).getByRole("button", { name: "Hazır", exact: true })).toBeEnabled();
  await setPhoneConfirm("ROYAL", false);
});

test("sipariş alımı kapatılınca misafir gönderimi 409 döner; açılınca yeniden 200", async ({ page: guest }) => {
  const toggle = kitchen.getByRole("switch", { name: "Sipariş alımı" });
  await kitchen.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  const blocked = await guestOrder(guest, "101");
  expect(blocked.status).toBe(409);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  const reopened = await guestOrder(guest, "101");
  expect(reopened.status).toBe(200);
});
