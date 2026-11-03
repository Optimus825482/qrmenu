import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../scripts/migrate-from-minibarlatest/index";
import { LegacyReader } from "../../scripts/migrate-from-minibarlatest/legacy";
import { decodeLogo } from "../../scripts/migrate-from-minibarlatest/logos";
import { testDb, truncate } from "../helpers/db";
import { dropReferenceData, resetReferenceData } from "../helpers/fixtures";
import { dropLegacyFixture, legacyExec, loadLegacyFixture } from "../helpers/legacyFixture";

const URL = process.env.DATABASE_URL_TEST!;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mig-def-"));
const reportPath = path.join(tmp, "rapor.md");
const logoDir = path.join(tmp, "logos");
const env = { LEGACY_DATABASE_URL: URL, DATABASE_URL: URL };
const quiet = { log: () => undefined };

const run = (...extra: string[]) =>
  main(["--legacy-schema", "legacy_fx", "--report", reportPath, "--logo-dir", logoDir, "--only", "definitions", ...extra], env, quiet);

const report = () => fs.readFileSync(reportPath, "utf8");
/** [legacy, created, existing, dropped, failed, fark] of a report table row. */
function row(name: string): number[] {
  const m = new RegExp(`\\| ${name} \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (-?\\d+) \\|`).exec(report());
  if (!m) throw new Error(`rapor satırı yok: ${name}`);
  return m.slice(1).map(Number);
}
function warnCount(code: string): number {
  const m = new RegExp(`\\*\\*${code}\\*\\* \\((\\d+)\\)`).exec(report());
  return m ? Number(m[1]) : 0;
}

const TARGET_TABLES = [
  "room_type_setups",
  "setup_items",
  "setups",
  "products",
  "product_groups",
  "rooms",
  "room_types",
  "floors",
  "legacy_id_map",
] as const;

async function resetTarget() {
  await truncate(...TARGET_TABLES);
  await testDb.auditLog.deleteMany({ where: { action: "LEGACY_MIGRATION" } });
  await testDb.hotel.updateMany({ data: { logoUrl: null, address: null, phone: null } });
  fs.rmSync(logoDir, { recursive: true, force: true });
}

async function counts() {
  const [floors, rooms, types, groups, products, setups, items, assigns, map] = await Promise.all([
    testDb.floor.count(),
    testDb.room.count(),
    testDb.roomType.count(),
    testDb.productGroup.count(),
    testDb.product.count(),
    testDb.setup.count(),
    testDb.setupItem.count(),
    testDb.roomTypeSetup.count(),
    testDb.legacyIdMap.count(),
  ]);
  return { floors, rooms, types, groups, products, setups, items, assigns, map };
}

/** Natural-key snapshot (ids differ between runs). */
async function snapshot() {
  const [floors, rooms, types, products, items, assigns] = await Promise.all([
    testDb.floor.findMany({ include: { hotel: true }, orderBy: [{ hotelId: "asc" }, { number: "asc" }] }),
    testDb.room.findMany({ include: { hotel: true, floor: true, roomType: true } }),
    testDb.roomType.findMany({ include: { hotel: true } }),
    testDb.product.findMany({ include: { group: true } }),
    testDb.setupItem.findMany({ include: { setup: true, product: true } }),
    testDb.roomTypeSetup.findMany({ include: { hotel: true, roomType: true, setup: true } }),
  ]);
  const sort = (a: string, b: string) => a.localeCompare(b);
  return {
    floors: floors.map((f) => `${f.hotel.code}|${f.number}|${f.name}`).sort(sort),
    rooms: rooms
      .map((r) => `${r.hotel.code}|${r.number}|${r.floor.number}|${r.roomType?.name ?? "-"}|${r.qrToken ?? "-"}|${r.guestMessage?.length ?? 0}`)
      .sort(sort),
    types: types.map((t) => `${t.hotel.code}|${t.name}|${t.cabinetCount}`).sort(sort),
    products: products.map((p) => `${p.group.name}|${p.name}|${p.barcode ?? "-"}|${p.salePrice?.toString() ?? "-"}`).sort(sort),
    items: items.map((i) => `${i.setup.name}|${i.product.name}|${i.qty}`).sort(sort),
    assigns: assigns.map((a) => `${a.hotel.code}|${a.roomType.name}|${a.setup.name}`).sort(sort),
  };
}

