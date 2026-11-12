import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES, actionsFor } from "../../prisma/seed/roles";
import { runSeed } from "../../prisma/seed";
import { SCREENS } from "@/modules/core/screens";
import { MANAGED_MANAGERS, TEAM_ROLES, mayManageRole } from "@/modules/core/roleRanks";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData, roleByCode } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData } from "../helpers/minibarFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const users = await import("@/modules/core/server/admin/users");
const dnd = await import("@/modules/minibar/server/dnd");
const mmd = await import("@/modules/minibar/server/mmd");
const { can } = await import("@/lib/rbac");

const GOOD = "Parola12345";
const role = (code: string) => ROLES.find((r) => r.code === code)!;
const screen = (code: string) => SCREENS.find((s) => s.code === code)!;
const acts = (r: string, s: string) => [...actionsFor(role(r), screen(s))].join("");
const kindOf = (code: string) => ({ code, kind: role(code).kind });
const actor = (code: string) => ({ roleCode: code, roleKind: role(code).kind });

async function ctxOf(roleCode: string, username = `k-${roleCode}`) {
  const user = await makeUser({ username, roleCode, hotelCode: "ROYAL" });
  return { user, ctx: await ctxFor(user, { hotelCode: "ROYAL" }) };
}
const codeOf = (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string }) => e.code ?? "ERR");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await truncate("audit_logs");
  await resetMinibarData();
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("kademe kuralı (saf)", () => {
  it("kimse kendi kademesini ya da üstünü yönetmez; SISTEM rolüne SISTEM dışında kimse ulaşamaz", () => {
    for (const [manager, managed] of Object.entries(MANAGED_MANAGERS)) {
      expect(managed).not.toContain(manager);
      expect(managed).not.toContain("R-SYS");
    }
    expect(MANAGED_MANAGERS["R-FBY"]).not.toContain("R-FBM");
    for (const a of ["R-FBM", "R-FBY", "R-OSS", "R-OTM", "R-MTY"]) {
      expect(mayManageRole(actor(a), kindOf("R-SYS"))).toBe(false);
      expect(mayManageRole(actor(a), kindOf("R-ITT"))).toBe(false);
      expect(mayManageRole(actor(a), kindOf(a))).toBe(false);
    }
    expect(mayManageRole(actor("R-SYS"), kindOf("R-FBM"))).toBe(true);
  });

  it("F&B Müdürü > Yardımcısı > Oda Servisi Sorumlusu > ekip", () => {
    expect(mayManageRole(actor("R-FBM"), kindOf("R-FBY"))).toBe(true);
    expect(mayManageRole(actor("R-FBM"), kindOf("R-OSS"))).toBe(true);
    expect(mayManageRole(actor("R-FBY"), kindOf("R-OSS"))).toBe(true);
    expect(mayManageRole(actor("R-FBY"), kindOf("R-FBM"))).toBe(false);
    expect(mayManageRole(actor("R-OSS"), kindOf("R-FBY"))).toBe(false);
    expect(mayManageRole(actor("R-OSS"), kindOf("R-MTY"))).toBe(false);
    // The department head: its own team only, not every field role.
    for (const code of TEAM_ROLES["R-OSS"]!) expect(mayManageRole(actor("R-OSS"), kindOf(code))).toBe(true);
    for (const code of ["R-GAR", "R-KAS", "R-MUS", "R-BAR"]) expect(mayManageRole(actor("R-OSS"), kindOf(code))).toBe(false);
    // Unchanged: another hotel manager still reaches field roles and no management role.
    expect(mayManageRole(actor("R-OTM"), kindOf("R-GAR"))).toBe(true);
    expect(mayManageRole(actor("R-OTM"), kindOf("R-OSS"))).toBe(false);
  });
});

