import { randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser, BrowserContext } from "@playwright/test";
import { Client, type QueryResultRow } from "pg";
import { e2eDatabaseUrl } from "../../e2eDb";
import { login, resetAndSeed } from "../../fixtures";

export const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Nicosia" });
export async function sql<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const db = new Client({ connectionString: e2eDatabaseUrl() });
  await db.connect();
  try { return (await db.query<T>(text, params)).rows; } finally { await db.end(); }
}
export async function count(text: string, params: unknown[] = []): Promise<number> {
  return Number((await sql<{ n: string }>(text, params))[0].n);
}
export function seedMinibar() {
  const previous = process.env.SEED_MINIBAR;
  process.env.SEED_MINIBAR = "1";
  try { resetAndSeed(); } finally {
    if (previous === undefined) delete process.env.SEED_MINIBAR;
    else process.env.SEED_MINIBAR = previous;
  }
}
export async function signIn(browser: Browser, baseURL: string, username: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}` } });
  const page = await context.newPage();
  await login(page, username);
  await page.waitForURL(url => !url.pathname.startsWith("/giris"), { timeout: 30_000 });
  await page.close();
  return context;
}
export async function room(number: string) {
  return (await sql<{ id: string; qr_token: string }>("SELECT r.id,r.qr_token FROM rooms r JOIN hotels h ON h.id=r.hotel_id WHERE h.code='ROYAL' AND r.number=$1", [number]))[0];
}
export async function product(name: string) {
  return (await sql<{ id: string }>("SELECT id FROM products WHERE name=$1", [name]))[0].id;
}
export async function upload(context: BrowserContext, file: string, kind: string, preview = false) {
  return context.request.post(`/api/minibar/occupancy/${preview ? "preview" : "upload"}`, { multipart: {
    kind, file: { name: path.basename(file), mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await readFile(file) },
  } });
}
/** Fixture-only setting change; each HTTP request reads the effective value anew. */
export async function setting(key: string, value: unknown) {
  await sql("DELETE FROM settings WHERE key=$1", [key]);
  await sql("INSERT INTO settings(id,hotel_id,key,value,updated_at) SELECT gen_random_uuid()::text,id,$1,$2::jsonb,now() FROM hotels WHERE code='ROYAL'", [key, JSON.stringify(value)]);
}
