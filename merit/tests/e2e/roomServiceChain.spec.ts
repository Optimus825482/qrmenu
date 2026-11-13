import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { Browser, Locator, Page } from "@playwright/test";
import { Client } from "pg";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { e2eDatabaseUrl } from "./e2eDb";
import { newContextPage } from "./menuUi";
import { openStaff } from "./opsUi";

/**
 * P6 acceptance chain A-F (plan Task 7): guest order -> staff board -> delivered, cancel,
 * SLA (simulated clock via helpers/run-rs-jobs.ts), scope (MASA vs ODA, KDS) and i18n. One database state for
 * the whole file; order numbers are read back from the database, never counted.
 */
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

test.beforeAll(() => {
  resetAndSeed({ guestMenu: true }); // Havuz Bar (MASA, token e2e-guest-m1) next to the S0 room-service world
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
const sql = (text: string, params: unknown[] = []) => withDb((db) => db.query(text, params));

const roomToken = async (number: string) =>
  (await sql(`SELECT r.qr_token FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE r.number = $1 AND h.code = 'ROYAL'`, [number]))
    .rows[0].qr_token as string;
const teaId = async () =>
  (
    await sql(
      `SELECT n.id FROM menu_nodes n JOIN outlets o ON o.id = n.outlet_id JOIN hotels h ON h.id = o.hotel_id
        WHERE n.name = 'Çay' AND o.type = 'ODA_SERVISI' AND h.code = 'ROYAL'`,
    )
  ).rows[0].id as string;
const orderNo = async (id: string) => (await sql(`SELECT order_no FROM orders WHERE id = $1`, [id])).rows[0].order_no as number;
const setRs = (column: "price_display" | "ordering_enabled" | "kds_enabled" | "printer_id", value: unknown) =>
  sql(
    `UPDATE outlets SET ${column} = ${column === "price_display" ? `$1::"PriceDisplay"` : "$1"} WHERE type = 'ODA_SERVISI' AND hotel_id = (SELECT id FROM hotels WHERE code = 'ROYAL')`,
    [value],
  );

async function guestOrder(page: Page, room = "101"): Promise<{ status: number; id: string; token: string }> {
  const token = await roomToken(room);
  const res = await page.request.post(`/api/q/${token}/order`, {
    data: { idempotencyKey: randomUUID(), items: [{ menuNodeId: await teaId(), qty: 1 }], locale: "tr" },
  });
  const body = (await res.json()) as { data?: { id?: string; orderId?: string } };
  return { status: res.status(), id: (body.data?.id ?? body.data?.orderId) as string, token };
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

type ColumnId = "NEW" | "PREP" | "READY" | "ONWAY";
const cardIn = (page: Page, id: ColumnId, heading: RegExp): Locator =>
  page.locator(`[data-column-id=${id}]`).locator("article", { has: page.getByRole("heading", { level: 3, name: heading }) });
const headingOf = (no: number, room = "101", ext = "4101") => new RegExp(`^#${no} · Oda ${room} · Dahili ${ext}$`);

async function guestStep(guest: Page, token: string, id: string, label: RegExp): Promise<void> {
  await guest.goto(`/q/${token}/siparis/${id}`);
  await expect(guest.getByRole("main").locator('li[aria-current="step"]')).toContainText(label);
}

let ops: Page;
let kitchen: Page;
let fbm: Page;

type Step = "ONAYLANDI" | "HAZIR" | "YOLDA" | "TESLIM";

/** Onayla -> (kitchen) Hazır -> Yola çıktı -> Teslim edildi. `ops`/`kitchen` pages see the order as `heading`. */
async function runToDelivered(heading: RegExp, onStep?: (step: Step) => Promise<void>): Promise<void> {
  await ops.reload();
  await expect(cardIn(ops, "NEW", heading)).toBeVisible({ timeout: 15_000 });
  await cardIn(ops, "NEW", heading).getByRole("button", { name: "Onayla", exact: true }).click();
  await expect(cardIn(ops, "PREP", heading)).toBeVisible();
  await onStep?.("ONAYLANDI");
  await expect(cardIn(kitchen, "PREP", heading)).toBeVisible({ timeout: 15_000 });
  await cardIn(kitchen, "PREP", heading).getByRole("button", { name: "Hazır", exact: true }).click();
  await expect(cardIn(ops, "READY", heading)).toBeVisible({ timeout: 15_000 });
  await onStep?.("HAZIR");
  await cardIn(ops, "READY", heading).getByRole("button", { name: "Yola çıktı", exact: true }).click();
  await expect(cardIn(ops, "ONWAY", heading)).toBeVisible();
  await onStep?.("YOLDA");
  await cardIn(ops, "ONWAY", heading).getByRole("button", { name: "Teslim edildi", exact: true }).click();
  await expect(ops.getByRole("heading", { level: 3, name: heading })).toHaveCount(0);
  await onStep?.("TESLIM");
}

test.beforeAll(async ({ browser }) => {
  ops = await staffPage(browser, "oda.mr");
  kitchen = await staffPage(browser, "mutfak.oda");
  fbm = await staffPage(browser, "fbm.mr");
});

test.afterAll(async () => {
  await ops?.context().close();
  await kitchen?.context().close();
  await fbm?.context().close();
});

test("A: sipariş → onay → hazır → yolda → teslim, misafir her adımı görür; yazıcı yok = fiş ve uyarı yok, fiyat gizli @kabul-8", async ({ page: guest }) => {
  await setRs("price_display", "HIDE");
  const order = await guestOrder(guest);
  expect(order.status).toBe(200);
  const heading = headingOf(await orderNo(order.id));
  await ops.reload();
  await expect(cardIn(ops, "NEW", heading)).toBeVisible({ timeout: 15_000 });
  await expect(cardIn(ops, "NEW", heading)).not.toContainText("€");
  await guestStep(guest, order.token, order.id, /Gönderildi/);

  await runToDelivered(heading, async (step) => {
    const label = { ONAYLANDI: /Onaylandı|Hazırlanıyor/, HAZIR: /Hazır/, YOLDA: /Yolda/, TESLIM: /Teslim edildi/ }[step];
    await guestStep(guest, order.token, order.id, label);
  });

  // No printer defined: no PrintJob and no "printer missing" notification.
  expect((await sql(`SELECT count(*)::int AS n FROM print_jobs WHERE order_id = $1`, [order.id])).rows[0].n).toBe(0);
  expect((await sql(`SELECT count(*)::int AS n FROM notifications WHERE title ILIKE '%yazıcı%'`)).rows[0].n).toBe(0);
});

test("A2: yazıcı tanımlıyken tek fiş üretilir ve fiyat gizliyken fişte subtotal yoktur @kabul-8", async ({ page: guest }) => {
  const printerId = randomUUID();
  await sql(
    `INSERT INTO printers (id, hotel_id, name, ip, port, codepage, paper_width, is_active, created_at, updated_at)
     VALUES ($1, (SELECT id FROM hotels WHERE code = 'ROYAL'), 'Oda servisi yazıcısı', '127.0.0.1', 9100, 'cp857', 80, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [printerId],
  );
  await setRs("printer_id", printerId);
  try {
    const order = await guestOrder(guest);
    expect(order.status).toBe(200);
    const heading = headingOf(await orderNo(order.id));
    await runToDelivered(heading);
    const jobs = await sql(`SELECT payload FROM print_jobs WHERE order_id = $1`, [order.id]);
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0].payload).not.toHaveProperty("subtotal");
  } finally {
    await setRs("printer_id", null);
    await setRs("price_display", "INHERIT");
  }
});

test("C: iptal — onaydan sonra oda.mr iptal edemez, fbm.mr sebepli iptal eder, misafir İptal görür @kabul-8", async ({ page: guest }) => {
  const order = await guestOrder(guest);
  expect(order.status).toBe(200);
  const heading = headingOf(await orderNo(order.id));
  await ops.reload();
  await expect(cardIn(ops, "NEW", heading)).toBeVisible({ timeout: 15_000 });
  await cardIn(ops, "NEW", heading).getByRole("button", { name: "Onayla", exact: true }).click();
  await expect(cardIn(ops, "PREP", heading)).toBeVisible();
  await expect(cardIn(ops, "PREP", heading).getByRole("button", { name: "İptal", exact: true })).toHaveCount(0);

  await fbm.reload();
  const card = cardIn(fbm, "PREP", heading);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button", { name: "İptal", exact: true }).click();
  const dialog = fbm.getByRole("dialog");
  await dialog.getByRole("button", { name: "Stok yok" }).click();
  await dialog.getByRole("button", { name: "İptal et" }).click();
  await expect(fbm.getByRole("heading", { level: 3, name: heading })).toHaveCount(0);

  await guest.goto(`/q/${order.token}/siparis/${order.id}`);
  await expect(guest.getByRole("main").getByText(/iptal edildi/i).first()).toBeVisible();
  const row = (await sql(`SELECT status::text AS status FROM orders WHERE id = $1`, [order.id])).rows[0];
  expect(row.status).toBe("IPTAL");
});

test("D: SLA — rs.slaMinutes=1, simüle saatle aşım bildirimi; ikinci çalıştırma yenisini üretmez @kabul-8", async ({ page: guest }) => {
  const root = path.resolve(__dirname, "../..");
  const runJobs = (now: Date): { sla: { warned: number; breached: number } } =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [path.join(root, "node_modules/tsx/dist/cli.mjs"), path.join(__dirname, "helpers/run-rs-jobs.ts"), now.toISOString(), "--only=sla"],
        { cwd: root, env: { ...process.env, E2E_DATABASE_URL: e2eDatabaseUrl() } },
      )
        .toString()
        .trim()
        .split("\n")
        .pop()!,
    );
  const breachCount = async (orderId: string) =>
    (await sql(`SELECT count(*)::int AS n FROM notifications WHERE type = 'order.sla.breach' AND ref_id = $1`, [orderId])).rows[0].n as number;

  await sql(
    `INSERT INTO settings (id, hotel_id, key, value, created_at, updated_at)
     VALUES ($1, (SELECT id FROM hotels WHERE code = 'ROYAL'), 'rs.slaMinutes', '1'::jsonb, now(), now())
     ON CONFLICT (hotel_id, key) DO UPDATE SET value = '1'::jsonb`,
    [randomUUID()],
  );
  try {
    const order = await guestOrder(guest);
    expect(order.status).toBe(200);
    const heading = headingOf(await orderNo(order.id));
    await ops.reload();
    await expect(cardIn(ops, "NEW", heading)).toBeVisible({ timeout: 15_000 });

    const later = new Date(Date.now() + 2 * 60_000);
    expect(runJobs(later).sla.breached).toBe(1);
    const first = await breachCount(order.id);
    expect(first).toBeGreaterThanOrEqual(1);
    const fbmUser = (await sql(`SELECT id FROM users WHERE username = 'fbm.mr'`)).rows[0].id as string;
    const mine = await sql(`SELECT title FROM notifications WHERE type = 'order.sla.breach' AND ref_id = $1 AND user_id = $2`, [order.id, fbmUser]);
    expect(mine.rows).toHaveLength(1);
    expect(mine.rows[0].title).toContain("Oda servisi SLA aşıldı");

    await fbm.reload();
    await expect(fbm.getByTestId("bell-badge")).toBeVisible({ timeout: 15_000 });

    // Second sweep: nothing new.
    expect(runJobs(new Date(later.getTime() + 60_000)).sla.breached).toBe(0);
    expect(await breachCount(order.id)).toBe(first);

    await runToDelivered(heading);
  } finally {
    await sql(`DELETE FROM settings WHERE key = 'rs.slaMinutes' AND hotel_id = (SELECT id FROM hotels WHERE code = 'ROYAL')`);
  }
});

test("E: kapsam — MASA siparişi oda servisi panosunda yok; ODA siparişi /kds ve /garson kuyruğunda yok; alım kapalıyken 409 @kabul-8", async ({ page: guest, browser }) => {
  // A MASA order of Havuz Bar (guest table token of the seed).
  const mojito = (await sql(`SELECT id FROM menu_nodes WHERE name = 'Mojito' LIMIT 1`)).rows[0].id as string;
  const masa = await guest.request.post(`/api/q/e2e-guest-m1/order`, {
    data: { idempotencyKey: randomUUID(), locale: "tr", items: [{ menuNodeId: mojito, qty: 1 }] },
  });
  expect(masa.status()).toBe(200);

  const order = await guestOrder(guest);
  expect(order.status).toBe(200);
  const heading = headingOf(await orderNo(order.id));
  await ops.reload();
  await expect(cardIn(ops, "NEW", heading)).toBeVisible({ timeout: 15_000 });
  await expect(ops.locator("[data-column-id]").getByText(/Mojito|M1/)).toHaveCount(0);
  await cardIn(ops, "NEW", heading).getByRole("button", { name: "Onayla", exact: true }).click();
  await expect(cardIn(ops, "PREP", heading)).toBeVisible();

  // Even with the KDS switched on for the room-service outlet, its approved ODA order never reaches /kds.
  await setRs("kds_enabled", true);
  try {
    await fbm.goto("/kds");
    await expect(fbm.locator("[data-kds-board]")).toBeVisible();
    await expect(fbm.locator("[data-kds-board]")).not.toContainText(/Çay|Oda 101|Masa yok/);
  } finally {
    await setRs("kds_enabled", false);
  }
  const waiter = await openStaff(browser, "garson.havuz");
  await waiter.goto("/garson");
  await expect(waiter.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(waiter.locator("body")).not.toContainText(/Oda 101|Çay/);
  await waiter.context().close();

  // Finish the order (it is already approved: kitchen -> ready -> on the way -> delivered).
  await expect(cardIn(kitchen, "PREP", heading)).toBeVisible({ timeout: 15_000 });
  await cardIn(kitchen, "PREP", heading).getByRole("button", { name: "Hazır", exact: true }).click();
  await expect(cardIn(ops, "READY", heading)).toBeVisible({ timeout: 15_000 });
  await cardIn(ops, "READY", heading).getByRole("button", { name: "Yola çıktı", exact: true }).click();
  await cardIn(ops, "ONWAY", heading).getByRole("button", { name: "Teslim edildi", exact: true }).click();
  await expect(ops.getByRole("heading", { level: 3, name: heading })).toHaveCount(0);

  // Ordering switched off: submission is refused (409), the status page of the existing order stays open.
  await setRs("ordering_enabled", false);
  try {
    expect((await guestOrder(guest)).status).toBe(409);
    await guest.goto(`/q/${order.token}/siparis/${order.id}`);
    await expect(guest.getByRole("main").locator('li[aria-current="step"]')).toContainText(/Teslim edildi/);
  } finally {
    await setRs("ordering_enabled", true);
  }
});

test("F: ?lang=de — Almanca durum başlıkları aynı zincirde @kabul-8", async ({ page: guest }) => {
  const order = await guestOrder(guest);
  expect(order.status).toBe(200);
  const heading = headingOf(await orderNo(order.id));
  await guest.goto(`/q/${order.token}?lang=de`); // the room page stores the language choice
  await expect(guest.locator("html")).toHaveAttribute("lang", "de");
  await guestStep(guest, order.token, order.id, /Gesendet/);

  await runToDelivered(heading, async (step) => {
    const label = { ONAYLANDI: /Wird zubereitet/, HAZIR: /Wird zubereitet/, YOLDA: /Unterwegs/, TESLIM: /Geliefert/ }[step];
    await guestStep(guest, order.token, order.id, label);
  });
});
