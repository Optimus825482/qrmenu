import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { can, assertCan, visibleScreens } = await import("@/lib/rbac");
const { DomainError } = await import("@/lib/result");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("audit_logs");
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  await testDb.roleScreenPermission.deleteMany({ where: { hotelId: { not: null } } });
  await testDb.roleModuleAccess.deleteMany({ where: { hotelId: { not: null } } });
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function ctxOf(roleCode: string, hotelCode: string, extraHotelCodes: string[] = []) {
  const user = await makeUser({
    username: `u-${roleCode}-${hotelCode}`,
    roleCode,
    hotelCode,
    extraHotelCodes,
  });
  return ctxFor(user, { hotelCode, extraHotelCodes });
}

async function screenId(code: string) {
  return (await testDb.appScreen.findUniqueOrThrow({ where: { code } })).id;
}

describe("can() (gerçek test DB)", () => {
  it("R-SYS her ekranda her işlemde true", async () => {
    const ctx = await ctxOf("R-SYS", "MR", ["MRD", "MRP"]);
    const screens = await testDb.appScreen.findMany();
    expect(screens.length).toBeGreaterThan(0);
    for (const s of screens) {
      for (const action of ["V", "O", "D", "A", "R"] as const) {
        expect(await can(ctx, s.code, action), `${s.code}/${action}`).toBe(true);
      }
    }
  });

  it("R-KAT MB-TUK: V/O/D true, A false; QS-KUY V false", async () => {
    const ctx = await ctxOf("R-KAT", "MR");
    expect(await can(ctx, "MB-TUK", "V")).toBe(true);
    expect(await can(ctx, "MB-TUK", "O")).toBe(true);
    expect(await can(ctx, "MB-TUK", "D")).toBe(true);
    expect(await can(ctx, "MB-TUK", "A")).toBe(false);
    expect(await can(ctx, "QS-KUY", "V")).toBe(false);
  });

  it("CR-TAN: R-OTM V/O/D true, A false; R-ITT yalnız V; R-GAR hiçbiri", async () => {
    const otm = await ctxOf("R-OTM", "MR");
    expect(await can(otm, "CR-TAN", "V")).toBe(true);
    expect(await can(otm, "CR-TAN", "O")).toBe(true);
    expect(await can(otm, "CR-TAN", "D")).toBe(true);
    expect(await can(otm, "CR-TAN", "A")).toBe(false);
    const itt = await ctxOf("R-ITT", "MR");
    expect(await can(itt, "CR-REH", "V")).toBe(true);
    expect(await can(itt, "CR-REH", "O")).toBe(false);
    const gar = await ctxOf("R-GAR", "MR");
    expect(await can(gar, "CR-TAN", "V")).toBe(false);
    expect(await can(gar, "CR-REH", "V")).toBe(false);
  });

  it("bilinmeyen ekran kodu false", async () => {
    const ctx = await ctxOf("R-SYS", "MR");
    expect(await can(ctx, "XX-YOK", "V")).toBe(false);
  });

  it("kapsam dışı otel false; kapsamdaki otel true", async () => {
    const ctx = await ctxOf("R-KAT", "MR");
    expect(await can(ctx, "MB-TUK", "V", await hotelId("MRP"))).toBe(false);
    expect(await can(ctx, "MB-TUK", "V", await hotelId("MR"))).toBe(true);
  });

  it("otel satırı sistem satırını ezer: MR'de D false, MRP'de true", async () => {
    const ctx = await ctxOf("R-KAT", "MR", ["MRP"]);
    const role = await testDb.role.findUniqueOrThrow({ where: { code: "R-KAT" } });
    await testDb.roleScreenPermission.create({
      data: {
        roleId: role.id,
        screenId: await screenId("MB-TUK"),
        hotelId: await hotelId("MR"),
        canView: true,
        canCreate: true,
        canEdit: false,
      },
    });
    expect(await can(ctx, "MB-TUK", "D", await hotelId("MR"))).toBe(false);
    expect(await can(ctx, "MB-TUK", "V", await hotelId("MR"))).toBe(true);
    expect(await can(ctx, "MB-TUK", "D", await hotelId("MRP"))).toBe(true);
  });

  it("otel bazlı RoleModuleAccess kapalıysa modül ekranları false", async () => {
    const ctx = await ctxOf("R-KAT", "MR", ["MRP"]);
    const role = await testDb.role.findUniqueOrThrow({ where: { code: "R-KAT" } });
    await testDb.roleModuleAccess.create({
      data: { roleId: role.id, hotelId: await hotelId("MR"), moduleKey: "MINIBAR", enabled: false },
    });
    expect(await can(ctx, "MB-TUK", "V", await hotelId("MR"))).toBe(false);
    expect(await can(ctx, "MB-TUK", "V", await hotelId("MRP"))).toBe(true);
  });

  it("RoleModuleAccess satırı hiç yoksa modül ekranı false (satır yok = kapalı)", async () => {
    const ctx = await ctxOf("R-KAT", "MR");
    const role = await testDb.role.findUniqueOrThrow({ where: { code: "R-KAT" } });
    const saved = await testDb.roleModuleAccess.findMany({ where: { roleId: role.id } });
    await testDb.roleModuleAccess.deleteMany({ where: { roleId: role.id } });
    try {
      expect(await can(ctx, "MB-TUK", "V")).toBe(false);
      expect(await can(ctx, "MB-TUK", "V", await hotelId("MR"))).toBe(false);
      expect(await visibleScreens(ctx)).not.toContain("MB-TUK");
    } finally {
      await testDb.roleModuleAccess.createMany({ data: saved });
    }
  });

  it("otel RoleModuleAccess true, sistem satırı false'u ezer", async () => {
    const ctx = await ctxOf("R-KAT", "MR", ["MRP"]);
    const role = await testDb.role.findUniqueOrThrow({ where: { code: "R-KAT" } });
    const system = { roleId: role.id, hotelId: null, moduleKey: "MINIBAR" } as const;
    await testDb.roleModuleAccess.updateMany({ where: system, data: { enabled: false } });
    try {
      await testDb.roleModuleAccess.create({
        data: { roleId: role.id, hotelId: await hotelId("MR"), moduleKey: "MINIBAR", enabled: true },
      });
      expect(await can(ctx, "MB-TUK", "V", await hotelId("MR"))).toBe(true);
      expect(await can(ctx, "MB-TUK", "V", await hotelId("MRP"))).toBe(false);
    } finally {
      await testDb.roleModuleAccess.updateMany({ where: system, data: { enabled: true } });
    }
  });

  it("pasif ekran: can false ve visibleScreens dışında", async () => {
    const ctx = await ctxOf("R-KAT", "MR");
    expect(await can(ctx, "MB-TUK", "V")).toBe(true);
    await testDb.appScreen.update({ where: { code: "MB-TUK" }, data: { isActive: false } });
    try {
      expect(await can(ctx, "MB-TUK", "V")).toBe(false);
      expect(await visibleScreens(ctx)).not.toContain("MB-TUK");
    } finally {
      await testDb.appScreen.update({ where: { code: "MB-TUK" }, data: { isActive: true } });
    }
  });

  it("HotelModule(MR, MINIBAR) kapalıyken MB-TUK V false (hotelId verilmese de oturum oteli)", async () => {
    const ctx = await ctxOf("R-KAT", "MR", ["MRP"]);
    await testDb.hotelModule.update({
      where: { hotelId_moduleKey: { hotelId: await hotelId("MR"), moduleKey: "MINIBAR" } },
      data: { enabled: false },
    });
    expect(await can(ctx, "MB-TUK", "V", await hotelId("MR"))).toBe(false);
    expect(await can(ctx, "MB-TUK", "V")).toBe(false);
    expect(await can(ctx, "MB-TUK", "V", await hotelId("MRP"))).toBe(true);
  });

  it("CORE ekranları modül kapısından geçmez", async () => {
    const ctx = await ctxOf("R-GAR", "MR");
    expect(await can(ctx, "CR-RAP", "V")).toBe(true);
    expect(await can(ctx, "CR-RAP", "O")).toBe(false);
  });
});

