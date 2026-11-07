import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { stockStatus } from "@/modules/minibar/stockStatus";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff } from "../helpers/minibarFixtures";
import { addConsumption, addMovement } from "../helpers/reportFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { runReport } = await import("@/modules/reporting/server/run");

const range = { from: "2026-10-31", to: "2026-10-31" };
const NOON = new Date("2026-10-31T10:00:00Z");
let mgr: Awaited<ReturnType<typeof staff>>;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  mgr = await staff("R-OTM", "ROYAL");
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function stock(hotelCode: string, name: string, p: { total: number; used: number; critical?: number }) {
  const hid = await hotelId(hotelCode);
  const group = (await testDb.productGroup.findFirst({ where: { name: "Zim" } })) ?? (await testDb.productGroup.create({ data: { name: "Zim" } }));
  const product = await testDb.product.create({ data: { groupId: group.id, name } });
  await testDb.hotelStock.create({
    data: { hotelId: hid, productId: product.id, totalQty: p.total, usedQty: p.used, remainingQty: p.total - p.used, criticalLevel: p.critical ?? 50 },
  });
}
const call = async (key: string, params: Record<string, string | number | boolean> = {}, ctx = mgr.ctx) =>
  runReport(ctx, key, { hotelIds: [await hotelId("ROYAL")], ...range, params });

describe("stockStatus sınırları (P2 tanımı)", () => {
  it("0 STOKOUT, ≤k KRITIK, ≤1.5k DIKKAT, aksi NORMAL", () => {
    expect(stockStatus(0, 50)).toBe("STOKOUT");
    expect(stockStatus(50, 50)).toBe("KRITIK");
    expect(stockStatus(51, 50)).toBe("DIKKAT");
    expect(stockStatus(75, 50)).toBe("DIKKAT");
    expect(stockStatus(76, 50)).toBe("NORMAL");
  });
});

