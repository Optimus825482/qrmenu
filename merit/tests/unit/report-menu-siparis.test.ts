import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, makeOutlet, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff } from "../helpers/minibarFixtures";
import { addOrder } from "../helpers/reportFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { registerReport, unregisterReport } = await import("@/modules/reporting/server/registry");
const { runReport } = await import("@/modules/reporting/server/run");
const { MENU_REPORTS } = await import("@/modules/reporting/server/reports/menu");
const { stats } = await import("@/modules/order/server/roomService/stats");

const D30 = new Date("2026-10-30T00:00:00Z");
const D31 = new Date("2026-10-31T00:00:00Z");
const range = { from: "2026-10-31", to: "2026-10-31" };
const at = (hhmm: string, day = "2026-10-31") => new Date(`${day}T${hhmm}:00Z`);

async function run(ctx: Awaited<ReturnType<typeof staff>>["ctx"], key: string, extra: Record<string, unknown> = {}, opts?: { limit?: number }) {
  return runReport(ctx, key, { hotelIds: [await hotelId("ROYAL")], ...range, ...extra }, opts);
}

async function addTable(outletId: string, label: string) {
  const area = await testDb.outletAreaDefinition.findFirstOrThrow({ where: { outletId } });
  return testDb.outletTable.create({ data: { outletId, areaId: area.id, label } });
}
const scan = (tableId: string | null, ok: boolean, error: string | null, createdAt: Date, roomId?: string) =>
  testDb.qrScanLog.create({ data: { tableId, roomId, kind: "MISAFIR", ok, error, ip: "10.0.0.1", userAgent: "t", createdAt } });

beforeAll(async () => {
  await resetReferenceData();
  for (const def of MENU_REPORTS) registerReport(def);
});
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  await testDb.qrScanLog.deleteMany();
  await testDb.setting.deleteMany({ where: { hotelId: { not: null } } });
});
afterAll(async () => {
  for (const def of MENU_REPORTS) unregisterReport(def.key);
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("katalog", () => {
  it("sekiz anahtar, plan ekran kodları ve outlet kapsamı", () => {
    expect(MENU_REPORTS.map((d) => [d.key, d.screenCode, d.outletScoped === true])).toEqual([
      ["qr-tarama", "QM-RAP", true],
      ["menu-durum", "QM-RAP", true],
      ["siparis-ozet", "QS-RAP", true],
      ["siparis-urun", "QS-RAP", true],
      ["siparis-sure", "QS-RAP", true],
      ["rs-sla", "RO-SLA", true],
      ["rs-tukenen", "RO-SLA", true],
      ["oturum", "CR-ONL", false],
    ]);
  });
});

describe("qr-tarama", () => {
  it("yalnız masa taraması; oda taraması, başka otel ve gün dışı sayılmaz; en sık hata", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const a = await makeOutlet("ROYAL", "Bar A", "BAR");
    const other = await makeOutlet("PREMIUM", "Bar P", "BAR");
    const t1 = await addTable(a.id, "M1");
    const t2 = await addTable(a.id, "M2");
    const tp = await addTable(other.id, "P1");
    await scan(t1.id, true, null, at("08:00"));
    await scan(t1.id, true, null, at("09:00"));
    await scan(t2.id, false, "TOKEN_GECERSIZ", at("10:00"));
    await scan(t2.id, false, "TOKEN_GECERSIZ", at("10:05"));
    await scan(t2.id, false, "OUTLET_KAPALI", at("10:10"));
    await scan(t1.id, true, null, at("08:00", "2026-10-30")); // 30 Ekim 08:00 -> dışarıda
    await scan(tp.id, true, null, at("08:00")); // başka otel
    const room = await testDb.room.create({
      data: { hotelId: await hotelId("ROYAL"), floorId: (await testDb.floor.create({ data: { hotelId: await hotelId("ROYAL"), number: 1, name: "K" } })).id, number: "101" },
    });
    await scan(null, true, null, at("11:00"), room.id); // oda taraması

    const res = await run(mgr.ctx, "qr-tarama");
    expect(res.columns.map((c) => c.title)).toEqual(["Tarih", "Otel", "Outlet", "Toplam tarama", "Başarılı", "Hatalı", "Tekil masa"]);
    expect(res.rows).toEqual([{ day: "2026-10-31", hotel: "Merit Royal", outlet: "Bar A", total: 5, ok: 2, failed: 3, tables: 2 }]);
    expect(res.summary).toEqual([
      { label: "Toplam tarama", value: 5 },
      { label: "Başarılı", value: 2 },
      { label: "Hatalı", value: 3 },
      { label: "En sık hata 1", value: "TOKEN_GECERSIZ (2)" },
      { label: "En sık hata 2", value: "OUTLET_KAPALI (1)" },
    ]);
  });

  it("outlet süzgeci", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const a = await makeOutlet("ROYAL", "Bar A", "BAR");
    const b = await makeOutlet("ROYAL", "Bar B", "BAR");
    await scan((await addTable(a.id, "M1")).id, true, null, at("08:00"));
    await scan((await addTable(b.id, "M1")).id, true, null, at("08:00"));
    const res = await run(mgr.ctx, "qr-tarama", { outletId: b.id });
    expect(res.rows.map((r) => r.outlet)).toEqual(["Bar B"]);
  });
});

