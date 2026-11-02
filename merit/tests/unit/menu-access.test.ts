import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import type { Ctx } from "@/lib/auth";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const tree = await import("@/modules/menu/server/menuTree");
const switches = await import("@/modules/menu/server/outletSwitches");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function getOrCreateRsOutlet(hid: string, name = "Oda Servisi") {
  const existing = await testDb.outlet.findFirst({
    where: { hotelId: hid, type: "ODA_SERVISI" },
  });
  if (existing) {
    return testDb.outlet.update({
      where: { id: existing.id },
      data: { name, hasMenu: true, hasOrdering: true, orderingEnabled: true, isActive: true },
    });
  }
  return testDb.outlet.create({
    data: { hotelId: hid, name, type: "ODA_SERVISI", hasMenu: true, hasOrdering: true, orderingEnabled: true },
  });
}

describe("P6 menuAccess - Oda Servisi menü yetkilendirmesi", () => {
  it("R-ODS kendi ODA_SERVISI outletinde menuTree.create ok, BAR outletinde FORBIDDEN, başka otelde FORBIDDEN", async () => {
    const mrId = await hotelId("ROYAL");
    const mrdId = await hotelId("DIAMOND");

    const rsMr = await getOrCreateRsOutlet(mrId, "MR Oda Servisi");
    const barMr = await testDb.outlet.create({
      data: { hotelId: mrId, name: "MR Bar", type: "BAR", hasMenu: true },
    });
    const rsMrd = await getOrCreateRsOutlet(mrdId, "MRD Oda Servisi");

    const userOds = await makeUser({ username: "rods-mr", roleCode: "R-ODS", hotelCode: "ROYAL" });
    const ctxOds: Ctx = await ctxFor(userOds, { hotelCode: "ROYAL" });
    ctxOds.session.outletId = rsMr.id;

    // Kendi outletinde create ok
    const cat = await tree.create(ctxOds, rsMr.id, { kind: "KATEGORI", name: "Atıştırmalıklar" });
    expect(cat.id).toBeDefined();

    // Aynı otelin BAR outletinde FORBIDDEN
    await expect(tree.create(ctxOds, barMr.id, { kind: "KATEGORI", name: "İçecekler" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // Başka otelin ODA_SERVISI outletinde FORBIDDEN
    await expect(tree.create(ctxOds, rsMrd.id, { kind: "KATEGORI", name: "Kahvaltı" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("R-FBM (QM-MEN D) hem ODA_SERVISI hem BAR outletinde create ok", async () => {
    const mrId = await hotelId("ROYAL");
    const rsMr = await getOrCreateRsOutlet(mrId, "MR Oda Servisi 2");
    const barMr = await testDb.outlet.create({
      data: { hotelId: mrId, name: "MR Bar 2", type: "BAR", hasMenu: true },
    });

    const userFbm = await makeUser({ username: "rfbm-mr", roleCode: "R-FBM", hotelCode: "ROYAL" });
    const ctxFbm = await ctxFor(userFbm, { hotelCode: "ROYAL" });

    await expect(tree.create(ctxFbm, rsMr.id, { kind: "KATEGORI", name: "RS Kategori" })).resolves.toBeTruthy();
    await expect(tree.create(ctxFbm, barMr.id, { kind: "KATEGORI", name: "Bar Kategori" })).resolves.toBeTruthy();
  });

  it("R-ODS setAvailable(false) kendi outletinde ok", async () => {
    const mrId = await hotelId("ROYAL");
    const rsMr = await getOrCreateRsOutlet(mrId, "MR Oda Servisi 3");
    const userFbm = await makeUser({ username: "rfbm-setup", roleCode: "R-FBM", hotelCode: "ROYAL" });
    const ctxFbm = await ctxFor(userFbm, { hotelCode: "ROYAL" });

    const cat = await tree.create(ctxFbm, rsMr.id, { kind: "KATEGORI", name: "Yemekler" });
    const sub = await tree.create(ctxFbm, rsMr.id, { kind: "ALT_KATEGORI", name: "Sıcaklar", parentId: cat.id });
    const group = await tree.create(ctxFbm, rsMr.id, { kind: "GRUP", name: "Ana Yemekler", parentId: sub.id });
    const item = await tree.create(ctxFbm, rsMr.id, { kind: "OGE", name: "Burger", parentId: group.id, price: 15 });

    const userOds = await makeUser({ username: "rods-mr-3", roleCode: "R-ODS", hotelCode: "ROYAL" });
    const ctxOds = await ctxFor(userOds, { hotelCode: "ROYAL" });
    ctxOds.session.outletId = rsMr.id;

    await expect(tree.setAvailable(ctxOds, item.id, false)).resolves.toBeUndefined();
    const updated = await testDb.menuNode.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.isAvailable).toBe(false);
  });

  it("R-ODS setOrderingEnabled(false) FORBIDDEN + YETKISIZ_DENEME, R-MUS (RO-TAL A) ok ve audit OUTLET_ORDERING_OFF", async () => {
    const mrId = await hotelId("ROYAL");
    const rsMr = await getOrCreateRsOutlet(mrId, "MR Oda Servisi 4");

    const userOds = await makeUser({ username: "rods-mr-4", roleCode: "R-ODS", hotelCode: "ROYAL" });
    const ctxOds = await ctxFor(userOds, { hotelCode: "ROYAL" });
    ctxOds.session.outletId = rsMr.id;

    // R-ODS has RO-TAL (V,O,D) but not A -> FORBIDDEN
    await expect(switches.setOrderingEnabled(ctxOds, rsMr.id, false)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const denialAudit = await testDb.auditLog.findFirst({
      where: { userId: userOds.id, action: "YETKISIZ_DENEME" },
    });
    expect(denialAudit).toBeTruthy();

    // R-MUS has RO-TAL (V,O,D,A) -> ok
    const userMus = await makeUser({ username: "rmus-mr-4", roleCode: "R-MUS", hotelCode: "ROYAL" });
    const ctxMus = await ctxFor(userMus, { hotelCode: "ROYAL" });
    ctxMus.session.outletId = rsMr.id;

    const res = await switches.setOrderingEnabled(ctxMus, rsMr.id, false);
    expect(res.orderingEnabled).toBe(false);

    const auditRow = await testDb.auditLog.findFirst({
      where: { userId: userMus.id, action: "OUTLET_ORDERING_OFF" },
    });
    expect(auditRow).toBeTruthy();
  });

  it("R-GAR ODA_SERVISI menüsünü list edemez", async () => {
    const mrId = await hotelId("ROYAL");
    const rsMr = await getOrCreateRsOutlet(mrId, "MR Oda Servisi 5");

    const userGar = await makeUser({ username: "rgar-mr", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const ctxGar = await ctxFor(userGar, { hotelCode: "ROYAL" });

    await expect(tree.list(ctxGar, rsMr.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
