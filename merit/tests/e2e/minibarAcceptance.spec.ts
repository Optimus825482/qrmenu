import { randomInt, randomUUID } from "node:crypto";
import { Client } from "pg";
import type { APIResponse, Browser, BrowserContext } from "@playwright/test";
import { e2eDatabaseUrl } from "./e2eDb";
import { expect, login, resetAndSeed, test } from "./fixtures";
import { buildStandardXlsx } from "../helpers/xlsx";

/*
 * Minibar acceptance (kabul 4 and 6): occupancy upload -> tasks -> room check +N -> pool -> Sarfiyat Yok -> DND.
 * UI independent on purpose: every step goes through the signed-in session's API; the pages are only smoke-loaded.
 */
test.describe.configure({ mode: "serial" });
test.use({ locale: "tr-TR" });

const STD_HEADERS = ["Room no", "Arrival", "Departure", "Adult", "Arr.Time", "Dep.Time"];

const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Nicosia" });
const shift = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const excelDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
const one = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> =>
  withDb(async (c) => (await c.query<T>(sql, params)).rows[0]);
const count = async (sql: string, params: unknown[] = []): Promise<number> =>
  Number((await one<{ n: string }>(sql, params)).n);

type Ids = { rooms: Record<string, string>; su: string; kola: string; mini: string; diamondToken: string; royalToken: string };
let ids: Ids;
let baseURL: string;
let browser: Browser;
const ctxs: Record<string, BrowserContext> = {};

async function signIn(username: string): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL,
    locale: "tr-TR",
    extraHTTPHeaders: { "x-forwarded-for": `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}` },
  });
  const page = await context.newPage();
  await login(page, username);
  await page.waitForURL((url) => !url.pathname.startsWith("/giris"), { timeout: 30_000 });
  await page.close();
  return context;
}

const json = async (res: APIResponse): Promise<any> => res.json(); // eslint-disable-line @typescript-eslint/no-explicit-any
const get = async (c: BrowserContext, url: string) => c.request.get(url);
const post = async (c: BrowserContext, url: string, data?: unknown) => c.request.post(url, data === undefined ? {} : { data });

async function sheet(rows: (string | number | Date | null)[][]) {
  return buildStandardXlsx(rows, STD_HEADERS);
}
const upload = (c: BrowserContext, path: string, kind: string, name: string, buffer: Buffer) =>
  c.request.post(path, {
    multipart: {
      kind,
      file: { name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer },
    },
  });

async function poolQty(name: string): Promise<number> {
  const body = await json(await get(ctxs.depo, "/api/minibar/depo/stock"));
  const row = body.stockItems.find((s: { productName: string }) => s.productName === name);
  return row.quantity;
}
async function taskItems(filter?: string) {
  const body = await json(await get(ctxs.kat, `/api/minibar/tasks${filter ? `?filter=${filter}` : ""}`));
  return body as { summary: { total: number; completed: number }; items: { roomNumber: string; status: string; taskType: string }[] };
}
const itemStatus = async (room: string): Promise<string[]> =>
  (await taskItems()).items.filter((i) => i.roomNumber === room).map((i) => i.status);

test.beforeAll(async ({ browser: b, baseURL: base }) => {
  test.setTimeout(240_000);
  browser = b;
  baseURL = base ?? process.env.E2E_BASE_URL ?? "http://localhost:3000";
  process.env.SEED_MINIBAR = "1";
  try {
    resetAndSeed();
  } finally {
    delete process.env.SEED_MINIBAR; // the worker is shared with the other specs
  }
  ids = await withDb(async (c) => {
    const rooms: Record<string, string> = {};
    for (const r of (await c.query<{ id: string; number: string }>(
      "SELECT r.id, r.number FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE h.code = 'ROYAL'",
    )).rows) {
      rooms[r.number] = r.id;
    }
    const q = async (sql: string) => (await c.query<{ v: string }>(sql)).rows[0].v;
    return {
      rooms,
      su: await q("SELECT id AS v FROM products WHERE name = 'Su'"),
      kola: await q("SELECT id AS v FROM products WHERE name = 'Kola'"),
      mini: await q("SELECT id AS v FROM setups WHERE name = 'MINI'"),
      diamondToken: await q("SELECT r.qr_token AS v FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE h.code = 'DIAMOND' LIMIT 1"),
      royalToken: await q("SELECT qr_token AS v FROM rooms WHERE number = '101'"),
    };
  });
  ctxs.depo = await signIn("depo.mr");
  ctxs.kat = await signIn("kat.mr");
  ctxs.kat2 = await signIn("kat2.mr");
});