beforeAll(async () => {
  await resetReferenceData();
  await loadLegacyFixture();
});
afterAll(async () => {
  await resetTarget();
  await dropLegacyFixture();
  await dropReferenceData();
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(async () => {
  await resetTarget();
  await loadLegacyFixture();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("tanımlar: eşleme ve içerik", () => {
  it("temiz çalıştırma beklenen sayıları ve raporda sıfır fark üretir", async () => {
    expect(await run()).toBe(0);
    expect(await counts()).toMatchObject({ floors: 5, rooms: 6, types: 5, groups: 5, products: 5, setups: 3, items: 4, assigns: 5 });
    for (const name of ["hotel", "floor", "roomType", "room", "productGroup", "product", "setup", "setupItem", "roomTypeSetup"]) {
      expect(row(name)[5], name).toBe(0);
    }
    expect(await testDb.auditLog.count({ where: { action: "LEGACY_MIGRATION" } })).toBe(1);
  });

  it("oteller ad eşlemesiyle bulunur; 'Royal' alt dizgesi Diamond/Premium'u çalmaz", async () => {
    expect(await run()).toBe(0);
    const map = await testDb.legacyIdMap.findMany({ where: { entity: "hotel" } });
    const byLegacy = new Map(map.map((m) => [m.legacyId, m.newId]));
    const code = async (legacy: string) => (await testDb.hotel.findUniqueOrThrow({ where: { id: byLegacy.get(legacy)! } })).code;
    expect(await code("1")).toBe("DIAMOND");
    expect(await code("3")).toBe("PREMIUM");
    expect(await code("4")).toBe("ROYAL");
    const hotel = await testDb.hotel.findUniqueOrThrow({ where: { code: "DIAMOND" } });
    expect(hotel.address).toBe("Girne");
    expect(hotel.emailNotifyEnabled).toBe(true);
  });

  it("eşleşmeyen otel ConfigError (2) verir ve hedefe hiçbir satır yazılmaz; --hotel-map ile geçer", async () => {
    await legacyExec(`INSERT INTO oteller (id, ad, aktif) VALUES (5, 'Crystal Rocks', true)`);
    expect(await run()).toBe(2);
    expect(report()).toContain("Crystal Rocks");
    expect(await counts()).toEqual({ floors: 0, rooms: 0, types: 0, groups: 0, products: 0, setups: 0, items: 0, assigns: 0, map: 0 });
    expect(await testDb.auditLog.count({ where: { action: "LEGACY_MIGRATION" } })).toBe(0);
    expect(await run("--hotel-map", "5=PREMIUM")).toBe(0);
    expect((await counts()).rooms).toBe(6);
  });

  it("katlar: çift kat_no tek Floor + uyarı, iki katın odaları da taşınır", async () => {
    expect(await run()).toBe(0);
    const diamond = await testDb.hotel.findUniqueOrThrow({ where: { code: "DIAMOND" } });
    expect(await testDb.floor.count({ where: { hotelId: diamond.id } })).toBe(2);
    expect(warnCount("KAT_NO_COBLU")).toBe(1);
    const rooms = await testDb.room.findMany({ where: { hotelId: diamond.id }, include: { floor: true } });
    expect(rooms.map((r) => `${r.number}@${r.floor.number}`).sort()).toEqual(["001@0", "101@1", "102@1"]);
  });

  it("oda tipi otel kopyası: STANDART iki otelde 2 RoomType, kullanılmayan tip taşınmaz", async () => {
    expect(await run()).toBe(0);
    expect(await testDb.roomType.count({ where: { name: "STANDART" } })).toBe(2);
    expect(await testDb.roomType.count({ where: { name: "SUIT" } })).toBe(3);
    expect(await testDb.roomType.count({ where: { name: "KULLANILMAYAN" } })).toBe(0);
    expect((await testDb.roomType.findFirstOrThrow({ where: { name: "SUIT" } })).cabinetCount).toBe(2);
    expect(warnCount("TIP_KULLANILMIYOR")).toBe(1);
  });

  it("odalar: qr_kod_token aynen kalır (kabul 9), katsız oda düşer, mesaj 500'e kısalır, çift oda_no düşer", async () => {
    expect(await run()).toBe(0);
    const room = await testDb.room.findUnique({ where: { qrToken: "123456" }, include: { hotel: true, floor: true } });
    expect(room?.number).toBe("001");
    expect(room?.hotel.code).toBe("DIAMOND");
    expect(room?.qrGeneratedAt).toBeInstanceOf(Date);
    expect((await testDb.room.findUnique({ where: { qrToken: "A1B2C3" } }))?.number).toBe("101");
    expect(await testDb.room.findFirst({ where: { number: "999" } })).toBeNull();
    expect(warnCount("ODA_KATSIZ")).toBe(1);
    expect(warnCount("ODA_NO_COBLU")).toBe(1);
    expect(await testDb.room.findUnique({ where: { qrToken: "888888" } })).toBeNull();
    expect(warnCount("MESAJ_KISALTILDI")).toBe(1);
    const long = await testDb.room.findFirstOrThrow({ where: { guestMessage: { not: null }, number: "101", hotel: { code: "ROYAL" } } });
    expect(long.guestMessage).toHaveLength(500);
    // Same room number in two hotels: both migrated.
    expect(await testDb.room.count({ where: { number: "101" } })).toBe(2);
  });

  it("ürünler: '12.5' -> 12.50, negatif fiyat null + uyarı, çift barkod null + URUN_CAKISMA, grupsuz ürün düşer", async () => {
    expect(await run()).toBe(0);
    expect((await testDb.product.findFirstOrThrow({ where: { name: "Kola" } })).salePrice?.toString()).toBe("12.5");
    expect((await testDb.product.findFirstOrThrow({ where: { name: "Fanta" } })).salePrice).toBeNull();
    expect((await testDb.product.findFirstOrThrow({ where: { name: "Fanta" } })).purchasePrice?.toString()).toBe("5.25");
    expect(warnCount("FIYAT_GECERSIZ")).toBe(1);
    expect((await testDb.product.findFirstOrThrow({ where: { name: "Su 0.5" } })).barcode).toBeNull();
    expect((await testDb.product.findFirstOrThrow({ where: { name: "Kola" } })).barcode).toBe("8690001");
    expect(warnCount("URUN_CAKISMA")).toBe(1);
    expect(await testDb.product.count({ where: { name: "Grupsuz Ürün" } })).toBe(0);
    expect((await testDb.product.findFirstOrThrow({ where: { name: "Fanta" } })).criticalLevel).toBe(10);
  });

  it("hedefte aynı adlı grup (harf farkı) varken grup existing; mevcut ürün tekrarlanmaz", async () => {
    const group = await testDb.productGroup.create({ data: { name: "İÇECEKLER" } });
    await testDb.product.create({ data: { groupId: group.id, name: "KOLA", unit: "Adet" } });
    expect(await run()).toBe(0);
    expect(await testDb.productGroup.count()).toBe(5);
    expect(row("productGroup")).toEqual([5, 4, 1, 0, 0, 0]);
    expect(await testDb.product.count({ where: { groupId: group.id } })).toBe(2); // KOLA (existing) + Fanta
    expect(row("product")[2]).toBe(1);
    const map = await testDb.legacyIdMap.findFirstOrThrow({ where: { entity: "productGroup", legacyId: "1" } });
    expect(map.newId).toBe(group.id);
  });

  it("seed'in yazdığı satırlar için legacy_id_map yazılır, kopya oluşmaz", async () => {
    const diamond = await testDb.hotel.findUniqueOrThrow({ where: { code: "DIAMOND" } });
    const floor = await testDb.floor.create({ data: { hotelId: diamond.id, number: 0, name: "Zemin" } });
    const type = await testDb.roomType.create({ data: { hotelId: diamond.id, name: "STANDART", cabinetCount: 1 } });
    const room = await testDb.room.create({ data: { hotelId: diamond.id, floorId: floor.id, roomTypeId: type.id, number: "001" } });
    expect(await run()).toBe(0);
    expect(await testDb.floor.count({ where: { hotelId: diamond.id, number: 0 } })).toBe(1);
    expect(await testDb.roomType.count({ where: { hotelId: diamond.id, name: "STANDART" } })).toBe(1);
    expect(await testDb.room.count({ where: { hotelId: diamond.id, number: "001" } })).toBe(1);
    expect((await testDb.legacyIdMap.findFirstOrThrow({ where: { entity: "floor", legacyId: "1" } })).newId).toBe(floor.id);
    expect((await testDb.legacyIdMap.findFirstOrThrow({ where: { entity: "room", legacyId: "1" } })).newId).toBe(room.id);
    // The seeded room had no QR token: the legacy one is filled in.
    expect((await testDb.room.findUniqueOrThrow({ where: { id: room.id } })).qrToken).toBe("123456");
    expect(row("floor")[2]).toBeGreaterThanOrEqual(1);
  });

  it("var olan QR token'ı ezilmez", async () => {
    const diamond = await testDb.hotel.findUniqueOrThrow({ where: { code: "DIAMOND" } });
    const floor = await testDb.floor.create({ data: { hotelId: diamond.id, number: 0, name: "Zemin" } });
    const room = await testDb.room.create({ data: { hotelId: diamond.id, floorId: floor.id, number: "001", qrToken: "KEEP.ME" } });
    expect(await run()).toBe(0);
    expect((await testDb.room.findUniqueOrThrow({ where: { id: room.id } })).qrToken).toBe("KEEP.ME");
    expect(await testDb.room.findUnique({ where: { qrToken: "123456" } })).toBeNull();
  });

  it("setup içeriği: üç satır tek SetupItem (toplam adet), yetim satırlar düşer, adet 0 -> 1", async () => {
    expect(await run()).toBe(0);
    const setup = await testDb.setup.findUniqueOrThrow({ where: { name: "Standart Setup" } });
    const kola = await testDb.product.findFirstOrThrow({ where: { name: "Kola" } });
    const item = await testDb.setupItem.findUniqueOrThrow({ where: { setupId_productId: { setupId: setup.id, productId: kola.id } } });
    expect(item.qty).toBe(6);
    expect(warnCount("SETUP_ICERIK_TEKRAR")).toBe(1);
    expect(warnCount("SETUP_ICERIK_YETIM")).toBe(2);
    expect(warnCount("SETUP_ICERIK_ADET")).toBe(1);
    const suit = await testDb.setup.findUniqueOrThrow({ where: { name: "Suit Setup" } });
    const su = await testDb.product.findFirstOrThrow({ where: { name: "Su 0.5" } });
    expect((await testDb.setupItem.findUniqueOrThrow({ where: { setupId_productId: { setupId: suit.id, productId: su.id } } })).qty).toBe(1);
    expect(await testDb.setupItem.count()).toBe(4);
    expect(row("setupItem")).toEqual([8, 4, 0, 4, 0, 0]);
    expect((await testDb.setup.findUniqueOrThrow({ where: { name: "Suit Setup" } })).isInsideCabinet).toBe(false);
    expect((await testDb.setup.findUniqueOrThrow({ where: { name: "Boş Setup" } })).isInsideCabinet).toBe(true);
  });

  it("atamalar: kopyası olmayan satır düşer", async () => {
    expect(await run()).toBe(0);
    expect(await testDb.roomTypeSetup.count()).toBe(5);
    expect(row("roomTypeSetup")).toEqual([6, 5, 0, 1, 0, 0]);
    expect(warnCount("ATAMA_YETIM")).toBe(1);
  });
});

describe("tanımlar: logolar", () => {
  it("geçerli PNG dosyaya yazılır ve logoUrl set olur; geçersiz base64 atlanır, çalışma sürer", async () => {
    expect(await run()).toBe(0);
    const file = path.join(logoDir, "diamond.png");
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file).subarray(1, 4).toString()).toBe("PNG");
    expect((await testDb.hotel.findUniqueOrThrow({ where: { code: "DIAMOND" } })).logoUrl).toBe("/brand/hotels/diamond.png");
    expect((await testDb.hotel.findUniqueOrThrow({ where: { code: "ROYAL" } })).logoUrl).toBeNull();
    expect(fs.existsSync(path.join(logoDir, "royal.png"))).toBe(false);
    expect(warnCount("LOGO_ATLANDI")).toBe(1);
  });

  it("SVG logo SVG_DESTEKLENMEZ olarak atlanır", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString("base64");
    await legacyExec(`UPDATE oteller SET logo = 'data:image/svg+xml;base64,${svg}' WHERE id = 3`);
    expect(await run()).toBe(0);
    expect(warnCount("SVG_DESTEKLENMEZ")).toBe(1);
    expect((await testDb.hotel.findUniqueOrThrow({ where: { code: "PREMIUM" } })).logoUrl).toBeNull();
    expect(decodeLogo("<svg></svg>")).toEqual({ ok: false, reason: "SVG_DESTEKLENMEZ" });
    expect(decodeLogo("aGVsbG8gd29ybGQgdGhpcyBpcyBub3QgYW4gaW1hZ2U=")).toEqual({ ok: false, reason: "GORSEL_DEGIL" });
    expect(decodeLogo("  ")).toEqual({ ok: false, reason: "BOS" });
  });

  it("kuru çalıştırmada dosya yazılmaz; ikinci çalıştırma dosyayı yeniden yazmaz; dolu logoUrl ezilmez", async () => {
    expect(await run("--dry-run")).toBe(0);
    expect(fs.existsSync(logoDir)).toBe(false);
    expect(await run()).toBe(0);
    const file = path.join(logoDir, "diamond.png");
    const before = fs.statSync(file).mtimeMs;
    expect(await run()).toBe(0);
    expect(fs.statSync(file).mtimeMs).toBe(before);

    await resetTarget();
    await testDb.hotel.update({ where: { code: "DIAMOND" }, data: { logoUrl: "/brand/hotels/diamond.webp" } });
    expect(await run()).toBe(0);
    expect((await testDb.hotel.findUniqueOrThrow({ where: { code: "DIAMOND" } })).logoUrl).toBe("/brand/hotels/diamond.webp");
    expect(fs.existsSync(logoDir)).toBe(false);
  });

  it("dosya zaten varsa üzerine yazılmaz", async () => {
    fs.mkdirSync(logoDir, { recursive: true });
    fs.writeFileSync(path.join(logoDir, "diamond.png"), "mevcut");
    expect(await run()).toBe(0);
    expect(fs.readFileSync(path.join(logoDir, "diamond.png"), "utf8")).toBe("mevcut");
    expect((await testDb.hotel.findUniqueOrThrow({ where: { code: "DIAMOND" } })).logoUrl).toBe("/brand/hotels/diamond.png");
  });
});

describe("tanımlar: idempotency, kısmi çalışma, kuru çalıştırma", () => {
  it("ikinci çalıştırma hiçbir varlıkta yeni satır yaratmaz ve legacy_id_map sayısı değişmez", async () => {
    expect(await run()).toBe(0);
    const first = await counts();
    const snap = await snapshot();
    expect(await run()).toBe(0);
    expect(await counts()).toEqual(first);
    expect(await snapshot()).toEqual(snap);
    for (const name of ["hotel", "floor", "roomType", "room", "productGroup", "product", "setup", "setupItem", "roomTypeSetup"]) {
      expect(row(name)[1], `${name} created`).toBe(0);
      expect(row(name)[5], `${name} fark`).toBe(0);
    }
    expect(row("floor")).toEqual([6, 0, 6, 0, 0, 0]);
  });

  it("kısmi çalışma: setuplar okuması bir kez fırlatır -> ilk çalıştırma FAIL (önceki parçalar kalır), ikincisi eksikleri ekler ve sonuç temiz çalıştırmayla aynı", async () => {
    // Reference: a clean run.
    expect(await run()).toBe(0);
    const clean = await snapshot();
    const cleanCounts = await counts();
    await resetTarget();

    const original = LegacyReader.prototype.rows;
    let fired = false;
    vi.spyOn(LegacyReader.prototype, "rows").mockImplementation(function (this: LegacyReader, table: string, spec: never) {
      if (table === "setuplar" && !fired) {
        fired = true;
        throw new Error("sahte okuma hatası");
      }
      return original.call(this, table, spec);
    } as never);

    expect(await run()).toBe(1);
    expect(report()).toContain("sahte okuma hatası");
    const partial = await counts();
    expect(partial.rooms).toBe(6);
    expect(partial.products).toBe(5);
    expect(partial.setups).toBe(0);
    expect(partial.items).toBe(0);

    expect(await run()).toBe(0);
    expect(await snapshot()).toEqual(clean);
    expect(await counts()).toEqual(cleanCounts);
  });

  it("kuru çalıştırma tanım tablolarının ve legacy_id_map'in sayılarını değiştirmez, raporda yine de sayar", async () => {
    const before = await counts();
    expect(await run("--dry-run")).toBe(0);
    expect(await counts()).toEqual(before);
    expect(await testDb.auditLog.count({ where: { action: "LEGACY_MIGRATION" } })).toBe(0);
    expect(report().startsWith("# Göç raporu — KURU ÇALIŞTIRMA")).toBe(true);
    expect(row("room")).toEqual([8, 6, 0, 2, 0, 0]);
    expect(row("floor")[1]).toBe(5);
  });

  it("kuru çalıştırmadan sonra gerçek çalıştırma aynı sonucu verir", async () => {
    expect(await run("--dry-run")).toBe(0);
    expect(await run()).toBe(0);
    expect(row("room")).toEqual([8, 6, 0, 2, 0, 0]);
    expect((await counts()).rooms).toBe(6);
  });

  it("eksik isteğe bağlı legacy kolonu çökme yaratmaz, tek uyarı verir", async () => {
    await legacyExec(`ALTER TABLE oteller DROP COLUMN email_sistem_aktif`);
    expect(await run()).toBe(0);
    expect(warnCount("KOLON_EKSIK")).toBe(1);
  });
});
