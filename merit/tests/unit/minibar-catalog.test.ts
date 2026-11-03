import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { DomainError } from "@/lib/result";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData, staff } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const groups = await import("@/modules/minibar/server/productGroups");
const products = await import("@/modules/minibar/server/products");
const setups = await import("@/modules/minibar/server/setups");
const roomTypeSetups = await import("@/modules/minibar/server/roomTypeSetups");
const { buildChecklist } = await import("@/modules/minibar/checklist");
const { listSystemAuditLogs } = await import("@/modules/minibar/server/minibarDefinitionsService");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const LIST = { page: 1, pageSize: 20 as const };
const sys = async () => (await staff("R-SYS", "ROYAL")).ctx;

async function expectDomainError(promise: Promise<unknown>, code: string, message?: string | RegExp) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  if (typeof message === "string") expect((error as DomainError).message).toBe(message);
  else if (message) expect((error as DomainError).message).toMatch(message);
  return error as DomainError;
}

const published = (entity: string) =>
  publishMock.mock.calls.filter(([event]) => event?.type === "definition.changed" && event.payload?.entity === entity);

async function newGroup(ctx: Ctx, name = "Icecekler") {
  return groups.create(ctx, { name });
}

async function newProduct(ctx: Ctx, groupId: string, name: string, extra: Record<string, unknown> = {}) {
  return products.create(ctx, { groupId, name, ...extra });
}

describe("ürün grupları", () => {
  it("SISTEM grubu oluşturur; denetim satırı ve definition.changed yayını yazılır", async () => {
    const ctx = await sys();
    const row = await groups.create(ctx, { name: "  İçecekler  ", description: "Soğuk" });
    expect(row).toMatchObject({ name: "İçecekler", description: "Soğuk", isActive: true, productCount: 0 });
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "PRODUCT_GROUP_CREATE" } });
    expect(log).toMatchObject({ entity: "ProductGroup", entityId: row.id });
    expect(published("ProductGroup")).toHaveLength(1);
    expect(published("ProductGroup")[0][0].payload).toMatchObject({ id: row.id, op: "create" });
  });

  it("aynı ad büyük/küçük harf duyarsız CONFLICT", async () => {
    const ctx = await sys();
    await groups.create(ctx, { name: "İçecekler" });
    await expectDomainError(groups.create(ctx, { name: "içecekler" }), "CONFLICT", "Bu adda bir ürün grubu zaten var");
    await expectDomainError(groups.create(ctx, { name: "İÇECEKLER" }), "CONFLICT", "Bu adda bir ürün grubu zaten var");
    expect(await testDb.productGroup.count()).toBe(1);
  });

  it("eşzamanlı aynı ad: biri CONFLICT, ikinci kayıt yok", async () => {
    const ctx = await sys();
    const results = await Promise.allSettled([groups.create(ctx, { name: "Yarış" }), groups.create(ctx, { name: "yarış" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as DomainError).code).toBe("CONFLICT");
    expect(await testDb.productGroup.count()).toBe(1);
  });

  it("101 karakterlik ad VALIDATION ve fieldErrors.name", async () => {
    const ctx = await sys();
    const error = await expectDomainError(groups.create(ctx, { name: "a".repeat(101) }), "VALIDATION");
    expect(error.fieldErrors?.name).toBeDefined();
  });

  it("ürünlü grup silinemez; boş grup silinir", async () => {
    const ctx = await sys();
    const g = await newGroup(ctx);
    await newProduct(ctx, g.id, "Kola");
    await newProduct(ctx, g.id, "Su");
    await expectDomainError(
      groups.remove(ctx, g.id),
      "CONFLICT",
      "Bu gruba ait 2 ürün var; önce ürünleri taşıyın veya silin",
    );
    const empty = await newGroup(ctx, "Boş");
    await groups.remove(ctx, empty.id);
    expect(await testDb.productGroup.count({ where: { id: empty.id } })).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: "PRODUCT_GROUP_DELETE" } })).toBe(1);
  });

  it("setActive denetlenir; R-OTM yazamaz (YETKISIZ_DENEME), R-DEP okur ama yazamaz", async () => {
    const ctx = await sys();
    const g = await newGroup(ctx);
    const off = await groups.setActive(ctx, g.id, false);
    expect(off.isActive).toBe(false);
    expect(await testDb.auditLog.count({ where: { action: "PRODUCT_GROUP_SET_ACTIVE" } })).toBe(1);

    const otm = (await staff("R-OTM", "ROYAL")).ctx;
    await expectDomainError(groups.create(otm, { name: "Yetkisiz" }), "FORBIDDEN");
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME" } })).toBeGreaterThanOrEqual(1);

    const dep = (await staff("R-DEP", "ROYAL")).ctx;
    expect((await groups.list(dep, LIST)).total).toBe(1);
    await expectDomainError(groups.create(dep, { name: "Yetkisiz" }), "FORBIDDEN");
    expect(await testDb.productGroup.count()).toBe(1);
  });
});

