import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateQrToken, isSignedToken } from "@/lib/qr";
import { createRateLimiter } from "@/lib/rate-limit";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { globalLegacyTokenLimiter, legacyTokenLimiter, rateLimitDelay, resolveGuestToken, resolveGuestTokenLimited } =
  await import("@/modules/menu/server/guestToken");

/** Generous legacy budgets for tests that are about the general limits only. */
const looseLegacy = () => ({
  perIp: createRateLimiter({ max: 10_000, windowMs: 60_000 }),
  global: createRateLimiter({ max: 10_000, windowMs: 60_000 }),
});

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.qrScanLog.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await resetTestData();
  await testDb.qrScanLog.deleteMany({});
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
  rateLimitDelay.ms = 0;
  legacyTokenLimiter.clear();
  globalLegacyTokenLimiter.clear();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const meta = { ip: "10.1.1.1", userAgent: "vitest" };

async function tableFixture(over: { outlet?: Record<string, unknown>; table?: Record<string, unknown> } = {}) {
  const outlet = await testDb.outlet.create({
    data: { hotelId: await hotelId("ROYAL"), name: "Havuz Bar", type: "BAR", hasMenu: true, ...over.outlet },
  });
  const area = await testDb.outletAreaDefinition.create({ data: { outletId: outlet.id, type: "KAPALI" } });
  const created = await testDb.outletTable.create({ data: { outletId: outlet.id, areaId: area.id, label: "M1", ...over.table } });
  const token = generateQrToken("TABLE", created.id);
  const table = await testDb.outletTable.update({ where: { id: created.id }, data: { qrToken: token } });
  return { outlet, table, token };
}