test.afterAll(async () => {
  await Promise.all(Object.values(ctxs).map((c) => c.close()));
});

test("1. depo üç Excel'i önizleyip yükler; kat sorumlusu görev bildirimi alır @kabul-6", async () => {
  const files = {
    IN_HOUSE: await sheet([
      ["101", excelDate(shift(today, -2)), excelDate(shift(today, 3)), 2, null, null],
      ["102", excelDate(shift(today, -2)), excelDate(shift(today, 3)), 2, null, null],
      ["103", excelDate(shift(today, -1)), excelDate(shift(today, 2)), 1, null, null],
      ["104", excelDate(shift(today, -1)), excelDate(shift(today, 4)), 2, null, null],
      ["201", excelDate(shift(today, -3)), excelDate(shift(today, 2)), 2, null, null],
    ]),
    ARRIVAL: await sheet([
      ["202", excelDate(today), excelDate(shift(today, 3)), 2, "13:00", null],
      ["203", excelDate(today), excelDate(shift(today, 2)), 2, "15:00", null],
    ]),
    DEPARTURE: await sheet([
      ["202", excelDate(shift(today, -2)), excelDate(today), 2, null, "11:00"],
      ["204", excelDate(shift(today, -4)), excelDate(today), 2, null, "12:00"],
    ]),
  } as const;
  const expected = { IN_HOUSE: 5, ARRIVAL: 2, DEPARTURE: 2 } as const;

  for (const kind of ["IN_HOUSE", "ARRIVAL", "DEPARTURE"] as const) {
    const name = `${kind.toLowerCase()}.xlsx`;
    const preview = await upload(ctxs.depo, "/api/minibar/occupancy/preview", kind, name, files[kind]);
    expect(preview.status(), await preview.text()).toBe(200);
    const pv = await json(preview);
    expect(pv).toMatchObject({ okRows: expected[kind], errorRows: 0, detectedKind: kind });
    // the preview writes nothing
    expect(await count("SELECT count(*) AS n FROM occupancy_uploads WHERE kind = $1", [kind])).toBe(0);

    const res = await upload(ctxs.depo, "/api/minibar/occupancy/upload", kind, name, files[kind]);
    expect(res.status(), await res.text()).toBe(200);
    // tasks are generated once all three files of the day are in
    expect(await json(res)).toMatchObject({ okRows: expected[kind], errorRows: 0, tasksGenerated: kind === "DEPARTURE" });
    if (kind !== "DEPARTURE") expect((await taskItems()).items).toHaveLength(0);
  }

  const tasks = await taskItems();
  expect(tasks.items.map((i) => i.roomNumber).sort()).toEqual(
    ["101", "102", "103", "104", "201", "202", "203", "202", "204"].sort(),
  );
  expect(tasks.summary).toMatchObject({ total: 9, completed: 0 });
  expect(
    await count(
      `SELECT count(*) AS n FROM notifications n JOIN users u ON u.id = n.user_id
        WHERE u.username = 'kat.mr' AND n.type = 'task.generated'`,
    ),
  ).toBeGreaterThanOrEqual(1);
  expect(
    await count(`SELECT count(*) AS n FROM upload_tasks WHERE status = 'TAMAMLANDI' AND upload_id IS NOT NULL`),
  ).toBe(3);
});

