import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { reportAccessAction } = await import("@/modules/core/server/actions/reportAccess");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("audit_logs");
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  await testDb.roleScreenPermission.deleteMany({ where: { hotelId: { not: null } } });
  requireUser.mockReset();
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function asKat(): Promise<Ctx> {
  const user = await makeUser({ username: "ra-kat", roleCode: "R-KAT", hotelCode: "ROYAL" });
  const ctx = await ctxFor(user, { hotelCode: "ROYAL" });
  requireUser.mockResolvedValue(ctx);
  return ctx;
}

describe("reportAccessAction", () => {
  it("görebildiği ekran için VALIDATION döner, denetim kaydı yazılmaz", async () => {
    await asKat();
    const res = await reportAccessAction("MB-KAT");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.message).toBe("Bu ekranı zaten görüntüleyebilirsiniz");
    expect(await testDb.auditLog.count({ where: { action: "YETKI_TALEP" } })).toBe(0);
  });

  it("görmediği ekran: bildirim + aynı işlemde YETKI_TALEP denetim kaydı; günde bir kez", async () => {
    const ctx = await asKat();
    await makeUser({ username: "ra-otm", roleCode: "R-OTM", hotelCode: "ROYAL" });
    const first = await reportAccessAction("MB-DOL");
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.data.already).toBe(false);
    const rows = await testDb.auditLog.findMany({ where: { action: "YETKI_TALEP" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: ctx.user.id, hotelId: ctx.session.hotelId, entityId: "MB-DOL" });
    expect(rows[0].after).toEqual({ screen: "MB-DOL" });

    const again = await reportAccessAction("MB-DOL");
    expect(again.ok && again.data.already).toBe(true);
    expect(await testDb.auditLog.count({ where: { action: "YETKI_TALEP" } })).toBe(1);
  });
});