describe("seed matrisi (saf)", () => {
  it("Oda Servisi Sorumlusu astlarının yapabildiği her şeyi yapar", () => {
    for (const sub of ["R-KAT", "R-ODS"]) {
      for (const s of SCREENS) {
        const own = acts("R-OSS", s.code);
        for (const letter of acts(sub, s.code)) {
          // CR-RAP is a shared report screen; everything else the subordinate has, the head has too.
          expect(own, `${sub} ${s.code} ${letter}`).toContain(letter);
        }
      }
    }
    expect(acts("R-OSS", "MB-TUK")).toBe("VODA");
    expect(acts("R-OSS", "MB-RAP")).toBe("VODAR");
    expect(acts("R-OSS", "RO-TES")).toBe("VODA");
    expect(acts("R-OSS", "RO-SLA")).toBe("VODAR");
    expect(acts("R-OSS", "CR-KUL")).toBe("VOD");
    expect(acts("R-OSS", "CR-RAD")).toBe("VR");
    for (const code of ["CR-SYS", "CR-DEN", "CR-ONL", "CR-TAN", "QS-KUY", "QM-MEN"]) expect(acts("R-OSS", code)).toBe("");
  });

  it("F&B Müdür Yardımcısı müdürle aynı ekran haklarını taşır; ikisi de minibar raporlarını tam alır", () => {
    for (const s of SCREENS) expect(acts("R-FBY", s.code), s.code).toBe(acts("R-FBM", s.code));
    expect(acts("R-FBM", "MB-RAP")).toBe("VODAR");
  });
});