test("2. öncelik planı çakışma odasını ilk sıraya koyar @kabul-6", async () => {
  const plan = await json(await get(ctxs.kat, "/api/minibar/priority-plan"));
  expect(plan.entries.length).toBeGreaterThan(0);
  expect(plan.entries[0]).toMatchObject({ roomNumber: "202", rank: 1 });
  expect(plan.entries[0].clash).toMatchObject({ critical: true });
  expect(plan.summary.clashes).toBe(1);
});

test("3. 101'de Su +2: kalem tamamlanır, havuz 2 azalır; işlem silinince hepsi geri döner @kabul-4", async () => {
  const before = await poolQty("Su");
  expect(before).toBe(100);
  expect(await itemStatus("101")).toEqual(["BEKLIYOR"]);

  const res = await post(ctxs.kat, `/api/minibar/room/${ids.rooms["101"]}/check`, {
    items: [{ productId: ids.su, setupId: ids.mini, qty: 2 }],
    clientRequestId: randomUUID(),
  });
  expect(res.status(), await res.text()).toBe(200);
  const body = await json(res);
  expect(body).toMatchObject({ added: 2, taskCompleted: true });
  expect(await itemStatus("101")).toEqual(["TAMAMLANDI"]);
  expect(await poolQty("Su")).toBe(before - 2);

  const del = await ctxs.kat.request.delete(`/api/minibar/my-checks/${body.transactionId}`);
  expect(del.status(), await del.text()).toBe(200);
  expect(await poolQty("Su")).toBe(before);
  expect(await itemStatus("101")).toEqual(["BEKLIYOR"]);
  expect(await count("SELECT count(*) AS n FROM minibar_transactions WHERE id = $1", [body.transactionId])).toBe(0);
});

test("4. aynı clientRequestId ağ tekrarı tek düşüm yapar @kabul-4", async () => {
  const before = await poolQty("Kola");
  const rid = randomUUID();
  const payload = { items: [{ productId: ids.kola, setupId: ids.mini, qty: 1 }], clientRequestId: rid };
  const first = await post(ctxs.kat, `/api/minibar/room/${ids.rooms["201"]}/check`, payload);
  const second = await post(ctxs.kat, `/api/minibar/room/${ids.rooms["201"]}/check`, payload);
  expect(first.status(), await first.text()).toBe(200);
  expect(second.status(), await second.text()).toBe(200);
  expect((await json(first)).transactionId).toBe((await json(second)).transactionId);
  expect(await json(second)).toMatchObject({ replayed: true });
  expect(await poolQty("Kola")).toBe(before - 1);
  expect(await count("SELECT count(*) AS n FROM minibar_transactions WHERE client_request_id = $1", [rid])).toBe(1);
});

test("5. Sarfiyat Yok 102: kalem tamamlanır, depoya 'Sarfiyat yok — Oda 102' bildirimi gider @kabul-4", async () => {
  const res = await post(ctxs.kat, `/api/minibar/room/${ids.rooms["102"]}/no-consumption`, { clientRequestId: randomUUID() });
  expect(res.status(), await res.text()).toBe(200);
  expect(await json(res)).toMatchObject({ taskCompleted: true, replayed: false });
  expect(await itemStatus("102")).toEqual(["TAMAMLANDI"]);
  expect(
    await count(
      `SELECT count(*) AS n FROM notifications n JOIN users u ON u.id = n.user_id
        WHERE u.username = 'depo.mr' AND n.title = 'Sarfiyat yok — Oda 102'`,
    ),
  ).toBe(1);
});

