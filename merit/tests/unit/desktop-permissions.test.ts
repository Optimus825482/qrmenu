import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData, roleByCode } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { visibleScreens, can } = await import("@/lib/rbac");
const { registerCoreApps } = await import("@/modules/core/apps");
const { registerMenuApps } = await import("@/modules/menu/apps");
const { registerOrderApps } = await import("@/modules/order/apps");
const { registerMinibarApps } = await import("@/modules/minibar/apps");
const { registerMybarApps } = await import("@/modules/mybar/apps");
const { getApps } = await import("@/shell/registry");
const { visibleApps } = await import("@/shell/visibleApps");
const { appsOfFolder } = await import("@/shell/appFolders");
const { appVisibleInHotel } = await import("@/shell/windowStore");
const { kpiCellVisible, viewableScreens } = await import("@/shell/kpiAccess");

registerCoreApps();
registerMenuApps();
registerOrderApps();
registerMinibarApps();
registerMybarApps();

beforeAll(resetReferenceData);
let ossRows: Awaited<ReturnType<typeof testDb.roleScreenPermission.findMany>> = [];
beforeEach(async () => {
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  ossRows = await testDb.roleScreenPermission.findMany({ where: { roleId: (await roleByCode("R-OSS")).id } });
});
afterEach(async () => {
  // Tests below remove permission rows of R-OSS: put the seeded matrix back.
  const roleId = (await roleByCode("R-OSS")).id;
  await testDb.roleScreenPermission.deleteMany({ where: { roleId } });
  await testDb.roleScreenPermission.createMany({ data: ossRows.map(({ id: _id, ...row }) => row) });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

type Ctx = Awaited<ReturnType<typeof ctxFor>>;

/** What /admin hands the shell (visibleScreens per hotel in scope) run through the shell's own filter. */
async function desktop(ctx: Ctx) {
  const screensByHotel: Record<string, string[]> = {};
  for (const id of ctx.hotelIds) screensByHotel[id] = await visibleScreens(ctx, id);
  const apps = visibleApps(getApps(), screensByHotel, ctx.user.roleCode);
  const ids = apps.map((a) => a.id);
  const folders = ids.filter((id) => id.startsWith("folder."));
  return { screensByHotel, apps, ids, folders, programsOf: (folder: string) => appsOfFolder(folder, apps).map((a) => a.id) };
}

async function oss(extraHotelCodes: string[] = []) {
  const user = await makeUser({ username: "oss", roleCode: "R-OSS", hotelCode: "ROYAL", extraHotelCodes });
  return { user, ctx: await ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes }) };
}

async function dropRolePermission(roleCode: string, screenCodes: string[]) {
  const role = await roleByCode(roleCode);
  const screens = await testDb.appScreen.findMany({ where: { code: { in: screenCodes } }, select: { id: true } });
  await testDb.roleScreenPermission.deleteMany({ where: { roleId: role.id, screenId: { in: screens.map((s) => s.id) } } });
}

async function userException(userId: string, screenCode: string, canView: boolean) {
  const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: screenCode } });
  await testDb.userScreenPermission.create({ data: { userId, screenId: screen.id, canView } });
}