describe("ürünler", () => {
  it("fiyatlar yalnız SISTEM/YONETIM'e döner; lookup fiyatsızdır", async () => {
    const ctx = await sys();
    const g = await newGroup(ctx);
    const created = await newProduct(ctx, g.id, "Kola", { salePrice: 12.5, purchasePrice: 7, barcode: "869" });
    expect(created).toMatchObject({ salePrice: "12.50", purchasePrice: "7.00", pricesVisible: true });
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "PRODUCT_CREATE" } });
    expect(JSON.stringify(log.after)).toContain("12.50");

    expect((await products.list(ctx, LIST)).items[0]).toMatchObject({ salePrice: "12.50" });

    const dep = (await staff("R-DEP", "ROYAL")).ctx;
    const depRow = (await products.list(dep, LIST)).items[0];
    expect(depRow).toMatchObject({ purchasePrice: null, salePrice: null, pricesVisible: false });
    const lookup = await products.lookup(dep);
    expect(lookup).toHaveLength(1);
    expect(JSON.stringify(lookup)).not.toMatch(/price/i);
    expect(lookup[0]).toMatchObject({ name: "Kola", groupName: "Icecekler", unit: "Adet", isActive: true });

    const kat = (await staff("R-KAT", "ROYAL")).ctx;
    expect(JSON.stringify(await products.lookup(kat))).not.toMatch(/price/i);
  });

  it("fiyat doğrulaması: negatif ve 3 ondalık VALIDATION", async () => {
    const ctx = await sys();
    const g = await newGroup(ctx);
    const negative = await expectDomainError(newProduct(ctx, g.id, "A", { salePrice: -1 }), "VALIDATION");
    expect(negative.fieldErrors?.salePrice).toBeDefined();
    const fraction = await expectDomainError(newProduct(ctx, g.id, "B", { salePrice: 1.234 }), "VALIDATION");
    expect(fraction.fieldErrors?.salePrice).toBeDefined();
    expect(await testDb.product.count()).toBe(0);
  });

  it("aynı barkod ve aynı kod CONFLICT; pasif gruba ürün VALIDATION", async () => {
    const ctx = await sys();
    const g = await newGroup(ctx);
    await newProduct(ctx, g.id, "Kola", { barcode: "123", code: "K1" });
    await expectDomainError(newProduct(ctx, g.id, "Fanta", { barcode: "123" }), "CONFLICT", "Bu barkod başka bir üründe kullanılıyor");
    await expectDomainError(newProduct(ctx, g.id, "Fanta", { code: "K1" }), "CONFLICT", "Bu ürün kodu başka bir üründe kullanılıyor");
    const off = await newGroup(ctx, "Pasif");
    await groups.setActive(ctx, off.id, false);
    const error = await expectDomainError(newProduct(ctx, off.id, "Su"), "VALIDATION");
    expect(error.fieldErrors?.groupId).toBeDefined();
  });

  it("güncellemede verilmeyen alan (fiyat dahil) korunur", async () => {
    const ctx = await sys();
    const g = await newGroup(ctx);
    const p = await newProduct(ctx, g.id, "Kola", { salePrice: 10, criticalLevel: 25 });
    const updated = await products.update(ctx, p.id, { name: "Kola Zero" });
    expect(updated).toMatchObject({ name: "Kola Zero", salePrice: "10.00", criticalLevel: 25 });
    expect(await testDb.auditLog.count({ where: { action: "PRODUCT_UPDATE" } })).toBe(1);
  });

  it("aktif setup içindeki ürün pasife alınamaz; mesaj setup adını içerir", async () => {
    const ctx = await sys();
    const g = await newGroup(ctx);
    const p = await newProduct(ctx, g.id, "Kola");
    const s = await setups.create(ctx, { name: "MINI" });
    await setups.addItem(ctx, s.id, { productId: p.id, qty: 2 });
    const error = await expectDomainError(products.setActive(ctx, p.id, false), "CONFLICT", /MINI/);
    expect(error.message).toContain("önce setup içeriğinden çıkarın");
    await expectDomainError(products.update(ctx, p.id, { isActive: false }), "CONFLICT", /MINI/);
    await setups.setActive(ctx, s.id, false);
    expect((await products.setActive(ctx, p.id, false)).isActive).toBe(false);
  });

  it("havuz hareketi olan ürün silinemez (pasife alın); kayıtsız ürün silinir", async () => {
    const ctx = await sys();
    const user = await staff("R-DEP", "ROYAL");
    const g = await newGroup(ctx);
    const used = await newProduct(ctx, g.id, "Kola");
    const free = await newProduct(ctx, g.id, "Su");
    await testDb.hotelStockMovement.create({
      data: { hotelId: await hotelId("ROYAL"), productId: used.id, userId: user.userId, type: "GIRIS", qty: 5 },
    });
    await expectDomainError(
      products.remove(ctx, used.id),
      "CONFLICT",
      "Bu ürünün stok, işlem veya talep kaydı var; silmek yerine pasife alın",
    );
    await products.remove(ctx, free.id);
    expect(await testDb.product.count({ where: { id: free.id } })).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: "PRODUCT_DELETE" } })).toBe(1);
  });
});