describe("menu-durum", () => {
  async function menu() {
    const outlet = await makeOutlet("ROYAL", "Restoran", "SALON");
    const mk = (data: Record<string, unknown>) =>
      testDb.menuNode.create({ data: { outletId: outlet.id, ...data } as never });
    const cat = await mk({ kind: "KATEGORI", name: "Yemek" });
    const sub = await mk({ kind: "ALT_KATEGORI", name: "Ana", parentId: cat.id });
    const grp = await mk({ kind: "GRUP", name: "Et", parentId: sub.id });
    const full = await mk({ kind: "OGE", name: "Kebap", parentId: grp.id, price: 12.5, imageUrl: "/x.jpg", allergens: ["gluten"] });
    for (const lang of ["en", "de", "ru", "ar"]) await testDb.menuNodeTranslation.create({ data: { nodeId: full.id, lang, name: "Kebab" } });
    const bare = await mk({ kind: "OGE", name: "Pilav", parentId: grp.id, isAvailable: false });
    await testDb.menuNodeTranslation.create({ data: { nodeId: bare.id, lang: "en", name: "Rice" } });
    await mk({ kind: "OGE", name: "Eski", parentId: sub.id, isActive: false, imageUrls: ["/y.jpg"] });
    return outlet;
  }

  it("Kategori › Alt › Grup yolu ve tüm sütunlar", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    await menu();
    const res = await run(mgr.ctx, "menu-durum");
    expect(res.columns.map((c) => c.title)).toEqual(["Otel", "Outlet", "Yol (Kategori › Alt › Grup)", "Öğe", "Fiyat", "Durum", "Tükendi", "Fotoğraf", "Eksik çeviri", "Alerjen"]);
    const byName = Object.fromEntries(res.rows.map((r) => [r.item as string, r]));
    expect(byName["Kebap"]).toMatchObject({ path: "Yemek › Ana › Et", price: 12.5, status: "Aktif", soldOut: "Hayır", photo: "Var", missing: "", allergens: "gluten" });
    expect(byName["Pilav"]).toMatchObject({ price: null, soldOut: "Evet", photo: "Yok", missing: "de, ru, ar" });
    expect(byName["Eski"]).toMatchObject({ path: "Yemek › Ana", status: "Pasif", photo: "Var", missing: "en, de, ru, ar" });
    expect(res.summary).toEqual([
      { label: "Öğe", value: 3 }, { label: "Pasif", value: 1 }, { label: "Tükenen", value: 1 },
      { label: "Fotoğrafsız", value: 1 }, { label: "Çevirisi eksik", value: 2 },
    ]);
  });

  it.each([
    ["tukendi", ["Pilav"]],
    ["pasif", ["Eski"]],
    ["fotografsiz", ["Pilav"]],
    ["ceviri-eksik", ["Eski", "Pilav"]],
    ["hepsi", ["Eski", "Kebap", "Pilav"]],
  ])("issue=%s", async (issue, names) => {
    const mgr = await staff("R-OTM", "ROYAL");
    await menu();
    const res = await run(mgr.ctx, "menu-durum", { params: { issue } });
    expect(res.rows.map((r) => r.item as string).sort()).toEqual(names);
  });

  it("yalnız seçili otelin outleti; outlet süzgeci", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const mine = await menu();
    const foreign = await makeOutlet("PREMIUM", "Başka", "SALON");
    await testDb.menuNode.create({ data: { outletId: foreign.id, kind: "OGE", name: "Yabancı" } });
    const res = await run(mgr.ctx, "menu-durum");
    expect(res.rows.map((r) => r.item)).not.toContain("Yabancı");
    const none = await run(mgr.ctx, "menu-durum", { outletId: mine.id, params: { issue: "pasif" } });
    expect(none.rows).toHaveLength(1);
  });
});

