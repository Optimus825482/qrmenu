import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { testDb } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

// The SSE listener and the publisher must talk to the test database, not the dev one.
vi.mock("@/lib/env", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/env")>();
  return { env: { ...actual.env, DATABASE_URL: process.env.DATABASE_URL_TEST! } };
});
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { getSetting, getSettings, setSetting } = await import("@/lib/settings");
const { startRealtimeListener, stopRealtimeListener, subscribe } = await import("@/lib/realtime");
const { DEFAULT_SETTINGS } = await import("@/lib/settings-defs");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function admin(hotelCode = "MR") {
  const user = await makeUser({ username: `sys-${hotelCode}`, roleCode: "R-SYS", hotelCode });
  return ctxFor(user, { hotelCode, extraHotelCodes: ["MRD", "MRP"].filter((c) => c !== hotelCode) });
}

async function row(key: string, hotel: string | null) {
  return testDb.setting.findFirst({ where: { key, hotelId: hotel } });
}

let received: MeritEvent[] = [];
let off = () => {};

beforeAll(async () => {
  await resetReferenceData();
  await startRealtimeListener();
});
beforeEach(async () => {
  await resetTestData();
  await testDb.setting.deleteMany({});
  await testDb.auditLog.deleteMany({});
  received = [];
  off();
  off = subscribe(
    (e) => e.type === "settings.changed",
    (e) => received.push(e),
  );
});
afterAll(async () => {
  off();
  await stopRealtimeListener();
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("getSetting", () => {
  it("satır yoksa varsayılan: dnd.minChecks 2", async () => {
    expect(await getSetting("dnd.minChecks")).toBe(2);
    expect(await getSetting("session.idleMinutes", await hotelId("MR"))).toBe(45);
  });

  it("sistem satırı varsayılanı ezer", async () => {
    await testDb.setting.create({ data: { hotelId: null, key: "dnd.minChecks", value: 3 } });
    expect(await getSetting("dnd.minChecks")).toBe(3);
    expect(await getSetting("dnd.minChecks", await hotelId("MR"))).toBe(3);
  });

  it("otel satırı yalnız o otelde sistem satırını ezer", async () => {
    const mr = await hotelId("MR");
    const mrd = await hotelId("MRD");
    await testDb.setting.create({ data: { hotelId: null, key: "dnd.minChecks", value: 3 } });
    await testDb.setting.create({ data: { hotelId: mr, key: "dnd.minChecks", value: 4 } });
    expect(await getSetting("dnd.minChecks", mr)).toBe(4);
    expect(await getSetting("dnd.minChecks", mrd)).toBe(3);
    expect(await getSetting("dnd.minChecks")).toBe(3);
  });

  it("geçersiz saklı değer varsayılana düşer", async () => {
    await testDb.setting.create({ data: { hotelId: null, key: "dnd.minChecks", value: "abc" } });
    expect(await getSetting("dnd.minChecks")).toBe(2);
  });

  it("seed'li sistem satırları varsayılanlarla aynıdır", async () => {
    const { runSeed } = await import("../../prisma/seed");
    await runSeed(testDb);
    const rows = await testDb.setting.findMany({ where: { hotelId: null } });
    expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toEqual(DEFAULT_SETTINGS);
  });
});

describe("getSettings", () => {
  it("birden çok anahtarı otel > sistem > varsayılan sırasıyla çözer", async () => {
    const mr = await hotelId("MR");
    await testDb.setting.create({ data: { hotelId: null, key: "dnd.minChecks", value: 3 } });
    await testDb.setting.create({ data: { hotelId: mr, key: "dnd.recheckMinutes", value: 90 } });
    const got = await getSettings(
      ["dnd.minChecks", "dnd.recheckMinutes", "price.display", "mybar.maxQtyPerItem"],
      mr,
    );
    expect(got).toEqual({
      "dnd.minChecks": 3,
      "dnd.recheckMinutes": 90,
      "price.display": "HIDE",
      "mybar.maxQtyPerItem": "setup",
    });
  });
});

describe("setSetting", () => {
  it("yetkisiz rolde FORBIDDEN ve satır yazılmaz", async () => {
    const user = await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" });
    const ctx = await ctxFor(user, { hotelCode: "MR" });
    await expect(setSetting(ctx, "dnd.minChecks", 5)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await row("dnd.minChecks", null)).toBeNull();
  });

  it("salt-okunur sistem rolü (R-ITT) da FORBIDDEN", async () => {
    const user = await makeUser({ username: "itt1", roleCode: "R-ITT", hotelCode: "MR" });
    const ctx = await ctxFor(user, { hotelCode: "MR" });
    await expect(setSetting(ctx, "dnd.minChecks", 5)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("geçersiz tip VALIDATION; satır yazılmaz", async () => {
    const ctx = await admin();
    await expect(setSetting(ctx, "dnd.minChecks", "abc" as never)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(setSetting(ctx, "dnd.minChecks", 11)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setSetting(ctx, "price.display", "MAYBE" as never)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(setSetting(ctx, "price.currency", "eur" as never)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(setSetting(ctx, "mybar.maxQtyPerItem", 0 as never)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(setSetting(ctx, "no.such.key" as never, 1 as never)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(await testDb.setting.count()).toBe(0);
  });

  it("geçerli özel değerler kabul edilir", async () => {
    const ctx = await admin();
    await setSetting(ctx, "mybar.maxQtyPerItem", 5);
    await setSetting(ctx, "mybar.maxQtyPerItem", "setup");
    await setSetting(ctx, "price.currency", "USD");
    await setSetting(ctx, "qr.baseUrl", "https://menu.example.com");
    expect(await getSetting("price.currency")).toBe("USD");
  });

  it("sistem değeri: oluşturur, sonra aynı satırı günceller (tek satır), audit before/after yazar", async () => {
    const ctx = await admin();
    await setSetting(ctx, "dnd.minChecks", 3);
    await setSetting(ctx, "dnd.minChecks", 4);
    const rows = await testDb.setting.findMany({ where: { key: "dnd.minChecks" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ hotelId: null, value: 4 });
    expect(await getSetting("dnd.minChecks")).toBe(4);

    const logs = await testDb.auditLog.findMany({
      where: { action: "SETTING_UPDATE" },
      orderBy: { createdAt: "asc" },
    });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({
      entity: "Setting",
      entityId: "dnd.minChecks",
      userId: ctx.user.id,
      before: null,
      after: 3,
    });
    expect(logs[1]).toMatchObject({ before: 3, after: 4 });
  });

  it("otel değeri: o otelde geçerli, diğer otelde sistem değeri", async () => {
    const ctx = await admin();
    const mr = await hotelId("MR");
    await setSetting(ctx, "dnd.minChecks", 3);
    await setSetting(ctx, "dnd.minChecks", 4, mr);
    expect(await getSetting("dnd.minChecks", mr)).toBe(4);
    expect(await getSetting("dnd.minChecks", await hotelId("MRD"))).toBe(3);
    expect(await testDb.setting.count({ where: { key: "dnd.minChecks" } })).toBe(2);
  });

  it("kapsam dışı otel için FORBIDDEN", async () => {
    const user = await makeUser({ username: "sys1", roleCode: "R-SYS", hotelCode: "MR" });
    const ctx = await ctxFor(user, { hotelCode: "MR" }); // only MR in scope
    await expect(setSetting(ctx, "dnd.minChecks", 4, await hotelId("MRD"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("settings.changed yayınlar (otel ve sistem kapsamı)", async () => {
    const ctx = await admin();
    const mr = await hotelId("MR");
    await setSetting(ctx, "dnd.minChecks", 3);
    await setSetting(ctx, "dnd.minChecks", 4, mr);
    await vi.waitFor(() => expect(received).toHaveLength(2), { timeout: 2000 });
    expect(received[0]).toMatchObject({ type: "settings.changed", payload: { key: "dnd.minChecks" } });
    expect(received[0].hotelId).toBeUndefined();
    expect(received[1]).toMatchObject({ hotelId: mr, payload: { key: "dnd.minChecks" } });
  });

  it("denetim yazımı başarısız olursa değer ve olay geri alınır (tek transaction)", async () => {
    const ctx = await admin();
    // An unknown userId violates the audit FK, so the whole transaction must roll back.
    const bad = { ...ctx, user: { ...ctx.user, id: "nope" } };
    await expect(setSetting(bad, "dnd.minChecks", 3)).rejects.toBeDefined();
    expect(await row("dnd.minChecks", null)).toBeNull();
    await sleep(150);
    expect(received).toHaveLength(0);
  });
});
