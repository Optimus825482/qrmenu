import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const auditLog = await import("@/modules/core/server/admin/auditLog");
const { audit } = await import("@/modules/core/server/audit");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  publishMock.mockReset();
  publishMock.mockResolvedValue(undefined);
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("denetim günlüğü", () => {
  it("R-OTM yalnız kendi otelinin satırlarını ve kendi kullanıcılarının otelsiz satırlarını görür", async () => {
    const otm = await makeUser({ username: "mudur", roleCode: "R-OTM", hotelCode: "ROYAL" });
    const ctx = await ctxFor(otm, { hotelCode: "ROYAL" });
    const mr = await hotelId("ROYAL");
    const mrp = await hotelId("PREMIUM");
    const staff = await makeUser({ username: "gar-mr", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const other = await makeUser({ username: "gar-mrp", roleCode: "R-GAR", hotelCode: "PREMIUM" });
    const sys = await makeUser({ username: "sys-root", roleCode: "R-SYS" });
    const sysOnMr = await makeUser({ username: "sys-mr", roleCode: "R-SYS", hotelCode: "ROYAL" });
    const outsider = await makeUser({ username: "gar-dis", roleCode: "R-GAR", hotelCode: "ROYAL" });

    await testDb.auditLog.createMany({
      data: [
        { action: "MR_ROW", entity: "Hotel", hotelId: mr, userId: sysOnMr.id },
        { action: "PREMIUM_ROW", entity: "Hotel", hotelId: mrp, userId: other.id },
        { action: "OWN_NULL", entity: "X", hotelId: null, userId: staff.id },
        { action: "OTHER_NULL", entity: "X", hotelId: null, userId: other.id },
        { action: "SYS_NULL", entity: "X", hotelId: null, userId: sys.id },
        { action: "SYS_MR_NULL", entity: "X", hotelId: null, userId: sysOnMr.id },
        { action: "ORPHAN", entity: "X", hotelId: null, userId: null },
        { action: "SYS_ON_MR", entity: "Hotel", hotelId: mr, userId: sys.id },
      ],
    });

    const page = await auditLog.list(ctx, {});
    const actions = page.items.map((row) => row.action).sort();
    expect(actions).toEqual(["MR_ROW", "OWN_NULL", "SYS_ON_MR"]);

    const sysCtx = await ctxFor(sys, { hotelCode: "ROYAL" });
    const all = await auditLog.list(sysCtx, {});
    expect(all.total).toBe(8);
    expect(all.items.map((row) => row.action)).toContain("PREMIUM_ROW");

    await expect(auditLog.list(await ctxFor(outsider, { hotelCode: "ROYAL" }), {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("sistem kapsamlı yazımların hotelId'siz satırları YONETIM listesinde görünmez", async () => {
    const otm = await makeUser({ username: "mudur2", roleCode: "R-OTM", hotelCode: "ROYAL" });
    const sysUser = await makeUser({ username: "sys-ayar", roleCode: "R-SYS", hotelCode: "ROYAL" });
    const sysCtx = await ctxFor(sysUser, { hotelCode: "ROYAL" });
    const { set } = await import("@/modules/core/server/admin/settingsAdmin");
    await set(sysCtx, null, "dnd.minChecks", 3);
    expect(await testDb.auditLog.count({ where: { action: "SETTING_SET", hotelId: null } })).toBe(1);

    const page = await auditLog.list(await ctxFor(otm, { hotelCode: "ROYAL" }), {});
    expect(page.items.map((r) => r.action)).not.toContain("SETTING_SET");
    const all = await auditLog.list(sysCtx, {});
    expect(all.items.map((r) => r.action)).toContain("SETTING_SET");
  });

  it("işlem, varlık, kullanıcı ve tarih aralığı birlikte süzer", async () => {
    const sys = await makeUser({ username: "admin1", roleCode: "R-SYS", hotelCode: "ROYAL" });
    const ctx = await ctxFor(sys, { hotelCode: "ROYAL" });
    const mr = await hotelId("ROYAL");
    const someone = await makeUser({ username: "ayse", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const other = await makeUser({ username: "ali", roleCode: "R-GAR", hotelCode: "ROYAL" });
    await testDb.auditLog.create({
      data: {
        action: "SETTING_UPDATE",
        entity: "Setting",
        entityId: "dnd.minChecks",
        hotelId: mr,
        userId: someone.id,
        createdAt: new Date("2024-06-01T12:00:00.000Z"),
        before: { n: 2 },
        after: { n: 3 },
      },
    });
    await testDb.auditLog.create({
      data: {
        action: "SETTING_UPDATE",
        entity: "Setting",
        hotelId: mr,
        userId: someone.id,
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    await testDb.auditLog.create({
      data: {
        action: "HOTEL_UPDATE",
        entity: "Hotel",
        hotelId: mr,
        userId: other.id,
        createdAt: new Date("2024-06-01T12:00:00.000Z"),
      },
    });

    const page = await auditLog.list(ctx, {
      action: "SETTING_UPDATE",
      entity: "Setting",
      userId: someone.id,
      from: "2024-01-01T00:00:00.000Z",
      to: "2024-12-31T23:59:59.000Z",
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ action: "SETTING_UPDATE", entityId: "dnd.minChecks", username: "ayse" });

    const byName = await auditLog.list(ctx, { user: "AYSE" });
    expect(byName.items.map((row) => row.username)).toEqual(["ayse", "ayse"]);
  });

  it("CSV başlık ve satır üretir; virgüllü alanı tırnaklar", async () => {
    const sys = await makeUser({ username: "admin1", roleCode: "R-SYS", hotelCode: "ROYAL" });
    const ctx = await ctxFor(sys, { hotelCode: "ROYAL" });
    const mr = await hotelId("ROYAL");
    await testDb.auditLog.create({
      data: {
        action: "CSV_ROW",
        entity: "Thing",
        entityId: "a,b",
        hotelId: mr,
        userId: sys.id,
        ip: "10.0.0.9",
      },
    });
    await testDb.auditLog.create({
      data: { action: "DIGER", entity: "Thing", hotelId: mr, userId: sys.id },
    });

    const csv = await auditLog.exportCsv(ctx, { action: "CSV_ROW" });
    const lines = csv.replace(/^\uFEFF/, "").trim().split("\n");
    expect(lines[0]).toBe("tarih,kullanici,islem,varlik,varlikId,otel,ip");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("CSV_ROW");
    expect(lines[1]).toContain("admin1");
    expect(lines[1]).toContain('"a,b"');
    expect(lines[1]).toContain("ROYAL");
    expect(lines[1]).not.toContain("DIGER");
  });

  it("capabilities: CSV yetkisi (R) yoksa canExport false; yetki varken true", async () => {
    const sys = await makeUser({ username: "cap-sys", roleCode: "R-SYS", hotelCode: "ROYAL" });
    expect(await auditLog.capabilities(await ctxFor(sys, { hotelCode: "ROYAL" }))).toEqual({ canExport: true });

    const otm = await makeUser({ username: "cap-otm", roleCode: "R-OTM", hotelCode: "ROYAL" });
    const ctx = await ctxFor(otm, { hotelCode: "ROYAL" });
    expect(await auditLog.capabilities(ctx)).toEqual({ canExport: true });
    const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "CR-DEN" } });
    await testDb.roleScreenPermission.updateMany({
      where: { roleId: otm.roleId, screenId: screen.id },
      data: { canReport: false },
    });
    expect(await auditLog.capabilities(await ctxFor(otm, { hotelCode: "ROYAL" }))).toEqual({ canExport: false });
    await expect(auditLog.exportCsv(await ctxFor(otm, { hotelCode: "ROYAL" }))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("get başka otelin satırını NOT_FOUND döner, kendi satırında before/after durur", async () => {
    const otm = await makeUser({ username: "mudur", roleCode: "R-OTM", hotelCode: "ROYAL" });
    const ctx = await ctxFor(otm, { hotelCode: "ROYAL" });
    const mr = await hotelId("ROYAL");
    const mrp = await hotelId("PREMIUM");
    const own = await testDb.auditLog.create({
      data: { action: "SETTING_UPDATE", entity: "Setting", hotelId: mr, before: { n: "eski" }, after: { n: "yeni" } },
    });
    const foreign = await testDb.auditLog.create({
      data: { action: "SETTING_UPDATE", entity: "Setting", hotelId: mrp, before: { n: "gizli" }, after: { n: "gizli" } },
    });

    await expect(auditLog.get(ctx, foreign.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(auditLog.get(ctx, "yok")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const detail = await auditLog.get(ctx, own.id);
    expect(detail.before).toEqual({ n: "eski" });
    expect(detail.after).toEqual({ n: "yeni" });
  });

  it("audit() audit.created yayınlar, alıcı yalnız SISTEM, gövde before/after taşımaz", async () => {
    const mr = await hotelId("ROYAL");
    publishMock.mockClear();
    await audit(testDb, { action: "PING", entity: "Thing", hotelId: mr, entityId: "e1", before: { secret: true } });
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "audit.created",
        roleKinds: ["SISTEM"],
        hotelId: mr,
        payload: expect.objectContaining({ action: "PING", entity: "Thing", entityId: "e1" }),
      }),
      testDb,
    );
    expect(publishMock.mock.calls[0][0].payload.before).toBeUndefined();

    publishMock.mockClear();
    await audit(testDb, { action: "SYS", entity: "Thing" });
    expect(publishMock.mock.calls[0][0]).toMatchObject({ type: "audit.created", roleKinds: ["SISTEM"] });
    expect(publishMock.mock.calls[0][0].hotelId).toBeUndefined();
  });
});