describe("zimmet-durum", () => {
  it("STOKOUT önce, sonra KRITIK; Kullanım % = used/total; etiketler Türkçe", async () => {
    await stock("ROYAL", "Normal", { total: 200, used: 20 });
    await stock("ROYAL", "Kritik", { total: 100, used: 50 });
    await stock("ROYAL", "Bos", { total: 40, used: 40 });
    await stock("ROYAL", "Dikkat", { total: 200, used: 125 });
    await stock("DIAMOND", "Baska", { total: 10, used: 10 });
    const r = await call("zimmet-durum");
    expect(r.columns.map((c) => c.title)).toEqual([
      "Otel", "Ürün grubu", "Ürün", "Toplam", "Kullanılan", "Kalan", "Kritik seviye", "Kullanım %", "Durum",
    ]);
    expect(r.rows.map((x) => [x.product, x.status])).toEqual([
      ["Bos", "Stok yok"],
      ["Kritik", "Kritik"],
      ["Dikkat", "Dikkat"],
      ["Normal", "Normal"],
    ]);
    expect(r.rows[1]).toMatchObject({ total: 100, used: 50, remaining: 50, critical: 50, usage: 0.5 });
    expect(r.summary).toEqual([
      { label: "Stok yok", value: 1 },
      { label: "Kritik", value: 1 },
      { label: "Dikkat", value: 1 },
    ]);
  });

  it("onlyCritical NORMAL'leri eler (\"true\" dizgesi de kabul); toplamı 0 olan ürün %0", async () => {
    await stock("ROYAL", "Normal", { total: 200, used: 20 });
    await stock("ROYAL", "Kritik", { total: 100, used: 50 });
    await stock("ROYAL", "Sifir", { total: 0, used: 0 });
    expect((await call("zimmet-durum", { onlyCritical: true })).rows.map((x) => x.product)).toEqual(["Sifir", "Kritik"]);
    expect((await call("zimmet-durum", { onlyCritical: "true" })).rows).toHaveLength(2);
    expect((await call("zimmet-durum")).rows).toHaveLength(3);
    expect((await call("zimmet-durum")).rows[0]).toMatchObject({ product: "Sifir", usage: 0 });
  });

  it("limitte truncated", async () => {
    for (const n of ["A", "B", "C"]) await stock("ROYAL", n, { total: 100, used: 0 });
    const r = await runReport(mgr.ctx, "zimmet-durum", { hotelIds: [await hotelId("ROYAL")] }, { limit: 2 });
    expect(r.rows).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  it("R-GAR ve R-KAT çalıştıramaz (FORBIDDEN)", async () => {
    for (const role of ["R-GAR", "R-KAT"]) {
      const u = await staff(role, "ROYAL");
      await expect(call("zimmet-durum", {}, u.ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(call("zimmet-hareket", {}, u.ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});

describe("zimmet-hareket", () => {
  const base = { hotelCode: "ROYAL", username: "dep", productName: "Kola", at: NOON };

  it("işaretli adet, tür etiketleri ve IADE'nin iki biçimi", async () => {
    await addMovement({ ...base, type: "GIRIS", qty: 100 });
    await addMovement({ ...base, type: "KULLANIM", qty: -4 });
    await addMovement({ ...base, type: "MYBAR", qty: -2 });
    await addMovement({ ...base, type: "DUZELTME", qty: 1 });
    await addMovement({ ...base, type: "GOC", qty: 7 });
    await addMovement({ ...base, type: "IADE", qty: -10 });
    await addMovement({ ...base, type: "IADE", qty: 3, refType: "MinibarTransaction", refId: "tx1" });
    const r = await call("zimmet-hareket");
    expect(r.columns.map((c) => c.title)).toEqual(["Zaman", "Otel", "Ürün", "Tür", "Adet", "Kullanıcı", "Not", "Referans"]);
    const byType = new Map(r.rows.map((x) => [x.type, x.qty]));
    expect(byType.get("Giriş")).toBe(100);
    expect(byType.get("Kullanım")).toBe(-4);
    expect(byType.get("MyBar")).toBe(-2);
    expect(byType.get("Düzeltme")).toBe(1);
    expect(byType.get("Göç")).toBe(7);
    expect(byType.get("Depoya iade")).toBe(-10);
    expect(byType.get("İşlem silme geri yazımı")).toBe(3);
    expect(r.rows.find((x) => x.type === "İşlem silme geri yazımı")?.ref).toBe("MinibarTransaction tx1");
    expect(r.rows.find((x) => x.type === "Giriş")?.ref).toBeNull();
    expect(r.summary).toEqual([
      { label: "Hareket sayısı", value: 7 },
      { label: "Net adet", value: 95 },
    ]);
  });

  it("tür/ürün/kullanıcı süzgeci, otel ve tarih sınırı", async () => {
    await addMovement({ ...base, type: "GIRIS", qty: 10 });
    await addMovement({ ...base, type: "KULLANIM", qty: -1, productName: "Su" });
    await addMovement({ ...base, type: "GIRIS", qty: 5, at: new Date("2026-10-31T22:00:00Z") });
    await addMovement({ ...base, type: "GIRIS", qty: 6, at: new Date("2026-10-30T21:59:00Z") });
    await addMovement({ ...base, type: "GIRIS", qty: 8, hotelCode: "DIAMOND" });
    expect((await call("zimmet-hareket")).rows).toHaveLength(2);
    expect((await call("zimmet-hareket", { type: "GIRIS" })).rows).toEqual([expect.objectContaining({ qty: 10 })]);
    const su = await testDb.product.findFirstOrThrow({ where: { name: "Su" } });
    expect((await call("zimmet-hareket", { productId: su.id })).rows).toEqual([expect.objectContaining({ type: "Kullanım" })]);
    expect((await call("zimmet-hareket", { userId: "yok" })).rows).toHaveLength(0);
  });

  it("limitte truncated", async () => {
    for (let i = 0; i < 3; i++) await addMovement({ ...base, type: "GIRIS", qty: 1 });
    const r = await runReport(mgr.ctx, "zimmet-hareket", { hotelIds: [await hotelId("ROYAL")], ...range }, { limit: 2 });
    expect(r.rows).toHaveLength(2);
    expect(r.truncated).toBe(true);
    expect(r.summary?.[0]).toEqual({ label: "Hareket sayısı", value: 3 });
  });
});

describe("gun-sonu", () => {
  it("R-KAT yalnız kendi satırlarını görür; başkasının userId'si yok sayılır; R-OTM tümünü; özet sayıları", async () => {
    const kat1 = await staff("R-KAT", "ROYAL");
    const kat2 = await staff("R-KAT", "ROYAL");
    const name = async (id: string) => (await testDb.user.findUniqueOrThrow({ where: { id } })).username;
    const [u1, u2] = [await name(kat1.userId), await name(kat2.userId)];
    const row = { hotelCode: "ROYAL", productName: "Kola", consumed: 1, added: 2 };
    await addConsumption({ ...row, roomNo: "101", username: u1, at: new Date("2026-10-31T06:00:00Z") });
    await addConsumption({ ...row, roomNo: "102", username: u1, at: new Date("2026-10-31T08:00:00Z") });
    await addConsumption({ ...row, roomNo: "103", username: u2, at: new Date("2026-10-31T07:00:00Z") });
    const room = async (n: string) => (await testDb.room.findFirstOrThrow({ where: { number: n } })).id;
    const check = async (userId: string, roomNo: string, type: "SARFIYAT_YOK" | "DND" | "URUN_EKLENDI" | "ACIK") =>
      testDb.roomCheck.create({ data: { roomId: await room(roomNo), userId, type, checkDate: new Date("2026-10-31T00:00:00Z") } });
    await check(kat1.userId, "101", "URUN_EKLENDI");
    await check(kat1.userId, "102", "SARFIYAT_YOK");
    await check(kat1.userId, "101", "ACIK");
    await check(kat2.userId, "103", "SARFIYAT_YOK");
    await check(kat2.userId, "101", "DND");

    const full = await call("gun-sonu");
    expect(full.columns.map((c) => c.title)).toEqual(["Tarih", "Personel", "Ürün", "Eklenen", "Oda", "İlk işlem", "Son işlem"]);
    expect(full.rows).toHaveLength(2);
    const mine1 = full.rows.find((x) => x.staff === `Test ${u1}`);
    expect(mine1).toMatchObject({ day: "2026-10-31", product: "Kola", added: 4, rooms: 2 });
    expect((mine1?.first_at as Date).toISOString()).toBe("2026-10-31T06:00:00.000Z");
    expect((mine1?.last_at as Date).toISOString()).toBe("2026-10-31T08:00:00.000Z");
    const s = (r: typeof full, l: string) => r.summary?.find((x) => x.label === l)?.value;
    expect(s(full, "Kontrol edilen oda")).toBe(3);
    expect(s(full, "Sarfiyat Yok")).toBe(2);
    expect(s(full, "DND")).toBe(1);

    const mine = await call("gun-sonu", {}, kat1.ctx);
    const other = await call("gun-sonu", { userId: kat2.userId }, kat1.ctx);
    expect(mine.rows).toEqual([expect.objectContaining({ staff: `Test ${u1}`, added: 4 })]);
    expect(other.rows).toEqual(mine.rows);
    expect(other.summary).toEqual(mine.summary);
    expect(s(mine, "Sarfiyat Yok")).toBe(1);
    expect(s(mine, "DND")).toBe(0);
  });

  it("gün sınırı Nicosia: 22:30Z işlemi ertesi iş gününde", async () => {
    const row = { hotelCode: "ROYAL", username: "x", productName: "Kola", consumed: 1, added: 1, roomNo: "1" };
    await addConsumption({ ...row, at: new Date("2026-10-30T22:30:00Z") });
    expect((await call("gun-sonu")).rows).toHaveLength(1);
    const prev = await runReport(mgr.ctx, "gun-sonu", { hotelIds: [await hotelId("ROYAL")], from: "2026-10-30", to: "2026-10-30" });
    expect(prev.rows).toHaveLength(0);
  });
});
