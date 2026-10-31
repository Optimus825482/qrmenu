import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runSeed } from "../../prisma/seed";
import { testDb, truncate } from "../helpers/db";

const db = testDb;

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
  };
}

describe("seed (gerçek test DB)", () => {
  beforeEach(async () => {
    await truncate("hotels", "roles", "app_screens", "settings", "users");
  });

  afterAll(async () => {
    await truncate("hotels", "roles", "app_screens", "settings", "users");
    await db.$disconnect();
  });

  it("seed 3 otel, 17 rol, 31 ekran, 3 oda servisi outleti ve admin üretir", async () => {
    await runSeed(db);
    expect(await db.hotel.count()).toBe(3);
    expect((await db.hotel.findMany()).every((h) => h.isSystemDefault)).toBe(true);
    expect(await db.role.count()).toBe(17);
    expect(await db.appScreen.count()).toBe(31);
    expect(await db.outlet.count({ where: { type: "ODA_SERVISI" } })).toBe(3);
    expect(await db.hotelModule.count()).toBe(12);
    expect(await db.user.count({ where: { username: "admin" } })).toBe(1);
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
    expect(sysRows).toHaveLength(31);
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

  it("R-GAR QS-KUY için canApprove=false, R-SGF için true", async () => {
    await runSeed(db);
    expect((await permission("R-GAR", "QS-KUY"))?.canApprove).toBe(false);
    expect((await permission("R-SGF", "QS-KUY"))?.canApprove).toBe(true);
  });

  it("CORE ekranları: CR-RAP her role V,R; CR-KOM yalnız SISTEM/YONETIM; CR-KUL yalnız R-SYS ve R-ITT", async () => {
    await runSeed(db);
    expect(await permission("R-HKS", "CR-RAP")).toMatchObject({ canView: true, canReport: true, canCreate: false });
    expect(await permission("R-OTM", "CR-KOM")).toMatchObject({ canView: true, canReport: true });
    expect(await permission("R-GAR", "CR-KOM")).toBeNull();
    expect(await permission("R-ITT", "CR-KUL")).toMatchObject({ canView: true, canReport: true, canCreate: false });
    expect(await permission("R-OTM", "CR-KUL")).toBeNull();
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
    expect(await get("price.currency")).toBe("EUR");
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

  it("oda servisi outleti yeniden adlandırılsa bile ikinci seed onu türüne göre bulur", async () => {
    await runSeed(db);
    await db.outlet.updateMany({ where: { type: "ODA_SERVISI" }, data: { name: "IRD" } });
    await runSeed(db);
    expect(await db.outlet.count({ where: { type: "ODA_SERVISI" } })).toBe(3);
    expect(await db.outlet.count({ where: { type: "ODA_SERVISI", name: "IRD" } })).toBe(3);
  });
});
