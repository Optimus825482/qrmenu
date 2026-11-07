import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runSeed } from "../../prisma/seed";
import { MENU_THEMES } from "../../prisma/seed/menuThemes";
import { PROFILE_ACTIONS, ROLES } from "../../prisma/seed/roles";
import { testDb, truncate } from "../helpers/db";

const db = testDb;

async function permission(roleCode: string, screenCode: string) {
  return db.roleScreenPermission.findFirst({
    where: { hotelId: null, role: { code: roleCode }, screen: { code: screenCode } },
  });
}

describe("P5 yetki matrisi, tema seed'i ve migration 0005 (gerçek test DB)", () => {
  beforeEach(async () => {
    await truncate("hotels", "roles", "app_screens", "settings", "users");
    await db.menuTheme.deleteMany();
  });

  afterAll(async () => {
    await truncate("hotels", "roles", "app_screens", "settings", "users");
    await db.menuTheme.deleteMany();
    await db.$disconnect();
  });

  it("R-GAR: QM-MEN yalnız V; QS-FIS/QS-KAS/QS-IPT/QS-RAP/QM-RAP satırı yok; QS-KUY D=true A=false", async () => {
    await runSeed(db, { legacyDefinitions: false });
    expect(await permission("R-GAR", "QM-MEN")).toMatchObject({
      canView: true, canCreate: false, canEdit: false, canApprove: false, canReport: false,
    });
    for (const screen of ["QS-FIS", "QS-KAS", "QS-IPT", "QS-RAP", "QM-RAP"]) {
      expect(await permission("R-GAR", screen)).toBeNull();
    }
    expect(await permission("R-GAR", "QM-TEM")).toMatchObject({ canView: true, canEdit: false });
    expect(await permission("R-GAR", "QS-KDS")).toMatchObject({ canView: true, canEdit: false });
    expect(await permission("R-GAR", "QS-KUY")).toMatchObject({ canView: true, canEdit: true, canApprove: false });
  });

  it("mutfak rolleri kasa/fiş/menü ekranlarını görmez; QS-KUY yalnız V; R-KDS QS-KDS D=true", async () => {
    await runSeed(db, { legacyDefinitions: false });
    for (const role of ["R-MUS", "R-MUP", "R-KDS"]) {
      for (const screen of ["QS-KAS", "QS-FIS", "QS-IPT", "QM-MEN", "QM-TEM", "QM-RAP"]) {
        expect(await permission(role, screen)).toBeNull();
      }
    }
    expect(await permission("R-MUS", "QS-KUY")).toMatchObject({
      canView: true, canCreate: false, canEdit: false, canApprove: false,
    });
    expect(await permission("R-KDS", "QS-KDS")).toMatchObject({ canEdit: true });
  });

  it("onay (A) QS-KUY ve QS-IPT'de yalnız R-SYS, R-OTM, R-FBM, R-SGF, R-KAS'ta kalır", async () => {
    await runSeed(db, { legacyDefinitions: false });
    expect(await permission("R-SGF", "QS-KUY")).toMatchObject({ canApprove: true });
    expect(await permission("R-SGF", "QM-MEN")).toMatchObject({ canEdit: true });
    expect(await permission("R-KAS", "QS-IPT")).toMatchObject({ canApprove: true });
    const allowed = new Set(["R-SYS", "R-OTM", "R-FBM", "R-SGF", "R-KAS"]);
    const rows = await db.roleScreenPermission.findMany({
      where: { hotelId: null, canApprove: true, screen: { code: { in: ["QS-KUY", "QS-IPT"] } } },
      include: { role: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(allowed.has(row.role.code)).toBe(true);
  });

  it("menü temaları adına göre oluşturulur; tekrar seed çoğaltmaz ve düzenlenmiş temayı ezmez", async () => {
    await runSeed(db, { legacyDefinitions: false });
    const themes = await db.menuTheme.findMany();
    expect(themes.map((t) => t.name).sort()).toEqual(MENU_THEMES.map((t) => t.name).sort());
    expect(themes.filter((t) => t.isDefault).map((t) => t.name)).toEqual(["Royal Gold"]);
    await db.menuTheme.update({ where: { name: "Deniz" }, data: { accent: "#000000" } });
    await runSeed(db, { legacyDefinitions: false });
    expect(await db.menuTheme.count()).toBe(MENU_THEMES.length);
    expect((await db.menuTheme.findUniqueOrThrow({ where: { name: "Deniz" } })).accent).toBe("#000000");
  });

  it("migration 0005 matris SQL'i eski (profil tabanlı) matrisi yeni seed matrisine çevirir", async () => {
    await runSeed(db, { legacyDefinitions: false });
    type Row = { role: { code: string }; screen: { code: string }; canView: boolean; canCreate: boolean; canEdit: boolean; canApprove: boolean; canReport: boolean };
    const where = { hotelId: null, screen: { code: { startsWith: "Q" } } };
    const toMap = (rows: Row[]) =>
      new Map(
        rows.map((r) => [
          `${r.role.code}|${r.screen.code}`,
          [r.canView, r.canCreate, r.canEdit, r.canApprove, r.canReport].join(),
        ]),
      );
    const expected = toMap(await db.roleScreenPermission.findMany({ where, include: { role: true, screen: true } }));

    // Rebuild the old matrix: every role holding a QR module gets its full profile on every screen of it.
    const screens = await db.appScreen.findMany({ where: { code: { startsWith: "Q" } } });
    const roles = await db.role.findMany();
    await db.roleScreenPermission.deleteMany({ where });
    for (const def of ROLES) {
      if (def.modules === "ALL") {
        // R-SYS keeps TAM on every screen.
      }
      for (const screen of screens) {
        const granted = def.modules === "ALL" ? PROFILE_ACTIONS.TAM : def.modules.includes(screen.moduleKey) ? PROFILE_ACTIONS[def.profile] : [];
        if (granted.length === 0) continue;
        await db.roleScreenPermission.create({
          data: {
            roleId: roles.find((r) => r.code === def.code)!.id,
            screenId: screen.id,
            hotelId: null,
            canView: granted.includes("V"),
            canCreate: granted.includes("O"),
            canEdit: granted.includes("D"),
            canApprove: granted.includes("A"),
            canReport: granted.includes("R"),
          },
        });
      }
    }
    expect((await permission("R-GAR", "QS-FIS"))?.canEdit).toBe(true); // the old matrix really differs

    const sql = readFileSync(
      path.resolve(__dirname, "../../prisma/migrations/0005_p5_qr_order/migration.sql"),
      "utf8",
    );
    const matrixSql = sql.slice(sql.indexOf("-- P5 permission matrix"));
    for (const statement of matrixSql.split(/;\s*\n/).map((x) => x.trim()).filter((x) => x.length > 0)) {
      await db.$executeRawUnsafe(statement);
    }
    // P7 later adds R grants on some of these screens (its own @limits block, applied after 0005).
    const p7 = readFileSync(path.resolve(__dirname, "../../prisma/migrations/20261107090000_p7_rapor/migration.sql"), "utf8");
    const p7Block = p7.slice(p7.indexOf("-- @limits:begin"), p7.indexOf("-- @limits:end"));
    for (const statement of p7Block.split(/;\s*\n/).map((x) => x.replace(/^\s*--.*$/gm, "").trim()).filter((x) => x.length > 0)) {
      await db.$executeRawUnsafe(statement);
    }

    const actual = toMap(await db.roleScreenPermission.findMany({ where, include: { role: true, screen: true } }));
    expect(actual).toEqual(expected);
  });
});