describe("setuplar", () => {
  it("setup ve kalemler; aynı ürün ikinci kez, adet sınırı, pasif ürün", async () => {
    const ctx = await sys();
    const g = await newGroup(ctx);
    const kola = await newProduct(ctx, g.id, "Kola");
    const su = await newProduct(ctx, g.id, "Su");
    const off = await newProduct(ctx, g.id, "Pasif", { isActive: false });
    const s = await setups.create(ctx, { name: "MINI" });
    await expectDomainError(setups.create(ctx, { name: "mini" }), "CONFLICT", "Bu adda bir setup zaten var");

    await setups.addItem(ctx, s.id, { productId: kola.id, qty: 2 });
    await setups.addItem(ctx, s.id, { productId: su.id, qty: 4 });
    await expectDomainError(
      setups.addItem(ctx, s.id, { productId: kola.id, qty: 1 }),
      "CONFLICT",
      "Bu ürün setup içeriğinde zaten var; adedini düzenleyin",
    );
    await expectDomainError(setups.addItem(ctx, s.id, { productId: su.id, qty: 0 }), "VALIDATION");
    await expectDomainError(setups.addItem(ctx, s.id, { productId: su.id, qty: 100 }), "VALIDATION");
    await expectDomainError(setups.addItem(ctx, s.id, { productId: off.id, qty: 1 }), "VALIDATION");

    const detail = await setups.get(ctx, s.id);
    expect(detail.itemCount).toBe(2);
    expect(detail.items.map((i) => [i.productName, i.qty])).toEqual([
      ["Kola", 2],
      ["Su", 4],
    ]);
    const item = detail.items[0];
    expect((await setups.updateItem(ctx, item.id, 6)).qty).toBe(6);
    expect(await testDb.auditLog.count({ where: { action: { in: ["SETUP_ITEM_ADD", "SETUP_ITEM_UPDATE"] } } })).toBe(3);
    await setups.removeItem(ctx, item.id);
    expect(await testDb.auditLog.count({ where: { action: "SETUP_ITEM_REMOVE" } })).toBe(1);
    expect(published("SetupItem").length).toBeGreaterThanOrEqual(4);
  });

  it("R-OTM setup yazamaz, okuyabilir; setup fiyatı R-DEP'e null", async () => {
    const ctx = await sys();
    const g = await newGroup(ctx);
    const p = await newProduct(ctx, g.id, "Kola", { salePrice: 3 });
    const s = await setups.create(ctx, { name: "MINI" });
    await setups.addItem(ctx, s.id, { productId: p.id, qty: 1 });
    const otm = (await staff("R-OTM", "ROYAL")).ctx;
    await expectDomainError(setups.create(otm, { name: "X" }), "FORBIDDEN");
    expect((await setups.get(otm, s.id)).items[0].salePrice).toBe("3.00");
    const dep = (await staff("R-DEP", "ROYAL")).ctx;
    expect((await setups.get(dep, s.id)).items[0].salePrice).toBeNull();
  });

  it("atanmış setup pasife alınamaz/silinemez; son kalemi silinemez; geçmiş işlemli setup silinemez", async () => {
    const w = await minibarWorld();
    const ctx = await sys();
    // the world's setup has 2 items and is assigned to w.roomType
    await expectDomainError(
      setups.setActive(ctx, w.setup.id, false),
      "CONFLICT",
      "Bu setup 1 oda tipine atanmış; önce atamaları kaldırın",
    );
    await expectDomainError(setups.remove(ctx, w.setup.id), "CONFLICT", "Bu setup 1 oda tipine atanmış; önce atamaları kaldırın");

    const items = (await setups.get(ctx, w.setup.id)).items;
    await setups.removeItem(ctx, items[0].id);
    await expectDomainError(setups.removeItem(ctx, items[1].id), "CONFLICT", "Atanmış setup'ın içeriği boş bırakılamaz");

    // unassign, then a setup with transaction history cannot be deleted either
    await roomTypeSetups.set(ctx, w.hotelId, w.roomType.id, []);
    const user = await staff("R-KAT", "ROYAL");
    const tx = await testDb.minibarTransaction.create({
      data: { hotelId: w.hotelId, roomId: w.room.id, userId: user.userId, type: "SARFIYAT_YOK" },
    });
    await testDb.minibarTransactionItem.create({
      data: { transactionId: tx.id, productId: w.cola.id, setupId: w.setup.id },
    });
    await expectDomainError(
      setups.remove(ctx, w.setup.id),
      "CONFLICT",
      "Bu setup geçmiş işlemlerde kullanılmış; silmek yerine pasife alın",
    );
    expect(await testDb.setup.count({ where: { id: w.setup.id } })).toBe(1);
  });
});