describe("resolveGuestToken", () => {
  it("geçerli masa: TABLE, QrScanLog ok=true ve scan.table", async () => {
    const { table, outlet, token } = await tableFixture();
    const result = await resolveGuestToken(token, meta);
    expect(result).toMatchObject({
      kind: "TABLE",
      table: { id: table.id, label: "M1" },
      state: { outletId: outlet.id, menuOpen: true },
    });
    const logs = await testDb.qrScanLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ tableId: table.id, kind: "MISAFIR", ok: true, ip: meta.ip, userAgent: "vitest" });
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "scan.table", outletId: outlet.id, payload: { tableId: table.id, tableLabel: "M1" } }),
    );
  });

  it("{ log: false }: çözümler ama QrScanLog yazmaz ve scan.table yayınlamaz", async () => {
    const { table, token } = await tableFixture();
    expect(await resolveGuestToken(token, meta, { log: false })).toMatchObject({ kind: "TABLE", table: { id: table.id } });
    expect(await resolveGuestToken("yok-boyle-token", meta, { log: false })).toEqual({
      kind: "NONE",
      reason: "BILINMEYEN",
    });
    expect(await testDb.qrScanLog.count()).toBe(0);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("imzasız (eski) token da DB araması ile çözülür", async () => {
    const { table } = await tableFixture();
    await testDb.outletTable.update({ where: { id: table.id }, data: { qrToken: "eski-token-1" } });
    expect((await resolveGuestToken("eski-token-1", meta)).kind).toBe("TABLE");
  });

  it("pasif masa: MASA_PASIF, log ok=false, olay yok", async () => {
    const { token, table } = await tableFixture({ table: { isActive: false } });
    expect(await resolveGuestToken(token, meta)).toEqual({ kind: "NONE", reason: "MASA_PASIF" });
    expect(await testDb.qrScanLog.findFirst()).toMatchObject({ tableId: table.id, ok: false, error: "MASA_PASIF" });
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("pasif outlet, pasif otel, modül kapalı", async () => {
    const a = await tableFixture({ outlet: { isActive: false } });
    expect(await resolveGuestToken(a.token, meta)).toEqual({ kind: "NONE", reason: "OUTLET_PASIF" });
    await testDb.outlet.update({ where: { id: a.outlet.id }, data: { isActive: true } });
    await testDb.hotel.update({ where: { code: "ROYAL" }, data: { isActive: false } });
    expect(await resolveGuestToken(a.token, meta)).toEqual({ kind: "NONE", reason: "OTEL_PASIF" });
    await testDb.hotel.update({ where: { code: "ROYAL" }, data: { isActive: true } });
    await testDb.hotelModule.updateMany({
      where: { hotelId: await hotelId("ROYAL"), moduleKey: "QR_MENU" },
      data: { enabled: false },
    });
    expect(await resolveGuestToken(a.token, meta)).toEqual({ kind: "NONE", reason: "MENU_KAPALI" });
    const logs = await testDb.qrScanLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => [l.ok, l.error])).toEqual([
      [false, "OUTLET_PASIF"],
      [false, "OTEL_PASIF"],
      [false, "MENU_KAPALI"],
    ]);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("oda tokenı: ROOM", async () => {
    const hid = await hotelId("ROYAL");
    const floor = await testDb.floor.create({ data: { hotelId: hid, number: 1, name: "1. Kat" } });
    const room = await testDb.room.create({
      data: { hotelId: hid, floorId: floor.id, number: "101", qrToken: "123456" },
    });
    expect(await resolveGuestToken("123456", meta)).toEqual({ kind: "ROOM", roomId: room.id, hotelId: hid });
    expect(await testDb.qrScanLog.findFirst()).toMatchObject({ roomId: room.id, ok: true, kind: "MISAFIR" });
  });

  it("bilinmeyen token: BILINMEYEN + log; biçimsiz token ('../x', boş, 65 karakter) DB sorgusuz", async () => {
    expect(await resolveGuestToken("yok-boyle-token", meta)).toEqual({ kind: "NONE", reason: "BILINMEYEN" });
    expect(await testDb.qrScanLog.findFirst()).toMatchObject({ tableId: null, ok: false, error: "BILINMEYEN" });
    const tableFind = vi.spyOn(testDb.outletTable, "findUnique");
    const roomFind = vi.spyOn(testDb.room, "findUnique");
    expect(await resolveGuestToken("../x", meta)).toEqual({ kind: "NONE", reason: "BILINMEYEN" });
    expect(await resolveGuestToken("", meta)).toEqual({ kind: "NONE", reason: "BILINMEYEN" });
    expect(await resolveGuestToken("a".repeat(65), meta)).toEqual({ kind: "NONE", reason: "BILINMEYEN" });
    expect(tableFind).not.toHaveBeenCalled();
    expect(roomFind).not.toHaveBeenCalled();
    tableFind.mockRestore();
    roomFind.mockRestore();
  });
});

describe("resolveGuestToken iç hata", () => {
  it("DB hatasında NONE/HATA döner, tarama logu yazmaz", async () => {
    const spy = vi.spyOn(testDb.outletTable, "findUnique").mockRejectedValueOnce(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await resolveGuestToken("gecerli-bicim", meta)).toEqual({ kind: "NONE", reason: "HATA" });
      expect(err).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      err.mockRestore();
    }
    expect(await testDb.qrScanLog.count()).toBe(0);
  });
});

describe("resolveGuestTokenLimited", () => {
  it("bilinmeyen 61. deneme aynı IP: RATE_LIMITED; başka IP (geçerli token dahil) etkilenmez", async () => {
    const limiter = createRateLimiter({ max: 60, windowMs: 60_000 });
    const global = createRateLimiter({ max: 600, windowMs: 60_000 });
    const legacy = looseLegacy();
    for (let i = 0; i < 60; i++) {
      expect(await resolveGuestTokenLimited(`yok-${i}`, meta, limiter, global, {}, legacy)).toEqual({
        kind: "NONE",
        reason: "BILINMEYEN",
      });
    }
    expect(await resolveGuestTokenLimited("yok-61", meta, limiter, global, {}, legacy)).toEqual({
      kind: "NONE",
      reason: "RATE_LIMITED",
    });
    expect(await testDb.qrScanLog.count()).toBe(60); // refused attempts do not flood the log
    expect(await resolveGuestTokenLimited("yok-x", { ...meta, ip: "10.9.9.9" }, limiter, global, {}, legacy)).toMatchObject({
      reason: "BILINMEYEN",
    });
    const { token } = await tableFixture();
    expect((await resolveGuestTokenLimited(token, { ...meta, ip: "10.8.8.8" }, limiter)).kind).toBe("TABLE");
  });

  it("sınırı aşan IP: imzalı geçerli token çözülür (log + scan.table); bilinmeyen/biçimsiz RATE_LIMITED (log yok, olay yok)", async () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });
    const globalLimiter = createRateLimiter({ max: 600, windowMs: 60_000 });
    for (let i = 0; i < 2; i++) await resolveGuestTokenLimited(`yok-${i}`, meta, limiter, globalLimiter);
    expect(limiter.peek(meta.ip).allowed).toBe(false);
    await testDb.qrScanLog.deleteMany({});
    const { token, table } = await tableFixture();
    expect((await resolveGuestTokenLimited(token, meta, limiter, globalLimiter)).kind).toBe("TABLE");
    expect(await testDb.qrScanLog.findMany()).toMatchObject([{ tableId: table.id, ok: true }]);
    expect(publishMock).toHaveBeenCalledTimes(1);

    await testDb.qrScanLog.deleteMany({});
    publishMock.mockReset();
    expect(await resolveGuestTokenLimited("yok-61", meta, limiter, globalLimiter)).toEqual({
      kind: "NONE",
      reason: "RATE_LIMITED",
    });
    expect(await resolveGuestTokenLimited("../x", meta, limiter, globalLimiter)).toMatchObject({
      reason: "RATE_LIMITED",
    });
    expect(await testDb.qrScanLog.count()).toBe(0);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("sınırı aşan IP: eski imzasız token DB'de olsa bile RATE_LIMITED, findUnique çağrılmaz", async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    await resolveGuestTokenLimited("yok-0", meta, limiter);
    const { table } = await tableFixture();
    await testDb.outletTable.update({ where: { id: table.id }, data: { qrToken: "eski-token-1" } });
    await testDb.qrScanLog.deleteMany({});
    const tableFind = vi.spyOn(testDb.outletTable, "findUnique");
    const roomFind = vi.spyOn(testDb.room, "findUnique");
    try {
      expect(await resolveGuestTokenLimited("eski-token-1", meta, limiter)).toEqual({
        kind: "NONE",
        reason: "RATE_LIMITED",
      });
      expect(tableFind).not.toHaveBeenCalled();
      expect(roomFind).not.toHaveBeenCalled();
    } finally {
      tableFind.mockRestore();
      roomFind.mockRestore();
    }
    expect(await testDb.qrScanLog.count()).toBe(0);
  });

  it("sınırı aşan IP: imzalı biçimli ama bilinmeyen token RATE_LIMITED, log yok", async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    await resolveGuestTokenLimited("yok-0", meta, limiter);
    await testDb.qrScanLog.deleteMany({});
    const forged = generateQrToken("TABLE", "olmayan-masa");
    expect(isSignedToken(forged)).toBe(true);
    expect(await resolveGuestTokenLimited(forged, meta, limiter)).toEqual({ kind: "NONE", reason: "RATE_LIMITED" });
    expect(await testDb.qrScanLog.count()).toBe(0);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("sınırı aşan IP: imzalı biçimli ama HMAC'i tutmayan (DB'de var) token RATE_LIMITED, log yok", async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    await resolveGuestTokenLimited("yok-0", meta, limiter);
    const { table, token } = await tableFixture();
    const bad = token.slice(0, 20) + (token.slice(20) === "A".repeat(10) ? "B" : "A").repeat(10);
    await testDb.outletTable.update({ where: { id: table.id }, data: { qrToken: bad } });
    await testDb.qrScanLog.deleteMany({});
    expect(await resolveGuestTokenLimited(bad, meta, limiter)).toEqual({ kind: "NONE", reason: "RATE_LIMITED" });
    expect(await testDb.qrScanLog.count()).toBe(0);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("engelli IP: bilinmeyen token 250 ms gecikmeyle RATE_LIMITED döner", async () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });
    await resolveGuestTokenLimited("yok-0", meta, limiter);
    rateLimitDelay.ms = 250;
    const started = Date.now();
    expect((await resolveGuestTokenLimited("yok-1", meta, limiter)).kind).toBe("NONE");
    expect(Date.now() - started).toBeGreaterThanOrEqual(240);
  });

  it("biçimsiz token da sayılır (60. deneme BILINMEYEN, 61. RATE_LIMITED)", async () => {
    const limiter = createRateLimiter({ max: 60, windowMs: 60_000 });
    const globalLimiter = createRateLimiter({ max: 600, windowMs: 60_000 });
    const legacy = looseLegacy();
    for (let i = 0; i < 59; i++) await resolveGuestTokenLimited(`yok-${i}`, meta, limiter, globalLimiter, {}, legacy);
    expect(await resolveGuestTokenLimited("../x", meta, limiter, globalLimiter, {}, legacy)).toMatchObject({
      reason: "BILINMEYEN",
    });
    expect(await resolveGuestTokenLimited("yok-61", meta, limiter, globalLimiter, {}, legacy)).toMatchObject({
      reason: "RATE_LIMITED",
    });
  });

  it("global yedek: sınır sonrası farklı IP'lerde bilinmeyen/imzasız RATE_LIMITED, imzalı geçerli token çözülür, log yok", async () => {
    const limiter = createRateLimiter({ max: 60, windowMs: 60_000 });
    const globalLimiter = createRateLimiter({ max: 5, windowMs: 60_000 });
    for (let i = 0; i < 5; i++) {
      expect(
        await resolveGuestTokenLimited(`yok-${i}`, { ...meta, ip: `10.2.0.${i}` }, limiter, globalLimiter),
      ).toMatchObject({ reason: "BILINMEYEN" });
    }
    await testDb.qrScanLog.deleteMany({});
    expect(await resolveGuestTokenLimited("yok-x", { ...meta, ip: "10.2.1.1" }, limiter, globalLimiter)).toEqual({
      kind: "NONE",
      reason: "RATE_LIMITED",
    });
    expect(await testDb.qrScanLog.count()).toBe(0);
    expect(publishMock).not.toHaveBeenCalled();
    const { token } = await tableFixture();
    expect((await resolveGuestTokenLimited(token, { ...meta, ip: "10.2.1.2" }, limiter, globalLimiter)).kind).toBe(
      "TABLE",
    );
  });

  it("global yedek hiçbir geçerli tokenı reddetmez: (a) geçerli imzalı token yine çözülür; (b) bilinmeyen RATE_LIMITED ve scan log yok; imzasız legacy token da çözülür", async () => {
    const limiter = createRateLimiter({ max: 60, windowMs: 60_000 }); // per-IP: bol
    const globalLimiter = createRateLimiter({ max: 2, windowMs: 60_000 });
    for (let i = 0; i < 2; i++) {
      await resolveGuestTokenLimited(`yok-${i}`, { ...meta, ip: `10.4.0.${i}` }, limiter, globalLimiter);
    }
    await testDb.qrScanLog.deleteMany({});
    // (b) global aşım + bilinmeyen token → RATE_LIMITED, scan log yok
    expect(await resolveGuestTokenLimited("yok-x", { ...meta, ip: "10.4.1.1" }, limiter, globalLimiter)).toEqual({
      kind: "NONE",
      reason: "RATE_LIMITED",
    });
    expect(await testDb.qrScanLog.count()).toBe(0);
    expect(publishMock).not.toHaveBeenCalled();
    // (a) global aşım + geçerli imzalı token → yine çözülür (normal akış: log + scan.table)
    const { token, table, outlet } = await tableFixture();
    expect(
      (await resolveGuestTokenLimited(token, { ...meta, ip: "10.4.1.2" }, limiter, globalLimiter)).kind,
    ).toBe("TABLE");
    expect(await testDb.qrScanLog.findFirst({ where: { tableId: table.id } })).toMatchObject({
      tableId: table.id,
      ok: true,
    });
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "scan.table", outletId: outlet.id }),
    );
    // global engel imzasız legacy tokenı da reddetmez (fiziksel QR, yeniden basılamaz)
    await testDb.outletTable.update({ where: { id: table.id }, data: { qrToken: "eski-masa-9" } });
    expect(
      (await resolveGuestTokenLimited("eski-masa-9", { ...meta, ip: "10.4.1.3" }, limiter, globalLimiter)).kind,
    ).toBe("TABLE");
  });

  it("global yedek aşılınca DB'de bulunan ama HMAC'i tutmayan imzalı biçimli token RATE_LIMITED (koşulsuz geçmez)", async () => {
    const limiter = createRateLimiter({ max: 60, windowMs: 60_000 });
    const globalLimiter = createRateLimiter({ max: 2, windowMs: 60_000 });
    for (let i = 0; i < 2; i++) {
      await resolveGuestTokenLimited(`yok-${i}`, { ...meta, ip: `10.5.0.${i}` }, limiter, globalLimiter);
    }
    const { table, token } = await tableFixture();
    const bad = token.slice(0, 20) + (token.slice(20) === "A".repeat(10) ? "B" : "A").repeat(10);
    await testDb.outletTable.update({ where: { id: table.id }, data: { qrToken: bad } });
    await testDb.qrScanLog.deleteMany({});
    expect(await resolveGuestTokenLimited(bad, { ...meta, ip: "10.5.1.1" }, limiter, globalLimiter)).toEqual({
      kind: "NONE",
      reason: "RATE_LIMITED",
    });
    expect(await testDb.qrScanLog.count()).toBe(0);
  });

  it("eski biçimli kodların kendi sıkı IP sınırı var: 11. kaçırma sonrası eski kod aramasız RATE_LIMITED; imzalı token etkilenmez", async () => {
    const limiter = createRateLimiter({ max: 60, windowMs: 60_000 });
    const globalLimiter = createRateLimiter({ max: 600, windowMs: 60_000 });
    const legacy = {
      perIp: createRateLimiter({ max: 10, windowMs: 60_000 }),
      global: createRateLimiter({ max: 30, windowMs: 60_000 }),
    };
    for (let i = 0; i < 10; i++) {
      expect(await resolveGuestTokenLimited(`10000${i}`, meta, limiter, globalLimiter, {}, legacy)).toMatchObject({
        reason: "BILINMEYEN",
      });
    }
    const { table } = await tableFixture();
    await testDb.outletTable.update({ where: { id: table.id }, data: { qrToken: "123456" } });
    const tableFind = vi.spyOn(testDb.outletTable, "findUnique");
    try {
      expect(await resolveGuestTokenLimited("123456", meta, limiter, globalLimiter, {}, legacy)).toEqual({
        kind: "NONE",
        reason: "RATE_LIMITED",
      });
      expect(tableFind).not.toHaveBeenCalled();
    } finally {
      tableFind.mockRestore();
    }
    // the general per-IP limit (60) is not reached: signed tokens still resolve
    const other = await tableFixture({ outlet: { name: "Teras Bar" } });
    expect((await resolveGuestTokenLimited(other.token, meta, limiter, globalLimiter, {}, legacy)).kind).toBe("TABLE");
    // another IP has its own legacy budget
    expect(
      (await resolveGuestTokenLimited("123456", { ...meta, ip: "10.6.0.1" }, limiter, globalLimiter, {}, legacy)).kind,
    ).toBe("TABLE");
  });

  it("eski biçimli kodların tüm IP'ler genel sınırı dolunca: geçerli eski kod yine çözülür, bilinmeyen RATE_LIMITED ve IP başına sınıra sayılır", async () => {
    const limiter = createRateLimiter({ max: 60, windowMs: 60_000 });
    const globalLimiter = createRateLimiter({ max: 600, windowMs: 60_000 });
    const legacy = {
      perIp: createRateLimiter({ max: 10, windowMs: 60_000 }),
      global: createRateLimiter({ max: 3, windowMs: 60_000 }),
    };
    for (let i = 0; i < 3; i++) {
      await resolveGuestTokenLimited(`20000${i}`, { ...meta, ip: `10.7.0.${i}` }, limiter, globalLimiter, {}, legacy);
    }
    const { table } = await tableFixture();
    await testDb.outletTable.update({ where: { id: table.id }, data: { qrToken: "654321" } });
    // the all-IP legacy budget is full, the caller's own budgets are free: a valid printed code still works
    expect(
      (await resolveGuestTokenLimited("654321", { ...meta, ip: "10.7.1.1" }, limiter, globalLimiter, {}, legacy)).kind,
    ).toBe("TABLE");
    // an unknown legacy code is still refused, and each refusal spends that IP's own legacy budget
    const attacker = { ...meta, ip: "10.7.2.2" };
    for (let i = 0; i < 10; i++) {
      expect(await resolveGuestTokenLimited(`30000${i}`, attacker, limiter, globalLimiter, {}, legacy)).toEqual({
        kind: "NONE",
        reason: "RATE_LIMITED",
      });
    }
    // per-IP legacy budget now spent: no lookup at all, even for the valid code
    const tableFind = vi.spyOn(testDb.outletTable, "findUnique");
    try {
      expect(await resolveGuestTokenLimited("654321", attacker, limiter, globalLimiter, {}, legacy)).toEqual({
        kind: "NONE",
        reason: "RATE_LIMITED",
      });
      expect(tableFind).not.toHaveBeenCalled();
    } finally {
      tableFind.mockRestore();
    }
  });

  it("eski biçimli kod kullanımı QR_ESKI_KOD olarak günde bir kez denetlenir; imzalı kod denetlenmez", async () => {
    const { table, token } = await tableFixture();
    const started = new Date(Date.now() - 1000);
    expect((await resolveGuestTokenLimited(token, meta)).kind).toBe("TABLE");
    expect(await testDb.auditLog.count({ where: { action: "QR_ESKI_KOD", entityId: table.id } })).toBe(0);
    await testDb.outletTable.update({ where: { id: table.id }, data: { qrToken: "777001" } });
    expect((await resolveGuestTokenLimited("777001", meta)).kind).toBe("TABLE");
    expect((await resolveGuestTokenLimited("777001", meta)).kind).toBe("TABLE");
    const rows = await testDb.auditLog.findMany({
      where: { action: "QR_ESKI_KOD", entityId: table.id, createdAt: { gte: started } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "OutletTable", ip: meta.ip });
    expect(rows[0].after).toMatchObject({ tokenLength: 6, sixDigit: true });
    expect(JSON.stringify(rows[0])).not.toContain("777001");
  });
});
