import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runSeed } from "../../prisma/seed";
import { loadLegacyDefinitions } from "../../prisma/seed/legacyDefinitions";
import { testDb, truncate } from "../helpers/db";

const db = testDb;
/** Rows of the system-wide (hotelId = null) matrix after a fresh seed; update when the catalogue changes. */
const EXPECTED_PERMISSION_ROWS = 279; // 201 + 23 rows of the four YR delegate roles + R-MTY CR-RAD (radar) + 51 rows of R-FBY and R-OSS (KD), minus 7 RO-TEL rows (screen retired 13 Nov 2026), plus CR-DUR (Anlık Durum) for the 8 roles with CR-KOM, plus MB-OKI (Oda Kontrol İşlemleri) for R-SYS and R-OSS

async function permission(roleCode: string, screenCode: string) {
  return db.roleScreenPermission.findFirst({
    where: { hotelId: null, role: { code: roleCode }, screen: { code: screenCode } },
  });
}

async function counts() {
  return {
    hotels: await db.hotel.count(),
    modules: await db.hotelModule.count(),
    outlets: await db.outlet.count(),
    roles: await db.role.count(),
    screens: await db.appScreen.count(),
    permissions: await db.roleScreenPermission.count(),
    access: await db.roleModuleAccess.count(),
    settings: await db.setting.count(),
    users: await db.user.count(),
    floors: await db.floor.count(),
    rooms: await db.room.count(),
    roomTypes: await db.roomType.count(),
    products: await db.product.count(),
    setups: await db.setup.count(),
    setupItems: await db.setupItem.count(),
    roomTypeSetups: await db.roomTypeSetup.count(),
  };
}