describe("masaüstü: sistem yöneticisi her şeyi görür", () => {
  it("tüm operasyon klasörleri ve rol kodu sınırı olmayan her uygulama açıktır", async () => {
    const user = await makeUser({ username: "sys", roleCode: "R-SYS", hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND", "PREMIUM"] });
    const ctx = await ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND", "PREMIUM"] });
    const d = await desktop(ctx);
    expect([...d.folders].sort()).toEqual(
      ["folder.kullanici", "folder.minibar", "folder.outlet", "folder.radar", "folder.room-service", "folder.sistem"].sort(),
    );
    const expected = getApps().filter((a) => !a.roleCodes || a.roleCodes.includes("R-SYS")).map((a) => a.id);
    expect([...d.ids].sort()).toEqual([...expected].sort());
  });
});

describe("masaüstü: Oda Servisi Sorumlusu (R-OSS)", () => {
  it("verilen yetkiler kadar: Komuta Merkezi, oda servisi, minibar, kullanıcı yönetimi, raporlar, radar", async () => {
    const { ctx } = await oss();
    const d = await desktop(ctx);
    expect(d.ids).toContain("core.komuta");
    expect(d.ids).toContain("core.rapor");
    expect([...d.folders].sort()).toEqual(["folder.kullanici", "folder.minibar", "folder.radar", "folder.room-service"]);
    expect(d.programsOf("folder.room-service")).toEqual(expect.arrayContaining(["rs.kayitlar", "rs.rapor"]));
    expect(d.programsOf("folder.minibar")).toEqual(expect.arrayContaining(["minibar.kat", "minibar.rapor", "minibar.mybar"]));
    expect(d.programsOf("folder.kullanici")).toEqual(["core.ekipler", "core.kullanici"]);
    // Nothing from the areas the role was not given.
    for (const id of ["core.ayarlar", "core.denetim", "core.online", "core.tanimlar", "menu.yonetim", "order.yazicilar"]) {
      expect(d.ids).not.toContain(id);
    }
  });

  it("her uygulamanın ekranı gerçekten görüntülenebilir; boş klasör yok", async () => {
    const { ctx } = await oss();
    const d = await desktop(ctx);
    const visible = new Set(await visibleScreens(ctx));
    for (const app of d.apps.filter((a) => !a.id.startsWith("folder."))) expect(visible.has(app.screenCode)).toBe(true);
    for (const folder of d.folders) expect(d.programsOf(folder).length).toBeGreaterThan(0);
  });

  it("klasörün eski anahtar ekranı verilmemiş olsa da içindeki bir ekran açıksa klasör görünür", async () => {
    // RO-TAL and MB-KAT used to be the keys of the two folders.
    await dropRolePermission("R-OSS", ["RO-TAL", "MB-KAT"]);
    const { ctx } = await oss();
    const d = await desktop(ctx);
    expect(d.folders).toContain("folder.room-service");
    // RO-SLA keeps the SLA window, RO-OTA (its own screen since 14 Nov 2026) the cross-hotel coverage window.
    expect(d.programsOf("folder.room-service")).toEqual(["rs.rapor", "rs.oteller-arasi"]);
    expect(d.folders).toContain("folder.minibar");
    expect(d.programsOf("folder.minibar")).not.toContain("minibar.kat");
    expect(d.programsOf("folder.minibar")).toContain("minibar.stok");
  });

  it("bir operasyondaki tüm ekranlar kapanınca klasör de kaybolur", async () => {
    await dropRolePermission("R-OSS", ["RO-TAL", "RO-TEL", "RO-TES", "RO-SLA", "RO-OTA"]);
    const { ctx } = await oss();
    const d = await desktop(ctx);
    expect(d.folders).not.toContain("folder.room-service");
    expect(d.ids.filter((id) => id.startsWith("rs."))).toEqual([]);
  });

  it("kişiye özel ek yetki: verilen ekranın uygulaması ve klasörü açılır", async () => {
    const { user, ctx } = await oss();
    expect((await desktop(ctx)).folders).not.toContain("folder.outlet");
    await userException(user.id, "QM-MEN", true);
    const d = await desktop(ctx);
    expect(d.folders).toContain("folder.outlet");
    expect(d.programsOf("folder.outlet")).toEqual(expect.arrayContaining(["menu.yonetim", "menu.masaqr"]));
    expect(await can(ctx, "QM-MEN", "V")).toBe(true);
  });

  it("kişiye özel kısıtlama: ekranın uygulaması ve boşalan klasör düşer", async () => {
    const { user, ctx } = await oss();
    await userException(user.id, "CR-KUL", false);
    const d = await desktop(ctx);
    expect(d.ids).not.toContain("core.kullanici");
    expect(d.ids).not.toContain("core.ekipler");
    expect(d.folders).not.toContain("folder.kullanici");
    // Other people on the same role keep it.
    const peer = await makeUser({ username: "oss2", roleCode: "R-OSS", hotelCode: "ROYAL" });
    expect((await desktop(await ctxFor(peer, { hotelCode: "ROYAL" }))).folders).toContain("folder.kullanici");
  });

  it("otelin modülü kapalıysa o operasyon masaüstünde yoktur", async () => {
    await testDb.hotelModule.updateMany({ where: { hotelId: await hotelId("ROYAL"), moduleKey: "ROOM_SERVICE" }, data: { enabled: false } });
    const { ctx } = await oss();
    const d = await desktop(ctx);
    expect(d.folders).not.toContain("folder.room-service");
    expect(d.folders).toContain("folder.minibar");
  });

  it("üç otelli kullanıcıda klasör bir otelde bile açıksa listelenir; pencere oteline göre daralır", async () => {
    const { ctx } = await oss(["DIAMOND", "PREMIUM"]);
    const premium = await hotelId("PREMIUM");
    await testDb.hotelModule.updateMany({ where: { hotelId: premium, moduleKey: "MINIBAR" }, data: { enabled: false } });
    const d = await desktop(ctx);
    expect(d.folders).toContain("folder.minibar");
    const store = { hotels: ctx.hotelIds.map((id) => ({ id, name: id })), screensByHotel: d.screensByHotel };
    const minibarFolder = getApps().find((a) => a.id === "folder.minibar")!;
    expect(appVisibleInHotel(store, minibarFolder, ctx.hotelIds[0])).toBe(true);
    expect(appVisibleInHotel(store, minibarFolder, premium)).toBe(false);
  });

  it("R-OSS'nin yönetebileceği roller (kademe) ekran yetkisinden bağımsız kalır", async () => {
    const { mayManageRole } = await import("@/modules/core/roleRanks");
    const { ctx } = await oss();
    const actor = { roleCode: ctx.user.roleCode, roleKind: ctx.user.roleKind };
    expect(mayManageRole(actor, { code: "R-KAT", kind: "MINIBAR" })).toBe(true);
    expect(mayManageRole(actor, { code: "R-FBY", kind: "YONETIM" })).toBe(false);
  });
});

describe("Komuta Merkezi sayaçları", () => {
  it("başka alanın verisini özetleyen hücre, o alanın ekranı görülmüyorsa gizlenir", () => {
    const by = { h1: ["CR-KOM", "RO-TAL"], h2: ["CR-KOM", "MB-PERS"] };
    const all = viewableScreens(by);
    expect(kpiCellVisible("geciken", all)).toBe(true);
    expect(kpiCellVisible("mybar", all)).toBe(true);
    expect(kpiCellVisible("kasa", all)).toBe(false);
    expect(kpiCellVisible("doluluk", all)).toBe(false);
    const h1 = viewableScreens(by, "h1");
    expect(kpiCellVisible("mybar", h1)).toBe(false);
    expect(kpiCellVisible("geciken", h1)).toBe(true);
  });

  it("sınır bilinmiyorsa (null) hepsi görünür", () => {
    const none = viewableScreens(null);
    for (const cell of ["doluluk", "mybar", "geciken", "kasa"] as const) expect(kpiCellVisible(cell, none)).toBe(true);
  });

  it("sistem yöneticisi her hücreyi görür; Oda Servisi Sorumlusu kasa hücresini görmez", async () => {
    const sysUser = await makeUser({ username: "sys", roleCode: "R-SYS", hotelCode: "ROYAL" });
    const sys = await ctxFor(sysUser, { hotelCode: "ROYAL" });
    const sysScreens = viewableScreens((await desktop(sys)).screensByHotel);
    for (const cell of ["doluluk", "mybar", "geciken", "kasa"] as const) expect(kpiCellVisible(cell, sysScreens)).toBe(true);

    const { ctx } = await oss();
    const screens = viewableScreens((await desktop(ctx)).screensByHotel);
    expect(kpiCellVisible("mybar", screens)).toBe(true);
    expect(kpiCellVisible("geciken", screens)).toBe(true);
    expect(kpiCellVisible("kasa", screens)).toBe(false);
  });
});

describe("tek kaynak: her rol için aynı kural", () => {
  /** Independent oracle: a program is offered when its screen is viewable somewhere and its (legacy) role-code limits pass. */
  function expectedPrograms(ctx: Ctx, screens: Set<string>) {
    return getApps()
      .filter((a) => !a.id.startsWith("folder."))
      .filter((a) => (screens.has(a.screenCode) || a.alwaysForRoleCodes?.includes(ctx.user.roleCode) === true))
      .filter((a) => (!a.roleCodes || a.roleCodes.includes(ctx.user.roleCode)) && !a.hiddenForRoleCodes?.includes(ctx.user.roleCode))
      .map((a) => a.id);
  }

  for (const roleCode of ["R-SYS", "R-OSS", "R-FBY", "R-GAR"]) {
    it(`${roleCode}: programlar yetkiden çıkar, klasör yalnız içinde program varsa görünür`, async () => {
      const user = await makeUser({ username: `u-${roleCode}`, roleCode, hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND"] });
      const ctx = await ctxFor(user, { hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND"] });
      const d = await desktop(ctx);
      const screens = new Set(Object.values(d.screensByHotel).flat());
      const programs = d.ids.filter((id) => !id.startsWith("folder."));
      expect([...programs].sort()).toEqual([...expectedPrograms(ctx, screens)].sort());
      for (const folder of d.folders) {
        expect(d.programsOf(folder).filter((id) => getApps().find((a) => a.id === id)!.category !== "GENEL").length, folder).toBeGreaterThan(0);
      }
      // Every operation with an open program has its folder.
      for (const app of getApps().filter((a) => a.id.startsWith("folder."))) {
        const hasProgram = appsOfFolder(app.id, getApps()).some((p) => p.category !== "GENEL" && programs.includes(p.id));
        expect(d.folders.includes(app.id), app.id).toBe(hasProgram);
      }
    });

    it(`${roleCode}: kullanıcıya özel istisna ve kapalı otel modülü aynı yoldan işler`, async () => {
      const user = await makeUser({ username: `x-${roleCode}`, roleCode, hotelCode: "ROYAL" });
      const ctx = await ctxFor(user, { hotelCode: "ROYAL" });
      const before = await desktop(ctx);
      // Withhold every screen the user has in the minibar operation, give one outlet screen, close room service.
      for (const code of before.screensByHotel[ctx.hotelIds[0]].filter((c) => c.startsWith("MB-"))) await userException(user.id, code, false);
      if (!before.screensByHotel[ctx.hotelIds[0]].includes("QM-MEN")) await userException(user.id, "QM-MEN", true);
      await testDb.hotelModule.updateMany({ where: { hotelId: ctx.hotelIds[0], moduleKey: "ROOM_SERVICE" }, data: { enabled: false } });
      const after = await desktop(ctx);
      expect(after.folders).not.toContain("folder.minibar");
      expect(after.folders).not.toContain("folder.room-service");
      expect(after.ids.some((id) => id.startsWith("rs.") || id.startsWith("minibar."))).toBe(false);
      expect(after.folders).toContain("folder.outlet");
    });
  }

  it("açılış ekranı rol ne olursa olsun aynı kuralla seçilir", async () => {
    const { pickLanding } = await import("@/modules/core/server/landing");
    const visible = ["CR-KOM", "MB-KAT", "RO-TAL"];
    expect(pickLanding(visible, "CR-KOM").path).toBe("/admin");
    expect(pickLanding(visible, "MB-KAT").path).toBe("/kat");
    // A default the role cannot view falls back to the first visible screen, never to a dead end.
    expect(pickLanding(["MB-KAT"], "CR-KOM")).toMatchObject({ path: "/kat", fallback: true });
  });

  it("mobil ve tablet kabuk görünürlüğü ortak fonksiyondan alır, kendi izin filtresi yoktur", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (p: string) => readFileSync(p, "utf8");
    const client = read("src/app/(admin)/admin/ShellClient.tsx");
    expect(client).toContain("visibleApps(getApps(), screensByHotel, user.roleCode)");
    expect(client).toContain("<Desktop apps={apps}");
    expect(client).toContain("<MobileShell user={user} mobileDefinitions={mobileDefinitions} apps={apps}");
    expect(client).toContain("apps={apps}");
    expect((client.match(/apps=[{]apps[}]/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // The shells receive the list; they cannot read the registry themselves.
    for (const file of ["src/shell/components/MobileShell.tsx", "src/shell/components/Desktop.tsx", "src/shell/components/StartMenu.tsx"]) {
      expect(read(file), file).not.toMatch(/getApps\s*\(/);
    }
    // Tablet (staff) shell: link visibility comes from the same rbac screen set.
    expect(read("src/components/staff/loadShellProps.ts")).toContain("buildNav(new Set(visible)");
  });
});

describe("tablet menüsü: gerçek rbac ile", () => {
  it("kullanıcı istisnası ve kapalı otel modülü bağlantıyı kaldırır", async () => {
    const { buildNav } = await import("@/components/staff/navModel");
    const user = await makeUser({ username: "kat-nav", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const ctx = await ctxFor(user, { hotelCode: "ROYAL" });
    const hrefs = async () => {
      const nav = buildNav(new Set(await visibleScreens(ctx)));
      return [...nav.primary, ...nav.more].map((i) => i.href);
    };
    expect(await hrefs()).toContain("/kat/stok");
    await userException(user.id, "MB-ZIM", false);
    expect(await hrefs()).not.toContain("/kat/stok");
    expect(await hrefs()).toContain("/kat");
    await testDb.hotelModule.updateMany({ where: { hotelId: ctx.hotelIds[0], moduleKey: "MINIBAR" }, data: { enabled: false } });
    expect(await hrefs()).toEqual([]);
  });
});