describe("assertCan()", () => {
  it("izin varsa sessizce döner ve denetim kaydı yazmaz", async () => {
    const ctx = await ctxOf("R-KAT", "MR");
    await expect(assertCan(ctx, "MB-TUK", "V")).resolves.toBeUndefined();
    expect(await testDb.auditLog.count()).toBe(0);
  });

  it("izin yoksa YETKISIZ_DENEME yazar ve FORBIDDEN fırlatır", async () => {
    const ctx = await ctxOf("R-KAT", "MR");
    const err = await assertCan(ctx, "MB-TUK", "A").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect((err as InstanceType<typeof DomainError>).code).toBe("FORBIDDEN");
    const rows = await testDb.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "YETKISIZ_DENEME",
      entity: "AppScreen",
      entityId: "MB-TUK",
      userId: ctx.user.id,
      hotelId: ctx.session.hotelId,
    });
    expect(rows[0].after).toEqual({ action: "A" });
  });

  it("bilinmeyen hotelId: FORBIDDEN, denetim satırı oturum oteliyle, denenen otel after içinde", async () => {
    const ctx = await ctxOf("R-KAT", "MR");
    const err = await assertCan(ctx, "MB-TUK", "V", "yok-boyle-otel").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect((err as InstanceType<typeof DomainError>).code).toBe("FORBIDDEN");
    const rows = await testDb.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].hotelId).toBe(ctx.session.hotelId);
    expect(rows[0].after).toEqual({ action: "V", hotelId: "yok-boyle-otel" });
  });

  it("var olan ama kapsam dışı otel: FORBIDDEN, denetim satırı oturum oteliyle", async () => {
    const ctx = await ctxOf("R-KAT", "MR");
    const other = await hotelId("MRP");
    const err = await assertCan(ctx, "MB-TUK", "V", other).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect((err as InstanceType<typeof DomainError>).code).toBe("FORBIDDEN");
    const rows = await testDb.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].hotelId).toBe(ctx.session.hotelId);
    expect(rows[0].after).toEqual({ action: "V", hotelId: other });
  });
});

describe("visibleScreens()", () => {
  it("R-GAR: sortOrder sırasında 7 kod (P5 sınırı: kasa, fiş, iptal ve raporlar yok)", async () => {
    const ctx = await ctxOf("R-GAR", "MR");
    expect(await visibleScreens(ctx)).toEqual([
      "QM-MIS", "QM-CAG", "QM-MEN", "QM-TEM", "QS-KUY", "QS-KDS", "CR-RAP",
    ]);
  });

  it("modülü kapalı otelde o modülün ekranları listelenmez", async () => {
    const ctx = await ctxOf("R-GAR", "MR");
    await testDb.hotelModule.update({
      where: { hotelId_moduleKey: { hotelId: await hotelId("MR"), moduleKey: "QR_ORDER" } },
      data: { enabled: false },
    });
    const codes = await visibleScreens(ctx);
    expect(codes.some((c) => c.startsWith("QS-"))).toBe(false);
    expect(codes).toContain("QM-MIS");
    expect(codes).toContain("CR-RAP");
  });

  it("kapsam dışı otel için boş liste", async () => {
    const ctx = await ctxOf("R-GAR", "MR");
    expect(await visibleScreens(ctx, await hotelId("MRP"))).toEqual([]);
  });
});