describe("seed (gerçek test DB)", () => {
  beforeEach(async () => {
    await truncate("hotels", "roles", "app_screens", "settings", "users", "product_groups", "setups");
  });

  afterAll(async () => {
    await truncate("hotels", "roles", "app_screens", "settings", "users", "product_groups", "setups");
    await db.$disconnect();
  });

  it("seed 3 otel, 23 rol, 35 ekran ve admin üretir; otel başına yalnız bir Oda Servisi outleti (demo outlet yok)", async () => {
    await runSeed(db);
    expect(await db.hotel.count()).toBe(3);
    expect((await db.hotel.findMany()).every((h) => h.isSystemDefault)).toBe(true);
    expect(await db.role.count()).toBe(23);
    expect(await db.appScreen.count()).toBe(35);
    expect(await db.outlet.count()).toBe(3);
    expect(await db.outlet.count({ where: { type: "ODA_SERVISI" } })).toBe(3);
    expect(await db.hotelModule.count()).toBe(12);
    expect(await db.user.count({ where: { username: "admin" } })).toBe(1);
  });

  it("seed eski sistemin otel/kat/oda tipi/oda/ürün/setup tanımlarını referans veri olarak yükler (QR token yok)", async () => {
    await runSeed(db);
    const data = loadLegacyDefinitions();
    for (const h of data.hotels) {
      const hotel = await db.hotel.findUniqueOrThrow({ where: { code: h.code } });
      expect(await db.floor.count({ where: { hotelId: hotel.id } })).toBe(h.floors.length);
      expect(await db.roomType.count({ where: { hotelId: hotel.id } })).toBe(h.roomTypes.length);
      expect(await db.room.count({ where: { hotelId: hotel.id } })).toBe(h.rooms.length);
      expect(await db.roomTypeSetup.count({ where: { hotelId: hotel.id } })).toBe(h.roomTypeSetups.length);
      expect(hotel.logoUrl).toBe(h.logoUrl);
    }
    expect(await db.room.count({ where: { qrToken: { not: null } } })).toBe(0);
    expect(await db.productGroup.count()).toBeGreaterThanOrEqual(data.productGroups.length);
    expect(await db.product.count()).toBeGreaterThanOrEqual(data.products.length);
    expect(await db.setup.count()).toBeGreaterThanOrEqual(data.setups.length);
    expect(await db.outlet.count({ where: { type: { not: "ODA_SERVISI" } } })).toBe(0);
  });

  it("referans tanımları ikinci seed'de düzenlenmiş kayıtları ezmez ve pasifleştirmez", async () => {
    await runSeed(db);
    const sample = loadLegacyDefinitions().hotels[0];
    const hotel = await db.hotel.findUniqueOrThrow({ where: { code: sample.code } });
    const room = sample.rooms[0];
    await db.room.update({
      where: { hotelId_number: { hotelId: hotel.id, number: room.number } },
      data: { guestMessage: "Elle düzenlendi", isActive: false, qrToken: "elle-token" },
    });
    await db.hotel.update({ where: { id: hotel.id }, data: { logoUrl: "/brand/ozel.png" } });
    await runSeed(db);
    const after = await db.room.findUniqueOrThrow({
      where: { hotelId_number: { hotelId: hotel.id, number: room.number } },
    });
    expect(after.guestMessage).toBe("Elle düzenlendi");
    expect(after.isActive).toBe(false);
    expect(after.qrToken).toBe("elle-token");
    expect((await db.hotel.findUniqueOrThrow({ where: { id: hotel.id } })).logoUrl).toBe("/brand/ozel.png");
    expect(await db.room.count({ where: { hotelId: hotel.id } })).toBe(sample.rooms.length);
  });

  it("seed ikinci kez çalışınca kayıt sayıları değişmez", async () => {
    await runSeed(db);
    const first = await counts();
    await runSeed(db);
    expect(await counts()).toEqual(first);
    expect(first.settings).toBeGreaterThan(0);
    expect(first.permissions).toBeGreaterThan(0);
  });

  it("R-SYS tüm ekranlarda V,O,D,A,R; R-KAT MB-TUK için V,O,D ve A=false; R-KAT QS-KUY için satır yok", async () => {
    await runSeed(db);

    const sysRows = await db.roleScreenPermission.findMany({
      where: { hotelId: null, role: { code: "R-SYS" } },
    });
    expect(sysRows).toHaveLength(35);
    for (const row of sysRows) {
      expect([row.canView, row.canCreate, row.canEdit, row.canApprove, row.canReport]).toEqual([
        true,
        true,
        true,
        true,
        true,
      ]);
    }

    const katTuk = await permission("R-KAT", "MB-TUK");
    expect(katTuk).toMatchObject({
      canView: true,
      canCreate: true,
      canEdit: true,
      canApprove: false,
      canReport: false,
    });
    expect(await permission("R-KAT", "QS-KUY")).toBeNull();
  });

  it("R-KAT: MB-TAN ve MB-DOL satırı yok, MB-ZIM yalnız V,D; R-DEP depo ekranlarını düzenler", async () => {
    await runSeed(db);
    expect(await permission("R-KAT", "MB-TAN")).toBeNull();
    expect(await permission("R-KAT", "MB-DOL")).toBeNull();
    expect(await permission("R-KAT", "MB-ZIM")).toMatchObject({ canView: true, canCreate: false, canEdit: true, canApprove: false, canReport: false });
    for (const code of ["MB-ZIM", "MB-DOL"]) {
      expect(await permission("R-DEP", code)).toMatchObject({ canView: true, canCreate: true, canEdit: true });
    }
  });

  it("R-GAR QS-KUY için canApprove=false, R-SGF için true", async () => {
    await runSeed(db);
    expect((await permission("R-GAR", "QS-KUY"))?.canApprove).toBe(false);
    expect((await permission("R-SGF", "QS-KUY"))?.canApprove).toBe(true);
  });

  it("CORE ekranları: CR-RAP her role V,R; CR-KOM yalnız SISTEM/YONETIM; CR-KUL R-SYS, R-ITT (V,R) ve yönetim rolleri (V,O,D)", async () => {
    await runSeed(db);
    expect(await permission("R-HKS", "CR-RAP")).toMatchObject({ canView: true, canReport: true, canCreate: false });
    expect(await permission("R-OTM", "CR-KOM")).toMatchObject({ canView: true, canReport: true });
    expect(await permission("R-GAR", "CR-KOM")).toBeNull();
    // Anlık Durum (CR-DUR) goes to the same roles as CR-KOM; field roles get it only from the matrix.
    expect(await permission("R-OTM", "CR-DUR")).toMatchObject({ canView: true, canReport: true });
    expect(await permission("R-OSS", "CR-DUR")).toMatchObject({ canView: true, canReport: true });
    expect(await permission("R-MTY", "CR-DUR")).toMatchObject({ canView: true, canReport: true });
    expect(await permission("R-KAT", "CR-DUR")).toBeNull();
    expect(await permission("R-GAR", "CR-DUR")).toBeNull();
    expect(await permission("R-ITT", "CR-KUL")).toMatchObject({ canView: true, canReport: true, canCreate: false });
    expect(await permission("R-OTM", "CR-KUL")).toMatchObject({ canView: true, canCreate: true, canEdit: true, canApprove: false, canReport: false });
    expect(await permission("R-FBM", "CR-KUL")).toMatchObject({ canView: true, canCreate: true, canEdit: true, canApprove: false });
    expect(await permission("R-GAR", "CR-KUL")).toBeNull();
    expect(await permission("R-OTM", "CR-DEN")).toMatchObject({
      canView: true,
      canReport: true,
      canCreate: false,
      canEdit: false,
      canApprove: false,
    });
    expect(await permission("R-FBM", "CR-DEN")).toMatchObject({ canView: true, canReport: true });
    expect(await permission("R-ITT", "CR-DEN")).toMatchObject({ canView: true, canReport: true, canCreate: false });
    expect(await permission("R-SYS", "CR-DEN")).toMatchObject({ canView: true, canReport: true, canApprove: true });
    expect(await permission("R-GAR", "CR-DEN")).toBeNull();
  });

  it("tanım ekranları CR-TAN/CR-REH: R-SYS tam, R-ITT yalnız V, yönetim rolleri V,O,D; diğer rollerde satır yok", async () => {
    await runSeed(db);
    for (const code of ["CR-TAN", "CR-REH"]) {
      expect(await permission("R-SYS", code)).toMatchObject({ canView: true, canCreate: true, canEdit: true, canApprove: true, canReport: true });
      expect(await permission("R-ITT", code)).toMatchObject({ canView: true, canCreate: false, canEdit: false, canApprove: false, canReport: false });
      for (const role of ["R-OTM", "R-FBM"]) {
        expect(await permission(role, code)).toMatchObject({ canView: true, canCreate: true, canEdit: true, canApprove: false, canReport: false });
      }
      for (const role of ["R-GAR", "R-SGF", "R-KAS", "R-MUS", "R-KAT", "R-DEP", "R-HKS"]) {
        expect(await permission(role, code)).toBeNull();
      }
    }
    const screens = await db.appScreen.findMany({ where: { code: { in: ["CR-TAN", "CR-REH"] } }, orderBy: { sortOrder: "asc" } });
    expect(screens.map((s) => [s.code, s.name, s.path, s.moduleKey, s.sortOrder])).toEqual([
      ["CR-TAN", "Tanımlamalar", "/admin#core.tanimlar", "CORE", 32],
      ["CR-REH", "Kurulum Rehberi", "/admin#core.rehber", "CORE", 33],
    ]);
  });

  it("CR-RAD (Canlı Radar): CR-KOM'dan hemen sonra, sortOrder 26; R-SYS V,O,D,A,R; R-ITT/R-OTM/R-FBM V,R; diğer 17 rolde satır yok; ikinci seed satır eklemez", async () => {
    await runSeed(db);
    const screens = await db.appScreen.findMany({
      where: { code: { in: ["CR-KOM", "CR-RAD", "CR-TAN", "CR-REH"] } },
      orderBy: { sortOrder: "asc" },
    });
    expect(screens.map((s) => [s.code, s.sortOrder])).toEqual([
      ["CR-KOM", 25],
      ["CR-RAD", 26],
      ["CR-TAN", 32],
      ["CR-REH", 33],
    ]);
    expect(screens[1]).toMatchObject({ name: "Canlı Radar", path: "/radar", moduleKey: "CORE" });
    expect(await permission("R-SYS", "CR-RAD")).toMatchObject({ canView: true, canCreate: true, canEdit: true, canApprove: true, canReport: true });
    for (const role of ["R-ITT", "R-OTM", "R-FBM", "R-MTY", "R-FBY", "R-OSS"]) {
      expect(await permission(role, "CR-RAD")).toMatchObject({ canView: true, canReport: true, canCreate: false, canEdit: false, canApprove: false });
    }
    const others = (await db.role.findMany({ select: { code: true } })).map((r) => r.code).filter((c) => !["R-SYS", "R-ITT", "R-OTM", "R-FBM", "R-MTY", "R-FBY", "R-OSS"].includes(c));
    expect(others).toHaveLength(16);
    for (const role of others) expect(await permission(role, "CR-RAD")).toBeNull();
    const before = await db.roleScreenPermission.count();
    await runSeed(db);
    expect(await db.roleScreenPermission.count()).toBe(before);
  });

  it("mevcut veritabanında runSeed yeni iki ekranı ve izinlerini sonradan ekler", async () => {
    await runSeed(db);
    await db.appScreen.deleteMany({ where: { code: { in: ["CR-TAN", "CR-REH"] } } });
    expect(await db.appScreen.count()).toBe(33);
    await runSeed(db);
    expect(await db.appScreen.count()).toBe(35);
    expect(await permission("R-OTM", "CR-TAN")).toMatchObject({ canView: true, canCreate: true, canEdit: true });
  });

  it("rol ve ekran alanları: R-KAT maxOnlineMinutes 600 ve defaultScreen MB-KAT; ekran yolu ve sortOrder katalogla aynı", async () => {
    await runSeed(db);
    const kat = await db.role.findUniqueOrThrow({ where: { code: "R-KAT" } });
    expect(kat).toMatchObject({ kind: "MINIBAR", maxOnlineMinutes: 600, defaultScreen: "MB-KAT", isSystem: true });
    const tuk = await db.appScreen.findUniqueOrThrow({ where: { code: "MB-TUK" } });
    expect(tuk).toMatchObject({ path: "/kat", moduleKey: "MINIBAR", sortOrder: 3 });
    const first = await db.appScreen.findFirstOrThrow({ orderBy: { sortOrder: "asc" } });
    expect(first).toMatchObject({ code: "MB-KAT", path: "/kat", sortOrder: 1 });
    const orders = (await db.appScreen.findMany({ orderBy: { sortOrder: "asc" } })).map((s) => s.sortOrder);
    expect(orders).toEqual(Array.from({ length: 35 }, (_, i) => i + 1));
  });

  it("toplam sistem yetki satırı sayısı sabittir (yeniden seed artırmaz)", async () => {
    await runSeed(db);
    const total = await db.roleScreenPermission.count({ where: { hotelId: null } });
    expect(total).toBe(EXPECTED_PERMISSION_ROWS);
    await runSeed(db);
    expect(await db.roleScreenPermission.count({ where: { hotelId: null } })).toBe(EXPECTED_PERMISSION_ROWS);
  });

  it("yeniden seed düzenlenmiş yetki satırını ezmez", async () => {
    await runSeed(db);
    const before = await permission("R-KAT", "MB-TUK");
    expect(before?.canEdit).toBe(true);
    await db.roleScreenPermission.update({
      where: { id: before!.id },
      data: { canEdit: false, canApprove: true },
    });
    await runSeed(db);
    expect(await permission("R-KAT", "MB-TUK")).toMatchObject({ id: before!.id, canEdit: false, canApprove: true });
  });

  it("modül erişimi: R-KAT yalnız MINIBAR, R-SYS CORE dışındaki dört modül", async () => {
    await runSeed(db);
    const keys = async (code: string) =>
      (
        await db.roleModuleAccess.findMany({
          where: { hotelId: null, enabled: true, role: { code } },
        })
      )
        .map((a) => a.moduleKey)
        .sort();
    expect(await keys("R-KAT")).toEqual(["MINIBAR"]);
    expect(await keys("R-SYS")).toEqual(["MINIBAR", "QR_MENU", "QR_ORDER", "ROOM_SERVICE"]);
  });

  it("sistem ayarları (hotelId=null) tohumlanır", async () => {
    await runSeed(db);
    const get = async (key: string) =>
      (await db.setting.findFirstOrThrow({ where: { hotelId: null, key } })).value;
    expect(await get("session.maxOnlineMinutes")).toBe(480);
    expect(await get("price.display")).toBe("HIDE");
    expect(await get("session.singleDevice")).toBe(true);
  });

  it("hotelId=null için aynı ayar anahtarı ikinci kez eklenemez (kısmi unique indeks)", async () => {
    await db.setting.create({ data: { hotelId: null, key: "x", value: 1 } });
    await expect(
      db.setting.create({ data: { hotelId: null, key: "x", value: 2 } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("SEED_ADMIN_PASSWORD yoksa runSeed hiçbir şey yazmadan hata verir", async () => {
    const saved = process.env.SEED_ADMIN_PASSWORD;
    delete process.env.SEED_ADMIN_PASSWORD;
    try {
      await expect(runSeed(db)).rejects.toThrow(
        "SEED_ADMIN_PASSWORD tanımlı değil veya 10 karakterden kısa; .env dosyasına ekleyin",
      );
      process.env.SEED_ADMIN_PASSWORD = "kisa";
      await expect(runSeed(db)).rejects.toThrow(/10 karakterden kısa/);
      expect(await db.hotel.count()).toBe(0);
    } finally {
      if (saved === undefined) delete process.env.SEED_ADMIN_PASSWORD;
      else process.env.SEED_ADMIN_PASSWORD = saved;
    }
  });

  it("önceden eklenmiş outletleri ikinci seed çalıştırmasında korur", async () => {
    await runSeed(db);
    const hotel = await db.hotel.findFirstOrThrow({ where: { code: "ROYAL" } });
    await db.outlet.create({
      data: { hotelId: hotel.id, name: "Özel Bar", type: "BAR", hasMenu: true, hasOrdering: true },
    });
    await runSeed(db);
    expect(await db.outlet.count({ where: { type: "BAR", name: "Özel Bar" } })).toBe(1);
  });
  it("var olan admin'in parolası, rolü ve aktiflik durumu seed ile ezilmez", async () => {
    await runSeed(db);
    const admin = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
    const hash = await bcrypt.hash("baska-parola-123", 4);
    await db.user.update({ where: { id: admin.id }, data: { passwordHash: hash, isActive: false } });
    await runSeed(db);
    expect(await db.user.findUniqueOrThrow({ where: { username: "admin" } })).toMatchObject({
      id: admin.id,
      passwordHash: hash,
      isActive: false,
    });
  });

  it("admin varsa SEED_ADMIN_PASSWORD gerekmez; yoksa gerekir", async () => {
    await runSeed(db);
    const saved = process.env.SEED_ADMIN_PASSWORD;
    delete process.env.SEED_ADMIN_PASSWORD;
    try {
      await expect(runSeed(db)).resolves.toBeUndefined();
    } finally {
      if (saved !== undefined) process.env.SEED_ADMIN_PASSWORD = saved;
    }
  });

  it("seed pasif yapılmış oteli yeniden aktifleştirmez", async () => {
    await runSeed(db);
    await db.hotel.update({ where: { code: "ROYAL" }, data: { isActive: false } });
    await runSeed(db);
    expect((await db.hotel.findUniqueOrThrow({ where: { code: "ROYAL" } })).isActive).toBe(false);
  });

  describe("SEED_DEMO", () => {
    const withDemo = async (value: string | undefined, fn: () => Promise<void>) => {
      const saved = process.env.SEED_DEMO;
      if (value === undefined) delete process.env.SEED_DEMO;
      else process.env.SEED_DEMO = value;
      try {
        await fn();
      } finally {
        if (saved === undefined) delete process.env.SEED_DEMO;
        else process.env.SEED_DEMO = saved;
      }
    };

    it("varsayılan seed demo outlet, menü ve personel üretmez", async () => {
      await withDemo(undefined, async () => {
        await runSeed(db);
        expect(await db.outlet.count({ where: { type: { not: "ODA_SERVISI" } } })).toBe(0);
        expect(await db.menuNode.count()).toBe(0);
        expect(await db.user.count()).toBe(1);
      });
    });

    it("SEED_DEMO=true outlet, menü ve rastgele parolalı personel üretir; ikinci çalıştırma yinelemez", async () => {
      await withDemo("true", async () => {
        await runSeed(db);
        const first = { outlets: await db.outlet.count(), nodes: await db.menuNode.count(), users: await db.user.count() };
        expect(first.outlets).toBeGreaterThan(0);
        expect(first.nodes).toBeGreaterThan(0);
        expect(first.users).toBeGreaterThan(1);
        const staff = await db.user.findMany({ where: { username: { not: "admin" } } });
        expect(staff.every((u) => u.mustChangePassword)).toBe(true);
        expect(new Set(staff.map((u) => u.passwordHash)).size).toBe(staff.length);
        await runSeed(db);
        expect({ outlets: await db.outlet.count(), nodes: await db.menuNode.count(), users: await db.user.count() }).toEqual(first);
      });
    }, 60_000);

    it("dolu menüye dokunmaz: ad, fiyat ve aktiflik korunur", async () => {
      await withDemo("true", async () => {
        await runSeed(db);
        const outlet = await db.outlet.findFirstOrThrow({ where: { menuNodes: { some: {} } } });
        const root = await db.menuNode.findFirstOrThrow({ where: { outletId: outlet.id, parentId: null } });
        await db.menuNode.update({ where: { id: root.id }, data: { name: "Özel Kategori", isActive: false } });
        const before = await db.menuNode.count({ where: { outletId: outlet.id } });
        await runSeed(db);
        expect(await db.menuNode.count({ where: { outletId: outlet.id } })).toBe(before);
        expect(await db.menuNode.findUniqueOrThrow({ where: { id: root.id } })).toMatchObject({ name: "Özel Kategori", isActive: false });
      });
    }, 60_000);

    it("var olan personelin rolü, oteli ve aktifliği sıfırlanmaz", async () => {
      await withDemo("true", async () => {
        await runSeed(db);
        const user = await db.user.findFirstOrThrow({ where: { username: { not: "admin" } } });
        await db.user.update({ where: { id: user.id }, data: { isActive: false } });
        await runSeed(db);
        expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).isActive).toBe(false);
      });
    }, 60_000);
  });
});
