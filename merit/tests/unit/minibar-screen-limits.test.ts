import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { runSeed } from "../../prisma/seed";
import { type Action, PROFILE_ACTIONS, ROLES, SCREEN_LIMITS, actionsFor } from "../../prisma/seed/roles";
import { SCREENS } from "@/modules/core/screens";
import { testDb, truncate } from "../helpers/db";

const role = (code: string) => ROLES.find((r) => r.code === code)!;
const screen = (code: string) => SCREENS.find((s) => s.code === code)!;
const acts = (r: string, s: string) => [...actionsFor(role(r), screen(s))].sort().join("");
const set = (...a: Action[]) => [...a].sort().join("");

describe("SCREEN_LIMITS tek liste", () => {
  it("her girdi plan etiketi taşır ve P5/P2/P3 girdileri vardır", () => {
    expect(SCREEN_LIMITS.every((l) => ["P5", "P2", "P3", "P7", "YR"].includes(l.plan))).toBe(true);
    for (const plan of ["P5", "P2", "P3"]) expect(SCREEN_LIMITS.some((l) => l.plan === plan)).toBe(true);
  });

  it("R-DEP", () => {
    expect(acts("R-DEP", "MB-TAN")).toBe(set("V"));
    expect(acts("R-DEP", "MB-ZIM")).toBe(set("V", "O", "D", "A")); // D2: sayım düzeltmesi
    expect(acts("R-DEP", "MB-TAL")).toBe(set("V", "D", "A"));
    expect(acts("R-DEP", "MB-DOL")).toBe(set("V", "O", "D"));
    expect(acts("R-DEP", "MB-TUK")).toBe(set("V"));
    expect(acts("R-DEP", "MB-DND")).toBe(set("V"));
    expect(acts("R-DEP", "MB-KF")).toBe("");
    expect(acts("R-DEP", "MB-KAT")).toBe(set("V"));
  });

  it("R-KAT", () => {
    expect(acts("R-KAT", "MB-TAN")).toBe("");
    expect(acts("R-KAT", "MB-DOL")).toBe("");
    expect(acts("R-KAT", "MB-ZIM")).toBe(set("V", "D"));
    expect(acts("R-KAT", "MB-TAL")).toBe(set("V", "O", "D")); // D2: düzeltme talebi (KAT-6)
    expect(acts("R-KAT", "MB-TUK")).toBe(set("V", "O", "D"));
    expect(acts("R-KAT", "MB-DND")).toBe(set("V"));
    expect(acts("R-KAT", "MB-KF")).toBe(set("V"));
    expect(acts("R-KAT", "MB-KAT")).toBe(set("V"));
  });

  it("R-OTM", () => {
    expect(acts("R-OTM", "MB-TAN")).toBe(set("V", "O", "D"));
    expect(acts("R-OTM", "MB-ZIM")).toBe(set("V"));
    expect(acts("R-OTM", "MB-KF")).toBe("");
    expect(acts("R-OTM", "MB-TUK")).toBe(set("V"));
  });

  it("R-HKS", () => {
    expect(acts("R-HKS", "MB-TAN")).toBe(set("V"));
    expect(acts("R-HKS", "MB-ZIM")).toBe(set("V", "R"));
  });

  it("R-SYS tam yetkili kalır; MB-PERS ve MB-RAP değişmez", () => {
    expect(acts("R-SYS", "MB-ZIM")).toContain("A");
    expect(acts("R-SYS", "MB-TAN")).toBe(set(...PROFILE_ACTIONS.TAM));
    expect(acts("R-DEP", "MB-PERS")).toBe(set(...PROFILE_ACTIONS.ISLET));
    expect(acts("R-KAT", "MB-PERS")).toBe(set(...PROFILE_ACTIONS.SAHA));
    expect(acts("R-OTM", "MB-RAP")).toBe(set(...PROFILE_ACTIONS.ISLET, "R")); // P7 grant
    expect(acts("R-HKS", "MB-RAP")).toBe(set("V", "R"));
  });

  it("P5 davranışı değişmedi (örnekler)", () => {
    expect(acts("R-GAR", "QM-MEN")).toBe(set("V"));
    expect(acts("R-GAR", "QS-FIS")).toBe("");
    expect(acts("R-GAR", "QS-KUY")).toBe(set("V", "O", "D"));
    expect(acts("R-MUS", "QS-KUY")).toBe(set("V"));
    expect(acts("R-SGF", "QS-KUY")).toBe(set("V", "O", "D", "A"));
    expect(acts("R-BAR", "QS-KUY")).toBe(set("V", "O", "D"));
    expect(acts("R-FBM", "QS-IPT")).toBe(set("V", "O", "D", "A"));
  });
});