describe("siparis-ozet / siparis-urun / siparis-sure", () => {
  it("fiyat kapalı siparişler Tutar'a girmez; menü fiyatı değişse de Tutar sabit; durum sayıları", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const base = { hotelCode: "ROYAL", outletName: "Bar A", date: D31 } as const;
    const priced = await addOrder({ ...base, status: "SERVIS_EDILDI", pricesShown: true, items: [{ name: "Su", qty: 5, unitPrice: 2.5 }], times: { createdAt: at("08:00"), approvedAt: at("08:02"), servedAt: at("08:20") } });
    await addOrder({ ...base, status: "ONAYLANDI", items: [{ name: "Çay", qty: 1 }], times: { createdAt: at("09:00"), approvedAt: at("09:04") } });
    await addOrder({ ...base, status: "GONDERILDI", items: [{ name: "Kahve", qty: 2 }] });
    await addOrder({ ...base, status: "REDDEDILDI", items: [{ name: "Kahve", qty: 1 }] });
    await addOrder({ ...base, status: "IPTAL", items: [{ name: "Kahve", qty: 1 }] });
    await addOrder({ ...base, date: D30, status: "ONAYLANDI", items: [{ name: "Su", qty: 9 }], times: { approvedAt: at("08:00") } }); // gün dışı
    await addOrder({ ...base, kind: "ODA_SERVISI", roomNo: "101", items: [{ name: "Tost", qty: 1 }] }); // oda servisi

    const before = await run(mgr.ctx, "siparis-ozet");
    expect(before.columns.map((c) => c.title)).toEqual(["Tarih", "Otel", "Outlet", "Sipariş", "Onaylanan", "Reddedilen", "İptal", "Servis edilen", "Ort. onay süresi (dk)", "Tutar", "Tutarsız sipariş"]);
    expect(before.rows).toEqual([
      { day: "2026-10-31", hotel: "Merit Royal", outlet: "Bar A", orders: 5, approved: 2, rejected: 1, cancelled: 1, served: 1, approveMin: 3, amount: 12.5, unpriced: 4 },
    ]);
    expect(before.summary).toContainEqual({ label: "Tutar", value: 12.5 });
    expect(before.summary).toContainEqual({ label: "Tutarsız sipariş", value: 4 });

    await testDb.menuNode.updateMany({ data: { price: 99 } });
    const after = await run(mgr.ctx, "siparis-ozet");
    expect(after.rows[0]!.amount).toBe(12.5);
    expect(priced.subtotal).not.toBeNull();
  });

  it("iptal/red siparişler tutara girmez; özet satır limitinden bağımsız tüm aralığı toplar", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const base = { hotelCode: "ROYAL", outletName: "Bar A", pricesShown: true } as const;
    for (const day of ["2026-10-29", "2026-10-30", "2026-10-31"]) {
      await addOrder({ ...base, date: new Date(`${day}T00:00:00Z`), status: "ONAYLANDI", items: [{ name: "Su", qty: 1, unitPrice: 10 }], times: { approvedAt: at("08:00", day) } });
    }
    await addOrder({ ...base, date: D31, status: "IPTAL", items: [{ name: "Su", qty: 3, unitPrice: 10 }] });
    await addOrder({ ...base, date: D31, status: "REDDEDILDI", items: [{ name: "Su", qty: 5, unitPrice: 10 }] });
    const wide = { hotelIds: [await hotelId("ROYAL")], from: "2026-10-29", to: "2026-10-31" };
    const ozet = await runReport(mgr.ctx, "siparis-ozet", wide, { limit: 2 });
    expect(ozet.rows).toHaveLength(2);
    expect(ozet.truncated).toBe(true);
    expect(ozet.summary).toContainEqual({ label: "Toplam sipariş", value: 5 });
    expect(ozet.summary).toContainEqual({ label: "Tutar", value: 30 });
    const urun = await run(mgr.ctx, "siparis-urun", { from: "2026-10-31", to: "2026-10-31", params: { includeUnapproved: true } });
    expect(urun.rows).toEqual([expect.objectContaining({ name: "Su", qty: 1, amount: 10 })]);
    expect(urun.summary).toContainEqual({ label: "Toplam adet", value: 1 });
  });

  it("hiç fiyatlı sipariş yoksa Tutar null (sıfır değil)", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    await addOrder({ hotelCode: "ROYAL", outletName: "Bar A", date: D31, items: [{ name: "Su", qty: 1 }] });
    const res = await run(mgr.ctx, "siparis-ozet");
    expect(res.rows[0]).toMatchObject({ amount: null, unpriced: 1 });
  });

  it("siparis-urun: onaysız hariç (includeUnapproved ile dahil), nameSnapshot değişse tek satır, null fiyat atlanır", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const base = { hotelCode: "ROYAL", outletName: "Bar A", date: D31 } as const;
    const o1 = await addOrder({ ...base, status: "ONAYLANDI", pricesShown: true, items: [{ name: "Su", qty: 2, unitPrice: 3 }], times: { approvedAt: at("08:00") } });
    const o2 = await addOrder({ ...base, status: "ONAYLANDI", items: [{ name: "Su", qty: 1 }], times: { approvedAt: at("09:00") } });
    await addOrder({ ...base, status: "GONDERILDI", items: [{ name: "Su", qty: 4 }] });
    // yeniden adlandırılmış ürün: eski satır eski ad, yeni satır yeni ad
    await testDb.orderItem.update({ where: { id: o1.items[0]!.id }, data: { nameSnapshot: "Su (eski)", createdAt: at("08:00") } });
    await testDb.orderItem.update({ where: { id: o2.items[0]!.id }, data: { nameSnapshot: "Su 0.5L", createdAt: at("09:00") } });
    await testDb.orderItem.updateMany({ where: { orderId: o2.id }, data: { menuNodeId: o1.items[0]!.menuNodeId } });

    const res = await run(mgr.ctx, "siparis-urun");
    expect(res.columns.map((c) => c.title)).toEqual(["Otel", "Outlet", "Ürün", "Adet", "Sipariş sayısı", "Tutar"]);
    expect(res.rows).toEqual([{ hotel: "Merit Royal", outlet: "Bar A", name: "Su 0.5L", qty: 3, orders: 2, amount: 6 }]);
    const all = await run(mgr.ctx, "siparis-urun", { params: { includeUnapproved: true } });
    expect(all.rows[0]).toMatchObject({ qty: 7, orders: 3 });
  });

  it("siparis-sure: 1,2,3,10 dk onay → ort. 4.0, p90 7.9; hazırlık/servis; eskalasyon", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const waiter = await staff("R-GAR", "ROYAL");
    const approver = await staff("R-SGF", "ROYAL");
    const base = { hotelCode: "ROYAL", outletName: "Bar A", date: D31, status: "SERVIS_EDILDI" as const };
    const mins = [1, 2, 3, 10];
    for (const [i, m] of mins.entries()) {
      const created = new Date(at("08:00").getTime() + i * 3_600_000);
      const o = await addOrder({
        ...base, items: [{ name: "Su", qty: 1 }],
        times: {
          createdAt: created, approvedAt: new Date(created.getTime() + m * 60_000),
          ...(i === 0 ? { readyAt: new Date(created.getTime() + 11 * 60_000), servedAt: new Date(created.getTime() + 15 * 60_000) } : {}),
          ...(m === 10 ? { escalatedAt: new Date(created.getTime() + 2 * 60_000) } : {}),
        },
      });
      await testDb.order.update({ where: { id: o.id }, data: { approvedById: approver.userId, assignedWaiterId: i < 3 ? waiter.userId : null } });
    }
    const res = await run(mgr.ctx, "siparis-sure");
    expect(res.columns.map((c) => c.title)).toEqual(["Outlet", "Sipariş", "Onay ort. (dk)", "Onay p90 (dk)", "Hazırlık ort. (dk)", "Servis ort. (dk)", "Eskalasyon"]);
    expect(res.rows).toEqual([{ label: "Bar A", orders: 4, approveAvg: 4, approveP90: 7.9, prepAvg: 10, serveAvg: 4, escalated: 1 }]);
    const byApprover = await run(mgr.ctx, "siparis-sure", { params: { groupBy: "onaylayan" } });
    expect(byApprover.rows).toMatchObject([{ label: `Test ${(await testDb.user.findUniqueOrThrow({ where: { id: approver.userId } })).username}`, orders: 4 }]);
    const byWaiter = await run(mgr.ctx, "siparis-sure", { params: { groupBy: "garson" } });
    expect(byWaiter.rows).toMatchObject([{ orders: 3, approveAvg: 2 }]);
  });
});

