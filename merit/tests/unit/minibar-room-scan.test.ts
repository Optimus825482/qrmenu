import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { makeKat, minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const rs = await import("@/modules/minibar/server/roomScan");
const { publish } = await import("@/lib/realtime");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  await testDb.qrScanLog.deleteMany();
  rs.qrResolveLimiter.clear();
  vi.mocked(publish).mockClear();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const meta = { ip: "10.0.0.1", userAgent: "vitest" };
const errOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return { code: "OK", message: "" };
  } catch (e) {
    return { code: (e as { code?: string }).code ?? String(e), message: (e as Error).message };
  }
};

describe("extractToken", () => {
  it("tam URL ve ham token", () => {
    expect(rs.extractToken("https://host/q/Abc_123-xyz")).toBe("Abc_123-xyz");
    expect(rs.extractToken("https://host/q/Abc_123-xyz/?x=1#y")).toBe("Abc_123-xyz");
    expect(rs.extractToken("  Abc_123-xyz ")).toBe("Abc_123-xyz");
    expect(rs.extractToken("482913")).toBe("482913");
  });

  it("geçersiz girdi VALIDATION 'QR kod okunamadı'", () => {
    for (const bad of ["../x", "", "a".repeat(65), "https://host/baska/yol", "a b"]) {
      let err: { code?: string; message?: string } = {};
      try {
        rs.extractToken(bad);
      } catch (e) {
        err = e as { code?: string; message?: string };
      }
      expect(err.code, bad).toBe("VALIDATION");
      expect(err.message).toBe("QR kod okunamadı");
    }
  });
});

describe("resolveRoomByQr", () => {
  it("geçerli token: oda + QrScanLog ok=true PERSONEL + scan.room olayı", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    const r = await rs.resolveRoomByQr(kat.ctx, `https://host/q/${w.room.qrToken}`, meta);
    expect(r).toEqual({ roomId: w.room.id, floorId: w.floor.id, number: w.room.number });
    const logs = await testDb.qrScanLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ roomId: w.room.id, userId: kat.userId, kind: "PERSONEL", ok: true, ip: meta.ip, userAgent: meta.userAgent });
    expect(vi.mocked(publish).mock.calls.some(([e]) => (e as { type: string }).type === "scan.room")).toBe(true);
  });

  it("6 haneli eski token çalışır (imza doğrulanmaz)", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    await testDb.room.update({ where: { id: w.room.id }, data: { qrToken: "482913" } });
    expect((await rs.resolveRoomByQr(kat.ctx, "482913", meta)).roomId).toBe(w.room.id);
  });

  it("bilinmeyen token NOT_FOUND + log ok=false", async () => {
    await minibarWorld();
    const kat = await makeKat();
    const e = await errOf(rs.resolveRoomByQr(kat.ctx, "yokboyle", meta));
    expect(e).toEqual({ code: "NOT_FOUND", message: "Geçersiz veya tanınmayan QR kod" });
    expect(await testDb.qrScanLog.count({ where: { ok: false, userId: kat.userId } })).toBe(1);
  });

  it("başka otelin odası FORBIDDEN + log", async () => {
    const other = await minibarWorld({ hotelCode: "DIAMOND" });
    const kat = await makeKat();
    const e = await errOf(rs.resolveRoomByQr(kat.ctx, other.room.qrToken!, meta));
    expect(e).toEqual({ code: "FORBIDDEN", message: "Bu oda size ait otelde değil" });
    expect(await testDb.qrScanLog.count({ where: { ok: false, roomId: other.room.id } })).toBe(1);
  });

  it("pasif oda NOT_FOUND", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    await testDb.room.update({ where: { id: w.room.id }, data: { isActive: false } });
    expect((await errOf(rs.resolveRoomByQr(kat.ctx, w.room.qrToken!, meta))).code).toBe("NOT_FOUND");
  });

  it("31. deneme aynı IP RATE_LIMITED, başka IP serbest", async () => {
    const w = await minibarWorld();
    const kat = await makeKat();
    for (let i = 0; i < 30; i++) await rs.resolveRoomByQr(kat.ctx, w.room.qrToken!, meta);
    const e = await errOf(rs.resolveRoomByQr(kat.ctx, w.room.qrToken!, meta));
    expect(e).toEqual({ code: "RATE_LIMITED", message: "Çok fazla QR okutma denemesi. Lütfen 1 dakika bekleyin." });
    expect((await rs.resolveRoomByQr(kat.ctx, w.room.qrToken!, { ...meta, ip: "10.0.0.2" })).roomId).toBe(w.room.id);
  });

  it("MB-KF yetkisi olmayan rol FORBIDDEN ve kayıt yazılmaz", async () => {
    const w = await minibarWorld();
    const otm = await staff("R-OTM");
    expect((await errOf(rs.resolveRoomByQr(otm.ctx, w.room.qrToken!, meta))).code).toBe("FORBIDDEN");
    expect(await testDb.qrScanLog.count()).toBe(0);
  });
});