describe("oda tipi - setup ataması", () => {
  async function twoSetups(ctx: Ctx) {
    const g = await newGroup(ctx);
    const p = await newProduct(ctx, g.id, "Kola");
    const make = async (name: string, isInsideCabinet = true) => {
      const s = await setups.create(ctx, { name, isInsideCabinet });
      await setups.addItem(ctx, s.id, { productId: p.id, qty: 1 });
      return s;
    };
    return { make };
  }

  async function assigned(roomTypeId: string) {
    return (await testDb.roomTypeSetup.findMany({ where: { roomTypeId } })).map((r) => r.setupId).sort();
  }

  it("set farkı uygular, boş liste hepsini kaldırır, ROOMTYPE_SETUP_ASSIGN before/after yazar", async () => {
    const w = await minibarWorld();
    await testDb.roomTypeSetup.deleteMany({});
    const ctx = await sys();
    const { make } = await twoSetups(ctx);
    const [a, b, c] = [await make("A"), await make("B"), await make("C")];

    await roomTypeSetups.set(ctx, w.hotelId, w.roomType.id, [a.id, b.id]);
    expect(await assigned(w.roomType.id)).toEqual([a.id, b.id].sort());
    await roomTypeSetups.set(ctx, w.hotelId, w.roomType.id, [b.id, c.id]);
    expect(await assigned(w.roomType.id)).toEqual([b.id, c.id].sort());

    const logs = await testDb.auditLog.findMany({ where: { action: "ROOMTYPE_SETUP_ASSIGN" }, orderBy: { createdAt: "asc" } });
    expect(logs).toHaveLength(2);
    expect(logs[1].before).toEqual({ setupIds: [a.id, b.id].sort() });
    expect(logs[1].after).toEqual({ setupIds: [b.id, c.id].sort() });
    expect(published("RoomTypeSetup")).toHaveLength(2);

    await roomTypeSetups.set(ctx, w.hotelId, w.roomType.id, []);
    expect(await assigned(w.roomType.id)).toEqual([]);
  });

  it("içeriği boş veya pasif setup atanamaz; mesaj setup adını içerir", async () => {
    const w = await minibarWorld();
    const ctx = await sys();
    const empty = await setups.create(ctx, { name: "MINI-BOS" });
    const error = await expectDomainError(
      roomTypeSetups.set(ctx, w.hotelId, w.roomType.id, [empty.id]),
      "VALIDATION",
    );
    expect(error.fieldErrors?.setupIds).toEqual(["İçeriği boş setup atanamaz: MINI-BOS"]);

    const { make } = await twoSetups(ctx);
    const passive = await make("PASIF");
    await setups.setActive(ctx, passive.id, false);
    await expectDomainError(roomTypeSetups.set(ctx, w.hotelId, w.roomType.id, [passive.id]), "VALIDATION", /PASIF/);
    // the world's own assignment is untouched by the failed calls
    expect(await assigned(w.roomType.id)).toEqual([w.setup.id]);
  });

  it("eşzamanlı set([a]) ve set([b]): sonuç tam {a} veya tam {b}, P2002 sızmaz", async () => {
    const w = await minibarWorld();
    await testDb.roomTypeSetup.deleteMany({});
    const ctx = await sys();
    const { make } = await twoSetups(ctx);
    const [a, b] = [await make("A"), await make("B")];

    for (let round = 0; round < 5; round++) {
      const results = await Promise.allSettled([
        roomTypeSetups.set(ctx, w.hotelId, w.roomType.id, [a.id]),
        roomTypeSetups.set(ctx, w.hotelId, w.roomType.id, [b.id]),
      ]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
      const now = await assigned(w.roomType.id);
      expect([[a.id], [b.id]]).toContainEqual(now);
    }
  });

  it("R-OTM kendi otelinde atar; başka otelin oda tipi FORBIDDEN; kendi otelinde yabancı oda tipi NOT_FOUND", async () => {
    const mine = await minibarWorld({ hotelCode: "ROYAL" });
    const theirs = await minibarWorld({ hotelCode: "DIAMOND" });
    await testDb.roomTypeSetup.deleteMany({});
    const ctx = await sys();
    const { make } = await twoSetups(ctx);
    const a = await make("A");
    const otm = (await staff("R-OTM", "ROYAL")).ctx;

    await roomTypeSetups.set(otm, mine.hotelId, mine.roomType.id, [a.id]);
    expect(await assigned(mine.roomType.id)).toEqual([a.id]);

    await expectDomainError(roomTypeSetups.set(otm, theirs.hotelId, theirs.roomType.id, [a.id]), "FORBIDDEN");
    await expectDomainError(roomTypeSetups.set(otm, mine.hotelId, theirs.roomType.id, [a.id]), "NOT_FOUND");
    expect(await assigned(theirs.roomType.id)).toEqual([]);

    const view = await roomTypeSetups.get(otm, mine.hotelId);
    expect(view.roomTypes.find((r) => r.id === mine.roomType.id)?.setupIds).toEqual([a.id]);
    expect(view.setups.map((s) => s.id)).toContain(a.id);
  });

  it("POST/DELETE sarmalayıcıları mevcut listeyi birleştirir/çıkarır", async () => {
    const w = await minibarWorld();
    await testDb.roomTypeSetup.deleteMany({});
    const ctx = await sys();
    const { make } = await twoSetups(ctx);
    const [a, b] = [await make("A"), await make("B")];
    await roomTypeSetups.assignOne(ctx, w.hotelId, w.roomType.id, a.id);
    await roomTypeSetups.assignOne(ctx, w.hotelId, w.roomType.id, b.id);
    expect(await assigned(w.roomType.id)).toEqual([a.id, b.id].sort());
    await roomTypeSetups.unassignOne(ctx, w.hotelId, w.roomType.id, a.id);
    expect(await assigned(w.roomType.id)).toEqual([b.id]);
  });

  it("preview, buildChecklist ile aynıdır", async () => {
    const ctx = await sys();
    const w = await minibarWorld();
    await testDb.roomTypeSetup.deleteMany({});
    await testDb.roomType.update({ where: { id: w.roomType.id }, data: { cabinetCount: 2 } });
    const { make } = await twoSetups(ctx);
    const mini = await make("MINI", true);
    const extra = await make("EXTRA", false);
    await roomTypeSetups.set(ctx, w.hotelId, w.roomType.id, [mini.id, extra.id]);

    const preview = await roomTypeSetups.preview(ctx, w.hotelId, w.roomType.id);
    expect(preview).toEqual(
      buildChecklist({ cabinetCount: 2 }, [
        { id: mini.id, name: "MINI", isInsideCabinet: true },
        { id: extra.id, name: "EXTRA", isInsideCabinet: false },
      ]),
    );
    expect(preview.map((e) => e.label)).toEqual(["MINI - Dolap 1", "MINI - Dolap 2", "EXTRA"]);
  });
});

describe("denetim listesi iki adı da tanır", () => {
  it("eski CREATE ve yeni PRODUCT_CREATE aynı süzgeçte görünür", async () => {
    const royal = await hotelId("ROYAL");
    await testDb.auditLog.createMany({
      data: [
        { hotelId: royal, action: "CREATE", entity: "Product" },
        { hotelId: royal, action: "PRODUCT_CREATE", entity: "Product" },
        { hotelId: royal, action: "ASSIGN_SETUP", entity: "RoomTypeSetup" },
        { hotelId: royal, action: "ROOMTYPE_SETUP_ASSIGN", entity: "RoomTypeSetup" },
        { hotelId: royal, action: "LOGIN", entity: "User" },
      ],
    });
    const byOld = await listSystemAuditLogs({ hotelIds: [royal], action: "CREATE" });
    const byNew = await listSystemAuditLogs({ hotelIds: [royal], action: "PRODUCT_CREATE" });
    expect(byOld.map((l) => l.action).sort()).toEqual(["CREATE", "PRODUCT_CREATE"]);
    expect(byNew.map((l) => l.action).sort()).toEqual(["CREATE", "PRODUCT_CREATE"]);
    const assign = await listSystemAuditLogs({ hotelIds: [royal], action: "ASSIGN_SETUP" });
    expect(assign.map((l) => l.action).sort()).toEqual(["ASSIGN_SETUP", "ROOMTYPE_SETUP_ASSIGN"]);
  });
});