describe("yetki ve outlet kapsamı", () => {
  it("OUTLET oturumu (R-SGF) kendi outletine zorlanır, başka outletin siparişi sızmaz", async () => {
    const sgf = await staff("R-SGF", "ROYAL");
    const base = { hotelCode: "ROYAL", date: D31, status: "ONAYLANDI" as const, items: [{ name: "Su", qty: 1 }], times: { approvedAt: at("08:00") } };
    await addOrder({ ...base, outletName: "Bar A" });
    await addOrder({ ...base, outletName: "Bar B" });
    await addOrder({ ...base, outletName: "Bar B" });
    const outletA = await testDb.outlet.findFirstOrThrow({ where: { name: "Bar A" } });
    const outletB = await testDb.outlet.findFirstOrThrow({ where: { name: "Bar B" } });
    sgf.ctx.session.outletId = outletA.id;
    const res = await run(sgf.ctx, "siparis-ozet", { outletId: outletB.id });
    expect(res.rows.map((r) => [r.outlet, r.orders])).toEqual([["Bar A", 1]]);
    const urun = await run(sgf.ctx, "siparis-urun", { outletId: outletB.id });
    expect(urun.rows.map((r) => r.outlet)).toEqual(["Bar A"]);
    await expect(run(sgf.ctx, "oturum")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("R-GAR hiçbir QR raporunu çalıştıramaz", async () => {
    const gar = await staff("R-GAR", "ROYAL");
    gar.ctx.session.outletId = (await makeOutlet("ROYAL", "Bar A", "BAR")).id;
    for (const key of ["qr-tarama", "menu-durum", "siparis-ozet", "siparis-urun", "siparis-sure"]) {
      await expect(run(gar.ctx, key)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("limit+1 kayıt → truncated, satır sayısı limit", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    for (const day of ["2026-10-29", "2026-10-30", "2026-10-31"]) {
      await addOrder({ hotelCode: "ROYAL", outletName: "Bar A", date: new Date(`${day}T00:00:00Z`), items: [{ name: "Su", qty: 1 }] });
    }
    const res = await runReport(mgr.ctx, "siparis-ozet", { hotelIds: [await hotelId("ROYAL")], from: "2026-10-29", to: "2026-10-31" }, { limit: 2 });
    expect(res.rows).toHaveLength(2);
    expect(res.truncated).toBe(true);
    const ok = await runReport(mgr.ctx, "siparis-ozet", { hotelIds: [await hotelId("ROYAL")], from: "2026-10-29", to: "2026-10-31" }, { limit: 3 });
    expect(ok.truncated).toBe(false);
  });

  it("menu-durum limit+1 → truncated", async () => {
    const mgr = await staff("R-OTM", "ROYAL");
    const outlet = await makeOutlet("ROYAL", "Restoran", "SALON");
    for (const n of ["a", "b", "c"]) await testDb.menuNode.create({ data: { outletId: outlet.id, kind: "OGE", name: n } });
    const res = await runReport(mgr.ctx, "menu-durum", { hotelIds: [await hotelId("ROYAL")] }, { limit: 2 });
    expect(res.rows).toHaveLength(2);
    expect(res.truncated).toBe(true);
  });
});

describe("rs-sla", () => {
  async function seedRoom(hotelCode: string, mins: { create: string; deliver?: string; status: "TESLIM_EDILDI" | "GONDERILDI" | "IPTAL" | "ONAYLANDI" }[]) {
    for (const [i, m] of mins.entries()) {
      await addOrder({
        hotelCode, outletName: "Oda Servisi Test", kind: "ODA_SERVISI", roomNo: `10${i}`, date: D31, status: m.status,
        items: [{ name: "Tost", qty: 1 }],
        times: {
          createdAt: at(m.create),
          ...(m.deliver ? { deliveredAt: at(m.deliver) } : {}),
        },
      });
    }
  }

  it("slaStart (oluşturma) → deliveredAt; SLA otel ayarından; stats.sla ile aynı", async () => {
    const fbm = await staff("R-FBM", "ROYAL");
    const rid = await hotelId("ROYAL");
    await testDb.setting.create({ data: { hotelId: rid, key: "rs.slaMinutes", value: 20 } });
    await seedRoom("ROYAL", [
      { create: "08:00", deliver: "08:25", status: "TESLIM_EDILDI" }, // 25 dk, aşan
      { create: "09:00", deliver: "09:15", status: "TESLIM_EDILDI" }, // 15 dk, aşmaz
      { create: "10:00", status: "GONDERILDI" }, // onay bekliyor
      { create: "11:00", status: "ONAYLANDI" }, // açık
      { create: "12:00", status: "IPTAL" },
    ]);
    const res = await run(fbm.ctx, "rs-sla");
    expect(res.columns.map((c) => c.title)).toEqual(["Tarih", "Otel", "Sipariş", "Teslim edilen", "İptal", "Ort. teslim (dk)", "SLA (dk)", "SLA aşan", "SLA oranı"]);
    expect(res.columns.some((c) => c.type === "money")).toBe(false); // oda servisi tutarı rapora girmez
    expect(res.rows).toEqual([{ day: "2026-10-31", hotel: "Merit Royal", orders: 5, delivered: 2, cancelled: 1, avgMin: 20, sla: 20, late: 1, rate: 0.5 }]);

    const s = await stats.sla(fbm.ctx, rid, range);
    expect(s.total).toBe(res.rows[0]!.orders);
    expect(s.delivered).toBe(res.rows[0]!.delivered);
    expect(s.cancelled).toBe(res.rows[0]!.cancelled);
    expect(s.avgDeliverySec).toBe((res.rows[0]!.avgMin as number) * 60);
    expect(s.onTimePct).toBe(Math.round((res.rows[0]!.rate as number) * 100));
    expect(s.slaMinutes).toBe(res.rows[0]!.sla);
  });

  it("otel başına SLA: Royal 20 dk, Premium varsayılan 30 dk; 25 dk teslim Royal'de aşar, Premium'da aşmaz", async () => {
    const sys = await staff("R-SYS", "ROYAL", ["PREMIUM"]);
    await testDb.setting.create({ data: { hotelId: await hotelId("ROYAL"), key: "rs.slaMinutes", value: 20 } });
    for (const code of ["ROYAL", "PREMIUM"]) await seedRoom(code, [{ create: "08:00", deliver: "08:25", status: "TESLIM_EDILDI" }]);
    const res = await runReport(sys.ctx, "rs-sla", { hotelIds: [await hotelId("ROYAL"), await hotelId("PREMIUM")], ...range });
    expect(res.rows.map((r) => [r.hotel, r.sla, r.late, r.rate])).toEqual([
      ["Merit Royal", 20, 1, 0],
      ["Merit Royal Premium", 30, 0, 1],
    ]);
  });
});

describe("rs-tukenen", () => {
  it("işaretleme başına bir satır; sonraki açılışla eşlenir, BAR ve gün dışı sayılmaz, silinen ürün adı denetim kaydından", async () => {
    const fbm = await staff("R-FBM", "ROYAL");
    const hid = await hotelId("ROYAL");
    const rs =
      (await testDb.outlet.findFirst({ where: { hotelId: hid, type: "ODA_SERVISI" } })) ?? (await makeOutlet("ROYAL", "Oda Servisi", "ODA_SERVISI"));
    const bar = await makeOutlet("ROYAL", "Bar T", "BAR");
    const cat = await testDb.menuNode.create({ data: { outletId: rs.id, kind: "KATEGORI", name: "Yiyecekler" } });
    const sub = await testDb.menuNode.create({ data: { outletId: rs.id, kind: "ALT_KATEGORI", name: "Sıcaklar", parentId: cat.id } });
    const burger = await testDb.menuNode.create({ data: { outletId: rs.id, kind: "OGE", name: "Burger", parentId: sub.id, price: 15 } });
    const soup = await testDb.menuNode.create({ data: { outletId: rs.id, kind: "OGE", name: "Çorba", parentId: sub.id, price: 8, isAvailable: false } });
    const barItem = await testDb.menuNode.create({ data: { outletId: bar.id, kind: "OGE", name: "Mojito", price: 9 } });
    const log = (entityId: string, available: boolean, createdAt: Date, after: Record<string, unknown> = {}) =>
      testDb.auditLog.create({
        data: {
          userId: fbm.ctx.user.id,
          hotelId: hid,
          action: "MENU_NODE_AVAILABILITY",
          entity: "MenuNode",
          entityId,
          before: { isAvailable: !available },
          after: { isAvailable: available, ...after },
          createdAt,
        },
      });
    await log(burger.id, false, at("09:00"));
    await log(burger.id, true, at("09:45"));
    await log(burger.id, false, at("12:00"));
    await log(burger.id, true, at("08:00", "2026-11-01")); // reopened after the range: still paired
    await log(soup.id, false, at("10:00"));
    await log("gone-node", false, at("11:00"), { name: "Eski Ürün", outletId: rs.id });
    await log(barItem.id, false, at("10:30")); // not room service
    await log(burger.id, false, at("09:00", "2026-10-29")); // outside the range

    const res = await run(fbm.ctx, "rs-tukenen");
    expect(res.rows.map((r) => [r.item, r.path, r.state, r.minutes])).toEqual([
      ["Burger", "Yiyecekler › Sıcaklar", "Yeniden açıldı", 1200],
      ["Eski Ürün", "", "Tükenik", null],
      ["Çorba", "Yiyecekler › Sıcaklar", "Tükenik", null],
      ["Burger", "Yiyecekler › Sıcaklar", "Yeniden açıldı", 45],
    ]);
    expect(res.rows[3]).toMatchObject({ hotel: "Merit Royal", price: 15, by: fbm.ctx.user.fullName, restoredBy: fbm.ctx.user.fullName });
    expect(res.summary).toEqual([
      { label: "Tükendi işaretleme", value: 4 },
      { label: "Hâlâ tükenik", value: 2 },
      { label: "Yeniden açılan", value: 2 },
      { label: "Ort. menüde yok (dk)", value: 622.5 },
    ]);

    const open = await run(fbm.ctx, "rs-tukenen", { params: { state: "tukenik" } });
    expect(open.rows.map((r) => r.item)).toEqual(["Eski Ürün", "Çorba"]);
  });
});