test("6. DND: 103'te iki farklı personel kalemi tamamlar; 104'te tek işaret AKTIF kalır @kabul-4", async () => {
  const first = await post(ctxs.kat, `/api/minibar/room/${ids.rooms["103"]}/dnd`, {});
  expect(first.status(), await first.text()).toBe(200);
  expect(await json(first)).toMatchObject({ count: 1, completed: false });
  const second = await post(ctxs.kat2, `/api/minibar/room/${ids.rooms["103"]}/dnd`, {});
  expect(second.status(), await second.text()).toBe(200);
  expect(await json(second)).toMatchObject({ count: 2, completed: true });
  expect(await itemStatus("103")).toEqual(["TAMAMLANDI"]);

  const single = await post(ctxs.kat, `/api/minibar/room/${ids.rooms["104"]}/dnd`, {});
  expect(single.status(), await single.text()).toBe(200);
  expect(await json(single)).toMatchObject({ count: 1, completed: false });
  expect(await itemStatus("104")).toEqual(["DND_BEKLIYOR"]);

  const active = await json(await get(ctxs.kat, "/api/minibar/dnd?onlyActive=true"));
  expect(active.map((r: { roomNumber: string }) => r.roomNumber)).toEqual(["104"]);
  expect(active[0]).toMatchObject({ status: "AKTIF", count: 1 });
  const all = await json(await get(ctxs.kat, "/api/minibar/dnd"));
  expect(all.find((r: { roomNumber: string }) => r.roomNumber === "103")).toMatchObject({ status: "TAMAMLANDI", count: 2 });
});

test("7. başka otelin odasının QR'ı FORBIDDEN; kendi otelinin QR'ı odayı çözer", async () => {
  const foreign = await post(ctxs.kat, "/api/minibar/qr/resolve", { text: ids.diamondToken });
  expect(foreign.status()).toBe(403);
  expect(await json(foreign)).toMatchObject({ code: "FORBIDDEN" });
  const own = await post(ctxs.kat, "/api/minibar/qr/resolve", { text: `http://localhost/q/${ids.royalToken}` });
  expect(own.status(), await own.text()).toBe(200);
  expect(await json(own)).toMatchObject({ number: "101", roomId: ids.rooms["101"] });
});

test("8. depo panosu: üç yükleme, görev özeti, fiyatsız", async () => {
  const res = await get(ctxs.depo, "/api/minibar/depo/dashboard");
  expect(res.status(), await res.text()).toBe(200);
  const pano = await json(res);
  expect(pano.doneCount).toBe(3);
  expect(pano.uploads.map((u: { kind: string; done: boolean }) => [u.kind, u.done])).toEqual([
    ["IN_HOUSE", true],
    ["ARRIVAL", true],
    ["DEPARTURE", true],
  ]);
  expect(pano.tasks).toMatchObject({ total: 9, completed: 3, dnd: 1 });
  expect(pano.openDnd).toBe(1);
  expect(pano.criticalCount).toBe(0);
  expect(JSON.stringify(pano)).not.toMatch(/price/i);
  // the floor supervisor may read the pool cards of the session hotel but never reaches a foreign hotel
  expect((await get(ctxs.kat, "/api/minibar/depo/dashboard")).status()).toBe(200);
});

test("9. sayfalar açılır (smoke); kat sorumlusu doluluk yüklemeyi açamaz", async () => {
  const open = async (context: BrowserContext, path: string) => {
    const page = await context.newPage();
    const response = await page.goto(path);
    const url = page.url();
    await page.close();
    return { status: response?.status(), url };
  };
  for (const path of ["/depo", "/depo/gorevler"]) {
    const r = await open(ctxs.depo, path);
    expect(r.status, path).toBe(200);
    expect(new URL(r.url).pathname, path).toBe(path);
  }
  for (const path of ["/kat/stok", "/kat/gorevler", "/kat/dnd"]) {
    const r = await open(ctxs.kat, path);
    expect(r.status, path).toBe(200);
    expect(new URL(r.url).pathname, path).toBe(path);
  }

  const page = await ctxs.depo.newPage();
  await page.goto("/depo/gorevler");
  await expect(page.getByTestId("depo-gorevler-summary")).toBeVisible();
  await expect(page.getByTestId("depo-gorevler-item")).toHaveCount(9);
  await page.close();

  const blocked = await open(ctxs.kat, "/depo/doluluk-yukle");
  expect(new URL(blocked.url).pathname).toBe("/yetkisiz"); // the repo guard (requireScreen) explains the missing screen; no staff page opens
  expect((await ctxs.kat.request.post("/api/minibar/occupancy/preview", { multipart: { kind: "IN_HOUSE", file: { name: "x.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("x") } } })).status()).toBe(403);
});
