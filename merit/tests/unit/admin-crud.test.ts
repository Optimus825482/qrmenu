import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { testDb, truncate } from "../helpers/db";
import {
  ctxFor,
  dropReferenceData,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { conflictFromPrisma, listQuerySchema, pageArgs, publishDefinition, withAdminTx } =
  await import("@/modules/core/server/admin/crud");
const { DomainError } = await import("@/lib/result");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("audit_logs");
  publishMock.mockReset();
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function ctxOf(roleCode: string, hotelCode = "MR") {
  const user = await makeUser({ username: `u-${roleCode}-${hotelCode}`, roleCode, hotelCode });
  return ctxFor(user, { hotelCode });
}

describe("listQuerySchema", () => {
  it("varsayılanlar: page 1, pageSize 20, q ve sort yok", () => {
    expect(listQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("boş veya boşluk arama metni q'yu kaldırır; dolu olan kırpılır", () => {
    expect(listQuerySchema.parse({ q: "   " }).q).toBeUndefined();
    expect(listQuerySchema.parse({ q: "  oda 1 " }).q).toBe("oda 1");
  });

  it("pageSize 20/50/100 kabul edilir, 30 VALIDATION hatasıdır", () => {
    for (const pageSize of [20, 50, 100]) {
      expect(listQuerySchema.parse({ pageSize }).pageSize).toBe(pageSize);
    }
    expect(listQuerySchema.safeParse({ pageSize: 30 }).success).toBe(false);
  });

  it("safeAction ile sarılınca pageSize 30 VALIDATION Result'ı verir", async () => {
    const { safeAction } = await import("@/lib/result");
    const action = safeAction(listQuerySchema, async (q) => q);
    const result = await action({ pageSize: 30 });
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    if (!result.ok) expect(result.error.fieldErrors).toHaveProperty("pageSize");
  });

  it("page 0, geçersiz sort.dir ve güvenli olmayan sort.field reddedilir", () => {
    expect(listQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listQuerySchema.safeParse({ sort: { field: "name", dir: "up" } }).success).toBe(false);
    expect(listQuerySchema.safeParse({ sort: { field: "name; drop", dir: "asc" } }).success).toBe(
      false,
    );
    expect(listQuerySchema.parse({ sort: { field: "name", dir: "desc" } }).sort).toEqual({
      field: "name",
      dir: "desc",
    });
  });

  it("pageArgs skip/take hesaplar", () => {
    expect(pageArgs({ page: 3, pageSize: 50 })).toEqual({ skip: 100, take: 50 });
  });
});

describe("withAdminTx (gerçek test DB)", () => {
  it("yetkisiz R-GAR: FORBIDDEN, fn çalışmaz, YETKISIZ_DENEME denetim kaydı yazılır", async () => {
    const ctx = await ctxOf("R-GAR");
    const fn = vi.fn(async () => "x");
    await expect(withAdminTx(ctx, { screen: "CR-TAN", action: "O" }, fn)).rejects.toMatchObject({
      name: "DomainError",
      code: "FORBIDDEN",
    });
    expect(fn).not.toHaveBeenCalled();
    const rows = await testDb.auditLog.findMany({ where: { action: "YETKISIZ_DENEME" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "AppScreen", entityId: "CR-TAN", userId: ctx.user.id });
  });

  it("yetkili R-SYS: fn bir transaction istemcisi alır ve değerini döndürür", async () => {
    const ctx = await ctxOf("R-SYS");
    const value = await withAdminTx(ctx, { screen: "CR-TAN", action: "O" }, async (tx) => {
      await tx.auditLog.create({ data: { action: "DENEME", entity: "X" } });
      return 42;
    });
    expect(value).toBe(42);
    expect(await testDb.auditLog.count({ where: { action: "DENEME" } })).toBe(1);
  });

  it("fn hata atarsa transaction geri alınır", async () => {
    const ctx = await ctxOf("R-SYS");
    await expect(
      withAdminTx(ctx, { screen: "CR-TAN", action: "O" }, async (tx) => {
        await tx.auditLog.create({ data: { action: "GERI_ALINMALI", entity: "X" } });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await testDb.auditLog.count({ where: { action: "GERI_ALINMALI" } })).toBe(0);
  });

  it("yönetim rolü R-OTM CR-TAN için V/O/D yapabilir, onaylayamaz", async () => {
    const ctx = await ctxOf("R-OTM");
    for (const action of ["V", "O", "D"] as const) {
      await expect(
        withAdminTx(ctx, { screen: "CR-TAN", action }, async () => action),
      ).resolves.toBe(action);
    }
    await expect(
      withAdminTx(ctx, { screen: "CR-TAN", action: "A" }, async () => "x"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("conflictFromPrisma", () => {
  const known = (code: string) =>
    new Prisma.PrismaClientKnownRequestError("ham prisma mesajı", { code, clientVersion: "7" });

  it.each(["P2002", "P2003", "P2014"])("%s → CONFLICT, mesaj korunur", (code) => {
    let thrown: unknown;
    try {
      conflictFromPrisma(known(code), "Önce bağlı kayıtları kaldırın");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(DomainError);
    expect(thrown).toMatchObject({ code: "CONFLICT", message: "Önce bağlı kayıtları kaldırın" });
  });

  it("başka Prisma kodu ve genel hata olduğu gibi yeniden atılır", () => {
    const other = known("P2025");
    expect(() => conflictFromPrisma(other, "x")).toThrow(other);
    const plain = new Error("başka");
    expect(() => conflictFromPrisma(plain, "x")).toThrow(plain);
  });

  it("gerçek unique ihlali (otel kodu) CONFLICT olur", async () => {
    const existing = await testDb.hotel.findFirstOrThrow();
    const err = await testDb.hotel
      .create({ data: { code: existing.code, name: "Kopya" } })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(err).toBeDefined();
    expect(() => conflictFromPrisma(err, "Bu kod kullanımda")).toThrow("Bu kod kullanımda");
  });
});

describe("publishDefinition", () => {
  it("definition.changed olayını SISTEM/YONETIM rollerine, aynı tx ile yayınlar", async () => {
    await testDb.$transaction(async (tx) => {
      await publishDefinition(tx, { hotelId: "h1", entity: "Room", id: "r1", op: "create" });
      expect(publishMock).toHaveBeenCalledWith(
        {
          type: "definition.changed",
          hotelId: "h1",
          roleKinds: ["SISTEM", "YONETIM"],
          payload: { entity: "Room", id: "r1", op: "create" },
        },
        tx,
      );
    });
  });

  it("otel yoksa (sistem geneli) hotelId undefined kalır", async () => {
    await testDb.$transaction(async (tx) => {
      await publishDefinition(tx, { entity: "Role", id: "x", op: "delete" });
    });
    expect(publishMock.mock.calls[0][0]).toMatchObject({
      hotelId: undefined,
      payload: { op: "delete" },
    });
  });
});
