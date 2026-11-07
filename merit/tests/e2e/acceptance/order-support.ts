import { randomUUID } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { Client, type QueryResultRow } from "pg";
import { e2eDatabaseUrl } from "../e2eDb";
import { expect, login } from "../fixtures";
import { newContextPage } from "../menuUi";

export async function sql<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  const db = new Client({ connectionString: e2eDatabaseUrl() });
  await db.connect();
  try { return (await db.query<T>(text, values)).rows; } finally { await db.end(); }
}

export async function roomToken(number = "101", hotel = "ROYAL"): Promise<string> {
  return (await sql<{ qr_token: string }>("SELECT r.qr_token FROM rooms r JOIN hotels h ON h.id=r.hotel_id WHERE h.code=$1 AND r.number=$2", [hotel, number]))[0].qr_token;
}

export async function roomOrder(page: Page, number = "101"): Promise<{ id: string; token: string; no: number }> {
  const token = await roomToken(number);
  const [item] = await sql<{ id: string }>("SELECT n.id FROM menu_nodes n JOIN outlets o ON o.id=n.outlet_id JOIN hotels h ON h.id=o.hotel_id WHERE n.name='Çay' AND o.type='ODA_SERVISI' AND h.code='ROYAL'");
  const response = await page.request.post(`/api/q/${token}/order`, { data: { idempotencyKey: randomUUID(), locale: "tr", items: [{ menuNodeId: item.id, qty: 1 }] } });
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json() as { data: { id?: string; orderId?: string } };
  const id = (body.data.id ?? body.data.orderId)!;
  const [row] = await sql<{ order_no: number }>("SELECT order_no FROM orders WHERE id=$1", [id]);
  return { id, token, no: row.order_no };
}

export async function roomStaff(browser: Browser, user: string): Promise<Page> {
  const page = await newContextPage(browser);
  await login(page, user);
  await page.getByRole("button", { name: /^Oda Servisi/ }).click();
  await expect(page).not.toHaveURL(/\/giris/);
  await page.goto("/oda-servisi");
  await expect(page.getByRole("heading", { level: 1, name: /Oda Servisi/ })).toBeVisible();
  return page;
}

export const rsCard = (page: Page, no: number, column: string) => page.locator(`[data-column-id=${column}]`).locator("article").filter({ hasText: new RegExp(`#${no}\\b`) });

/** Keeps the guest status page open throughout the staff chain: each assertion measures live SSE updates. */
export async function deliverRoom(ops: Page, kitchen: Page, guest: Page, order: { id: string; token: string; no: number }, phone: boolean): Promise<void> {
  await guest.goto(`/q/${order.token}/siparis/${order.id}`);
  const step = guest.getByRole("main").locator('li[aria-current="step"]');
  await expect(step).toContainText(phone ? /Teyit/ : /Gönderildi/);
  await ops.reload();
  if (phone) {
    await expect(rsCard(ops, order.no, "CONFIRM").getByRole("button", { name: "Onayla", exact: true })).toBeDisabled();
    await ops.goto("/oda-servisi/teyit");
    await rsCard(ops, order.no, "CONFIRM").getByRole("button", { name: "Telefonla teyit edildi" }).click();
    await ops.getByRole("dialog", { name: "Telefon teyidi" }).getByRole("button", { name: "Teyidi kaydet" }).click();
    await expect(step).toContainText(/Onaylandı|Hazırlanıyor/, { timeout: 3000 });
    await ops.goto("/oda-servisi");
  } else {
    await rsCard(ops, order.no, "NEW").getByRole("button", { name: "Onayla", exact: true }).click();
    await expect(step).toContainText(/Onaylandı|Hazırlanıyor/, { timeout: 3000 });
  }
  await rsCard(kitchen, order.no, "PREP").getByRole("button", { name: "Hazır", exact: true }).click();
  await expect(step).toContainText(/Hazır/, { timeout: 3000 });
  await rsCard(ops, order.no, "READY").getByRole("button", { name: "Yola çıktı", exact: true }).click();
  await expect(step).toContainText(/Yolda/, { timeout: 3000 });
  await rsCard(ops, order.no, "ONWAY").getByRole("button", { name: "Teslim edildi", exact: true }).click();
  await expect(step).toContainText(/Teslim edildi/, { timeout: 3000 });
}