describe("Oda Servisi Sorumlusu (gerçek test DB)", () => {
  it("QR okutmadan DND ve MMD girer", async () => {
    const w = await minibarWorld();
    const { ctx } = await ctxOf("R-OSS");
    expect(await can(ctx, "MB-TUK", "O")).toBe(true);
    expect(await codeOf(dnd.markDnd(ctx, { roomId: w.room.id }))).toBe("OK");
    expect(await codeOf(mmd.recordMmd(ctx, { roomId: w.room.id, reason: "Misafir uyuyor" }))).toBe("OK");
  });

  it("kendi ekibinin kullanıcısını tanımlar, günceller, şifresini sıfırlar; başka rol ve üst kademe FORBIDDEN", async () => {
    const { ctx } = await ctxOf("R-OSS");
    const mr = await hotelId("ROYAL");
    const make = (code: string, roleId: string) =>
      users.create(ctx, { username: `yeni-${code.toLowerCase()}`, fullName: "Yeni Kişi", roleId, hotelId: mr, hotelIds: [], password: GOOD });

    const kat = await make("R-KAT", (await roleByCode("R-KAT")).id);
    const ods = await make("R-ODS", (await roleByCode("R-ODS")).id);
    expect(kat.roleCode).toBe("R-KAT");
    expect(ods.roleCode).toBe("R-ODS");
    expect(await codeOf(users.setPassword(ctx, kat.id, "Parola67890"))).toBe("OK");
    expect(await codeOf(users.setActive(ctx, ods.id, false))).toBe("OK");

    for (const code of ["R-GAR", "R-KAS", "R-OSS", "R-MTY", "R-FBY", "R-FBM", "R-SYS"]) {
      expect(await codeOf(make(code, (await roleByCode(code)).id)), code).toBe("FORBIDDEN");
    }
    // A waiter of another department and a manager above: neither is reachable.
    const garson = await makeUser({ username: "baska-garson", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const mudur = await makeUser({ username: "fb-mudur", roleCode: "R-FBM", hotelCode: "ROYAL" });
    expect(await codeOf(users.setPassword(ctx, garson.id, "Parola67890"))).toBe("FORBIDDEN");
    expect(await codeOf(users.setActive(ctx, garson.id, false))).toBe("FORBIDDEN");
    expect(await codeOf(users.setPassword(ctx, mudur.id, "Parola67890"))).toBe("FORBIDDEN");
    // Promoting a team member to one's own rank is an assignment like any other.
    expect(
      await codeOf(
        users.update(ctx, kat.id, {
          username: kat.username,
          fullName: kat.fullName,
          roleId: (await roleByCode("R-OSS")).id,
          hotelId: mr,
          hotelIds: [],
          emailOptIn: false,
        } as never),
      ),
    ).toBe("FORBIDDEN");
    const offered = (await users.options(ctx)).roles.map((r) => r.code).sort();
    expect(offered).toEqual([...TEAM_ROLES["R-OSS"]!].sort());
  });
});

describe("yönetim kademesi (gerçek test DB)", () => {
  it("F&B Müdürü yardımcısını ve sorumluyu yönetir; yardımcı müdürü yönetemez; kimse kendi kademesini atayamaz", async () => {
    const mr = await hotelId("ROYAL");
    const fbm = (await ctxOf("R-FBM")).ctx;
    const fby = await ctxOf("R-FBY");
    const create = (ctx: typeof fbm, username: string, code: string) =>
      roleByCode(code).then((r) =>
        users.create(ctx, { username, fullName: "Yeni Kişi", roleId: r.id, hotelId: mr, hotelIds: [], password: GOOD }),
      );

    const oss = await create(fbm, "yeni-sorumlu", "R-OSS");
    expect(oss.roleCode).toBe("R-OSS");
    expect(await codeOf(users.setPassword(fbm, fby.user.id, "Parola67890"))).toBe("OK");
    expect(await codeOf(create(fbm, "ikinci-mudur", "R-FBM"))).toBe("FORBIDDEN");
    expect(await codeOf(create(fbm, "otel-mudur", "R-OTM"))).toBe("FORBIDDEN");
    expect(await codeOf(create(fbm, "sistemci", "R-SYS"))).toBe("FORBIDDEN");

    expect(await codeOf(users.setPassword(fby.ctx, oss.id, "Parola67890"))).toBe("OK");
    expect(await codeOf(create(fby.ctx, "ikinci-yardimci", "R-FBY"))).toBe("FORBIDDEN");
    const mudur = await makeUser({ username: "asil-mudur", roleCode: "R-FBM", hotelCode: "ROYAL" });
    expect(await codeOf(users.setPassword(fby.ctx, mudur.id, "Parola67890"))).toBe("FORBIDDEN");
    expect(await codeOf(users.setActive(fby.ctx, mudur.id, false))).toBe("FORBIDDEN");
  });
});

describe("migration 20261112150000 seed ile aynı matrisi üretir", () => {
  it("yeni rollerin genel satırları silinip dosya uygulanınca seed matrisine döner (iki kez çalışır)", async () => {
    await runSeed(testDb, { legacyDefinitions: false });
    const where = { hotelId: null, role: { code: { in: ["R-FBY", "R-OSS", "R-FBM"] } } };
    const read = async () =>
      (await testDb.roleScreenPermission.findMany({ where, include: { role: true, screen: true } }))
        .map((r) => `${r.role.code}|${r.screen.code}|${[r.canView, r.canCreate, r.canEdit, r.canApprove, r.canReport].join()}`)
        .sort();
    const expected = await read();
    expect(expected.filter((x) => x.startsWith("R-OSS")).length).toBeGreaterThan(10);

    await testDb.roleScreenPermission.deleteMany({ where: { hotelId: null, role: { code: { in: ["R-FBY", "R-OSS"] } } } });
    // The state before this migration: the F&B manager without the full minibar reports, plus a stray row.
    await testDb.roleScreenPermission.updateMany({
      where: { hotelId: null, role: { code: "R-FBM" }, screen: { code: "MB-RAP" } },
      data: { canReport: false },
    });
    const oss = await testDb.role.findUniqueOrThrow({ where: { code: "R-OSS" } });
    const sys = await testDb.appScreen.findUniqueOrThrow({ where: { code: "CR-SYS" } });
    await testDb.roleScreenPermission.create({ data: { roleId: oss.id, screenId: sys.id, hotelId: null, canView: true } });

    const file = readFileSync(path.resolve(__dirname, "../../prisma/migrations/20261112150000_kademe_rolleri/migration.sql"), "utf8");
    const statements = file
      .split(/;\s*\n/)
      .map((x) => x.replace(/^\s*--.*$/gm, "").trim())
      .filter((x) => x.length > 0);
    for (let i = 0; i < 2; i++) {
      for (const statement of statements) await testDb.$executeRawUnsafe(statement);
      expect(await read()).toEqual(expected);
    }
    const access = await testDb.roleModuleAccess.findMany({ where: { hotelId: null, role: { code: { in: ["R-FBY", "R-OSS"] } } }, include: { role: true } });
    expect(access.map((a) => `${a.role.code}|${a.moduleKey}`).sort()).toEqual(
      [
        ...role("R-FBY").modules as string[],
      ].map((m) => `R-FBY|${m}`).concat((role("R-OSS").modules as string[]).map((m) => `R-OSS|${m}`)).sort(),
    );
    const title = await testDb.jobTitle.findUniqueOrThrow({ where: { code: "G-OSS" }, include: { defaultRole: true } });
    expect(title.defaultRole?.code).toBe("R-OSS");
  });
});