describe("migration SQL'i seed çıktısıyla aynı sonucu verir (gerçek test DB)", () => {
  beforeEach(async () => {
    await truncate("hotels", "roles", "app_screens", "settings", "users");
  });
  afterAll(async () => {
    await truncate("hotels", "roles", "app_screens", "settings", "users");
    await testDb.$disconnect();
  });

  it("gevşek (profil) matris + limit SQL'i = seed matrisi", async () => {
    await runSeed(testDb, { legacyDefinitions: false });
    const where = { hotelId: null, screen: { code: { startsWith: "MB-" } } };
    type Row = { role: { code: string }; screen: { code: string }; canView: boolean; canCreate: boolean; canEdit: boolean; canApprove: boolean; canReport: boolean };
    const key = (r: Row) =>
      [`${r.role.code}|${r.screen.code}`, [r.canView, r.canCreate, r.canEdit, r.canApprove, r.canReport].join()] as const;
    const read = async () =>
      [...(await testDb.roleScreenPermission.findMany({ where, include: { role: true, screen: true } })).map(key)].sort(
        (a, b) => a[0].localeCompare(b[0]),
      );
    const expected = await read();

    const screens = await testDb.appScreen.findMany({ where: { code: { startsWith: "MB-" } } });
    const roles = await testDb.role.findMany();
    await testDb.roleScreenPermission.deleteMany({ where });
    for (const def of ROLES) {
      for (const s of screens) {
        const granted =
          def.modules === "ALL"
            ? PROFILE_ACTIONS.TAM
            : def.modules.includes(s.moduleKey)
              ? PROFILE_ACTIONS[def.profile]
              : [];
        if (granted.length === 0) continue;
        await testDb.roleScreenPermission.create({
          data: {
            roleId: roles.find((r) => r.code === def.code)!.id,
            screenId: s.id,
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
    expect(await read()).not.toEqual(expected);

    // The @limits blocks of the migrations in order: P2/P3, the P7 report grants, D2 (R-DEP MB-ZIM A, R-KAT MB-TAL D),
    // then YR (the four delegate roles' whole global matrix).
    for (const migration of [
      "20261103093000_minibar_tamamlama_temel",
      "20261107090000_p7_rapor",
      "20261110140100_minibar_depo_rol_yetkileri",
      "20261110160000_yonetici_rolleri",
      "20261110161000_mty_doluluk_silme",
      "20261112030000_otel_deposu_stok_takibi",
      "20261112120000_mty_tanim_ve_onaysiz_duzeltme",
    ]) {
      const file = readFileSync(path.resolve(__dirname, `../../prisma/migrations/${migration}/migration.sql`), "utf8");
      const block = file.slice(file.indexOf("-- @limits:begin"), file.indexOf("-- @limits:end"));
      expect(block.length).toBeGreaterThan(0);
      const statements = block
        .split(/;\s*\n/)
        .map((x) => x.replace(/^\s*--.*$/gm, "").trim())
        .filter((x) => x.length > 0);
      for (const statement of statements) await testDb.$executeRawUnsafe(statement);
    }
    expect(await read()).toEqual(expected);
  });
});
