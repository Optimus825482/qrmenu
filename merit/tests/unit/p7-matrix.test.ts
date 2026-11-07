import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runSeed } from "../../prisma/seed";
import { ROLES, SCREEN_LIMITS, actionsFor } from "../../prisma/seed/roles";
import { SCREENS } from "@/modules/core/screens";
import { testDb, truncate } from "../helpers/db";

const role = (code: string) => ROLES.find((r) => r.code === code)!;
const screen = (code: string) => SCREENS.find((s) => s.code === code)!;
const acts = (r: string, s: string) => [...actionsFor(role(r), screen(s))].join("");

describe("P7 rapor yetki matrisi (saf)", () => {
  it("SCREEN_LIMITS sonunda P7 grant girdileri, P5 → P2 → P3 → P7 sırası", () => {
    const plans = SCREEN_LIMITS.map((l) => l.plan);
    expect(plans.lastIndexOf("P5")).toBeLessThan(plans.indexOf("P2"));
    expect(plans.lastIndexOf("P2")).toBeLessThan(plans.indexOf("P3"));
    expect(plans.lastIndexOf("P3")).toBeLessThan(plans.indexOf("P7"));
    expect(SCREEN_LIMITS.filter((l) => l.plan === "P7").every((l) => l.grant && !l.keep)).toBe(true);
  });

  it("grant edilenler R alır, öncekiler korunur", () => {
    for (const s of ["MB-RAP", "QM-RAP", "QS-RAP"]) expect(acts("R-OTM", s)).toBe("VODAR");
    expect(acts("R-FBM", "RO-SLA")).toBe("VODAR");
    expect(acts("R-FBM", "QM-RAP")).toBe("VODAR");
    expect(acts("R-FBM", "QS-RAP")).toBe("VODAR");
    expect(acts("R-FBM", "MB-RAP")).toBe("VODA");
    expect(acts("R-DEP", "MB-RAP")).toBe("VODAR");
    expect(acts("R-SGF", "QS-RAP")).toBe("VODAR");
    expect(acts("R-SGF", "QM-RAP")).toBe("VODAR");
  });

  it("grant edilmeyenler: P5 sınırları ve KAT/HKS aynı", () => {
    for (const code of ["R-GAR", "R-BAR", "R-BUT", "R-OUT", "R-ODS"]) expect(acts(code, "QS-RAP")).toBe("");
    for (const code of ["R-MUS", "R-MUP", "R-KDS"]) expect(acts(code, "QM-RAP")).toBe("");
    expect(acts("R-KAT", "MB-RAP")).toBe("VOD");
    expect(acts("R-HKS", "MB-RAP")).toBe("VR");
    expect(acts("R-OTM", "RO-SLA")).toBe("");
    expect(acts("R-SYS", "MB-RAP")).toBe("VODAR");
  });
});

describe("tohumlu eski veritabanına P7 migration'ı", () => {
  beforeEach(async () => {
    await truncate("hotels", "roles", "app_screens", "settings", "users");
  });
  afterAll(async () => {
    await truncate("hotels", "roles", "app_screens", "settings", "users");
    await testDb.$disconnect();
  });

  const dump = async () =>
    (await testDb.roleScreenPermission.findMany({ where: { hotelId: null }, include: { role: true, screen: true } }))
      .map((r) => `${r.role.code}|${r.screen.code}|${r.canView}|${r.canReport}`)
      .sort();

  it("R-grant'ı olmayan matris + @limits UPDATE'i = yeni seed; ikinci uygulama değişiklik yapmaz", async () => {
    await runSeed(testDb, { legacyDefinitions: false });
    const expected = await dump();

    const grants: [string, string[]][] = [
      ["R-OTM", ["MB-RAP", "QM-RAP", "QS-RAP"]],
      ["R-FBM", ["QM-RAP", "QS-RAP", "RO-SLA"]],
      ["R-DEP", ["MB-RAP"]],
      ["R-SGF", ["QM-RAP", "QS-RAP"]],
    ];
    for (const [code, screens] of grants) {
      await testDb.$executeRawUnsafe(
        `UPDATE "role_screen_permissions" p SET "can_report" = false FROM "roles" r, "app_screens" s
         WHERE p."role_id"=r."id" AND p."screen_id"=s."id" AND p."hotel_id" IS NULL AND r."code"='${code}' AND s."code" IN (${screens.map((s) => `'${s}'`).join(",")})`,
      );
    }
    expect(await dump()).not.toEqual(expected);

    const file = readFileSync(
      path.resolve(__dirname, "../../prisma/migrations/20261107090000_p7_rapor/migration.sql"),
      "utf8",
    );
    const block = file.slice(file.indexOf("-- @limits:begin"), file.indexOf("-- @limits:end"));
    expect(block.length).toBeGreaterThan(0);
    const statements = block
      .split(/;\s*\n/)
      .map((x) => x.replace(/^\s*--.*$/gm, "").trim())
      .filter((x) => x.length > 0);
    expect(statements).toHaveLength(4);
    for (const statement of statements) await testDb.$executeRawUnsafe(statement);
    expect(await dump()).toEqual(expected);

    // idempotent: the second run touches no row
    for (const statement of statements) expect(await testDb.$executeRawUnsafe(statement)).toBe(0);
    expect(await dump()).toEqual(expected);
  });

  it("seed canReport değerleri (veritabanında)", async () => {
    await runSeed(testDb, { legacyDefinitions: false });
    const r = (roleCode: string, screenCode: string) =>
      testDb.roleScreenPermission.findFirst({
        where: { hotelId: null, role: { code: roleCode }, screen: { code: screenCode } },
      });
    expect((await r("R-OTM", "MB-RAP"))?.canReport).toBe(true);
    expect((await r("R-FBM", "RO-SLA"))?.canReport).toBe(true);
    expect((await r("R-FBM", "MB-RAP"))?.canReport).toBe(false);
    expect(await r("R-GAR", "QS-RAP")).toBeNull();
    expect(await r("R-KAT", "MB-RAP")).toMatchObject({ canView: true, canReport: false });
  });
});
