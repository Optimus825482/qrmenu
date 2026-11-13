import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES, actionsFor } from "../../prisma/seed/roles";
import { runSeed } from "../../prisma/seed";
import { SCREENS } from "@/modules/core/screens";
import { testDb } from "../helpers/db";
import { addMember, ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { minibarWorld, resetMinibarData } from "../helpers/minibarFixtures";
import { orderSetup, seedOrder, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { can } = await import("@/lib/rbac");
const { kds } = await import("@/modules/order/server/kds");
const { orders } = await import("@/modules/order/server/orders");
const { cashier } = await import("@/modules/order/server/cashier");
const { approvals } = await import("@/modules/order/server/approvals");
const { waiterCalls } = await import("@/modules/order/server/waiterCalls");
const tree = await import("@/modules/menu/server/menuTree");
const settingsAdmin = await import("@/modules/core/server/admin/settingsAdmin");
const manual = await import("@/modules/minibar/server/manualRoomEntryAdmin");
const { listTargets } = await import("@/modules/core/server/targets");

const NEW_ROLES = ["R-MTY", "R-QMY", "R-OUY", "R-MUY"] as const;
const role = (code: string) => ROLES.find((r) => r.code === code)!;
const screen = (code: string) => SCREENS.find((s) => s.code === code)!;
const acts = (r: string, s: string) => [...actionsFor(role(r), screen(s))].join("");

async function ctxOf(roleCode: string, username = `y-${roleCode}`) {
  const user = await makeUser({ username, roleCode, hotelCode: "ROYAL" });
  return { user, ctx: await ctxFor(user, { hotelCode: "ROYAL" }) };
}
const letters = async (ctx: Awaited<ReturnType<typeof ctxOf>>["ctx"], code: string) => {
  let out = "";
  for (const a of ["V", "O", "D", "A", "R"] as const) if (await can(ctx, code, a)) out += a;
  return out;
};

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.order.deleteMany({});
  await resetMinibarData();
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("seed matrisi (saf)", () => {
  it("kodlar benzersiz ve yeni roller tanımlı", () => {
    expect(new Set(ROLES.map((r) => r.code)).size).toBe(ROLES.length);
    for (const code of NEW_ROLES) expect(role(code), code).toBeDefined();
  });

  it("Minibar Takip Yöneticisi: R-DEP / R-KAT minibar ekranlarında yalnız V; MB-RAP V,R; MB-DOL, MB-ZIM ve MB-TAN V,O,D; çekirdekte yalnız CR-KOM, CR-RAD, CR-RAP", () => {
    const minibar = SCREENS.filter((s) => s.moduleKey === "MINIBAR").map((s) => s.code);
    const depKat = minibar.filter((s) => acts("R-DEP", s) !== "" || acts("R-KAT", s) !== "");
    for (const s of depKat) expect(acts("R-MTY", s), s).toContain("V");
    for (const s of minibar.filter((x) => !["MB-RAP", "MB-DOL", "MB-ZIM", "MB-TAN"].includes(x))) expect(acts("R-MTY", s), s).toBe("V");
    expect(acts("R-MTY", "MB-ZIM")).toBe("VOD"); // otel deposu: merkez depo tedariki ve başlangıç stoğu (12 Kas 2026)
    // Tanımlar (12 Kas 2026, migration 20261112120000): ürün grubu, ürün, setup ekler ve düzenler; onay ve rapor yok.
    expect(acts("R-MTY", "MB-TAN")).toBe("VOD");
    expect(acts("R-MTY", "MB-RAP")).toBe("VR");
    expect(acts("R-MTY", "MB-DOL")).toBe("VOD"); // yükleme O; silme / geri alma D
    for (const s of SCREENS.filter((x) => x.moduleKey === "CORE")) {
      // CR-RAD: Operasyon Radarı, sunucuda yalnız MINIBAR katmanına indirilir (radar/server/scope.ts).
      expect(acts("R-MTY", s.code), s.code).toBe(["CR-KOM", "CR-RAD", "CR-RAP"].includes(s.code) ? "VR" : "");
    }
  });

  it("QR Menü Yöneticisi: QM-MEN / QM-TEM V,O,D; QM-RAP V,R; QR_ORDER ve QM-CAG yok; CR-KUL yok", () => {
    expect(acts("R-QMY", "QM-MEN")).toBe("VOD");
    expect(acts("R-QMY", "QM-TEM")).toBe("VOD");
    expect(acts("R-QMY", "QM-RAP")).toBe("VR");
    expect(acts("R-QMY", "QM-CAG")).toBe("");
    for (const s of SCREENS.filter((x) => x.moduleKey === "QR_ORDER")) expect(acts("R-QMY", s.code)).toBe("");
    expect(acts("R-QMY", "CR-KUL")).toBe("");
    expect(acts("R-QMY", "CR-TAN")).toBe("");
  });

  it("Outlet Yöneticisi QS-KAS / QS-RAP V,R; Mutfak Yöneticisi yalnız QS-KDS V", () => {
    const order = SCREENS.filter((x) => x.moduleKey === "QR_ORDER").map((s) => s.code);
    for (const s of order) expect(acts("R-OUY", s), s).toBe(["QS-KAS", "QS-RAP"].includes(s) ? "VR" : "");
    for (const s of order) expect(acts("R-MUY", s), s).toBe(s === "QS-KDS" ? "V" : "");
  });
});

describe("rbac (gerçek test DB)", () => {
  it("her rol verilen ekranları görür, yazma eylemleri yok", async () => {
    const mty = (await ctxOf("R-MTY")).ctx;
    expect(await letters(mty, "MB-TUK")).toBe("V");
    expect(await letters(mty, "MB-DOL")).toBe("VOD");
    expect(await letters(mty, "MB-RAP")).toBe("VR");
    expect(await letters(mty, "CR-SYS")).toBe("");
    const qmy = (await ctxOf("R-QMY")).ctx;
    expect(await letters(qmy, "QM-MEN")).toBe("VOD");
    expect(await letters(qmy, "QS-KUY")).toBe("");
    const ouy = (await ctxOf("R-OUY")).ctx;
    expect(await letters(ouy, "QS-KAS")).toBe("VR");
    expect(await letters(ouy, "QS-IPT")).toBe("");
    const muy = (await ctxOf("R-MUY")).ctx;
    expect(await letters(muy, "QS-KDS")).toBe("V");
  });
});

describe("Mutfak Yöneticisi", () => {
  it("KDS panosunu görür; siparişi ilerletemez (FORBIDDEN)", async () => {
    const order = await orderSetup({ outlet: { kdsEnabled: true } });
    const { ctx } = await staffCtx("y-muy-kds", "R-MUY", order.outlet.id);
    const row = await seedOrder(order, { status: "ONAYLANDI", approvedAt: new Date() });
    const board = await kds.board(ctx, order.outlet.id);
    expect(board.columns.NEW.map((o) => o.id)).toEqual([row.id]);
    await expect(orders.startPrep(ctx, row.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const started = await seedOrder(order, { status: "ONAYLANDI", approvedAt: new Date(), prepStartedAt: new Date() });
    await expect(orders.transition(ctx, started.id, "HAZIR")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Outlet Yöneticisi", () => {
  it("kasa panosunu görür; masa boşaltma ve iptal FORBIDDEN", async () => {
    const order = await orderSetup();
    const { ctx } = await staffCtx("y-ouy-kasa", "R-OUY", order.outlet.id);
    const board = await cashier.tableBoard(ctx, order.outlet.id);
    expect(board).toBeDefined();
    await expect(cashier.clearTable(ctx, order.table.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const row = await seedOrder(order, { status: "ONAYLANDI", approvedAt: new Date() });
    await expect(orders.transition(ctx, row.id, "IPTAL", { reason: "deneme iptal" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("atanmadığı outlet'i göremez; iki outlet atanınca ikisi de giriş hedefidir", async () => {
    const a = await orderSetup();
    const b = await testDb.outlet.create({
      data: { hotelId: await hotelId("ROYAL"), name: "Lobi Bar", type: "BAR", hasMenu: true, hasOrdering: true },
    });
    const user = await makeUser({ username: "y-ouy-multi", roleCode: "R-OUY", hotelCode: "ROYAL" });
    await addMember(user.id, a.outlet.id);
    const outletsOf = async () => (await listTargets(user.id)).filter((t) => t.kind === "OUTLET").map((t) => t.outletId);
    expect(await outletsOf()).toEqual([a.outlet.id]);

    const ctx = await ctxFor(user, { hotelCode: "ROYAL" });
    ctx.session.outletId = a.outlet.id;
    await expect(cashier.tableBoard(ctx, b.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await addMember(user.id, b.id);
    expect((await outletsOf()).sort()).toEqual([a.outlet.id, b.id].sort());
    for (const outletId of [a.outlet.id, b.id]) {
      const session = await ctxFor(user, { hotelCode: "ROYAL" });
      session.session.outletId = outletId;
      await expect(cashier.tableBoard(session, outletId)).resolves.toBeDefined();
    }
  });
});

describe("Outlet Yöneticisi: /kasa okuma uçları", () => {
  it("kuyruğu (tümü), masa panosunu ve açık çağrıları okur; onay, ret, çağrı kapatma, masa boşaltma FORBIDDEN", async () => {
    const order = await orderSetup();
    const { ctx } = await staffCtx("y-ouy-read", "R-OUY", order.outlet.id);
    const waiter = await staffCtx("y-ouy-gar", "R-GAR", order.outlet.id);
    const mine = await seedOrder(order, { assignedWaiterId: waiter.user.id });
    const free = await seedOrder(order);
    const call = await testDb.waiterCall.create({ data: { outletId: order.outlet.id, tableId: order.table.id, type: "GARSON" } });

    expect((await approvals.visibleQueue(ctx, order.outlet.id)).map((o) => o.id).sort()).toEqual([mine.id, free.id].sort());
    await expect(cashier.tableBoard(ctx, order.outlet.id)).resolves.toBeDefined();
    expect((await waiterCalls.listOpen(ctx, order.outlet.id)).map((c) => c.id)).toEqual([call.id]);

    await expect(orders.transition(ctx, free.id, "ONAYLANDI")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(orders.transition(ctx, free.id, "REDDEDILDI", { reason: "deneme ret" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(waiterCalls.resolve(ctx, call.id, "YANITLANDI")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cashier.clearTable(ctx, order.table.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await approvals.canApproveOrder(ctx, free)).toBe(false);
  });

  it("başka outlet oturumunda kuyruk ve çağrılar FORBIDDEN", async () => {
    const order = await orderSetup();
    const other = await testDb.outlet.create({
      data: { hotelId: await hotelId("ROYAL"), name: "Lobi Bar", type: "BAR", hasMenu: true, hasOrdering: true },
    });
    const { ctx } = await staffCtx("y-ouy-scope", "R-OUY", other.id);
    await expect(approvals.visibleQueue(ctx, order.outlet.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(waiterCalls.listOpen(ctx, order.outlet.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("R-KAS ve R-GAR davranışı değişmedi", async () => {
    const order = await orderSetup();
    const kas = await staffCtx("y-kas", "R-KAS", order.outlet.id);
    const gar = await staffCtx("y-gar", "R-GAR", order.outlet.id);
    const other = await staffCtx("y-gar2", "R-GAR", order.outlet.id);
    const mine = await seedOrder(order, { assignedWaiterId: gar.user.id });
    const theirs = await seedOrder(order, { assignedWaiterId: other.user.id });
    const free = await seedOrder(order);
    expect((await approvals.visibleQueue(kas.ctx, order.outlet.id)).map((o) => o.id).sort()).toEqual([mine.id, theirs.id, free.id].sort());
    expect((await approvals.visibleQueue(gar.ctx, order.outlet.id)).map((o) => o.id).sort()).toEqual([mine.id, free.id].sort());
    const call = await testDb.waiterCall.create({ data: { outletId: order.outlet.id, tableId: order.table.id, type: "GARSON" } });
    expect((await waiterCalls.listOpen(kas.ctx, order.outlet.id)).map((c) => c.id)).toEqual([call.id]);
    expect((await waiterCalls.listOpen(gar.ctx, order.outlet.id)).map((c) => c.id)).toEqual([call.id]);
    await waiterCalls.resolve(kas.ctx, call.id, "YANITLANDI");
    expect(await approvals.canApproveOrder(kas.ctx, free)).toBe(true);
  });
});

describe("QR Menü Yöneticisi", () => {
  it("menü ağacını görür ve öğe ekler; sipariş durumunu değiştiremez", async () => {
    const order = await orderSetup();
    const { ctx } = await ctxOf("R-QMY");
    expect((await tree.list(ctx, order.outlet.id)).length).toBeGreaterThan(0);
    const cat = await tree.create(ctx, order.outlet.id, { kind: "KATEGORI", name: "Tatlılar" });
    expect(cat.name).toBe("Tatlılar");
    const row = await seedOrder(order, { status: "ONAYLANDI", approvedAt: new Date(), prepStartedAt: new Date() });
    await expect(orders.transition(ctx, row.id, "HAZIR")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(orders.startPrep(ctx, row.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Minibar Takip Yöneticisi: elle oda girişi", () => {
  it("elle oda girişi ayarını görür ve değiştirir; başka sistem ayarı FORBIDDEN", async () => {
    const w = await minibarWorld();
    const { ctx } = await ctxOf("R-MTY");
    expect((await manual.manualEntryHotels(ctx)).map((h) => h.id)).toEqual([w.hotelId]);
    const before = await manual.loadManualEntryConfig(ctx, w.hotelId);
    expect(before.enabled).toBe(false);
    const saved = await manual.saveManualEntryConfig(ctx, w.hotelId, { enabled: false, floorIds: [w.floor.id], roomIds: [] });
    expect(saved.floorIds).toEqual([w.floor.id]);
    expect(await testDb.auditLog.count({ where: { userId: ctx.user.id, action: "SETTING_SET" } })).toBe(3);

    await expect(settingsAdmin.set(ctx, w.hotelId, "minibar.requireQrForControl", false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(settingsAdmin.listGrouped(ctx, w.hotelId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(settingsAdmin.setManualRoomEntrySetting(ctx, w.hotelId, "minibar.requireQrForControl", false)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("kapsam dışı otel ve diğer roller FORBIDDEN", async () => {
    const w = await minibarWorld();
    const other = await minibarWorld({ hotelCode: "DIAMOND" });
    const { ctx } = await ctxOf("R-MTY");
    await expect(manual.loadManualEntryConfig(ctx, other.hotelId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const code of ["R-OTM", "R-DEP", "R-QMY"]) {
      const c = (await ctxOf(code, `y-other-${code}`)).ctx;
      await expect(manual.saveManualEntryConfig(c, w.hotelId, { enabled: true, floorIds: [], roomIds: [] })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(await manual.manualEntryHotels(c)).toEqual([]);
    }
  });
});

describe("migration 20261110160000 seed ile aynı matrisi üretir", () => {
  it("yeni rollerin genel satırları silinip @limits bloğu uygulanınca seed matrisine döner", async () => {
    await runSeed(testDb, { legacyDefinitions: false });
    const where = { hotelId: null, role: { code: { in: [...NEW_ROLES] } } };
    const read = async () =>
      (await testDb.roleScreenPermission.findMany({ where, include: { role: true, screen: true } }))
        .map((r) => `${r.role.code}|${r.screen.code}|${[r.canView, r.canCreate, r.canEdit, r.canApprove, r.canReport].join()}`)
        .sort();
    const expected = await read();
    expect(expected.length).toBeGreaterThan(0);

    const kul = await testDb.appScreen.findUniqueOrThrow({ where: { code: "CR-KUL" } });
    await testDb.roleScreenPermission.deleteMany({ where });
    // A stray row outside the matrix: the block must remove it.
    const ouy = await testDb.role.findUniqueOrThrow({ where: { code: "R-OUY" } });
    await testDb.roleScreenPermission.create({ data: { roleId: ouy.id, screenId: kul.id, hotelId: null, canView: true } });
    const file = readFileSync(path.resolve(__dirname, "../../prisma/migrations/20261110160000_yonetici_rolleri/migration.sql"), "utf8");
    const block = file.slice(file.indexOf("-- @limits:begin"), file.indexOf("-- @limits:end"));
    const statements = block
      .split(/;\s*\n/)
      .map((x) => x.replace(/^\s*--.*$/gm, "").trim())
      .filter((x) => x.length > 0);
    for (const statement of statements) await testDb.$executeRawUnsafe(statement);
    // 20261110161000 adds MB-DOL D for R-MTY on top of the block.
    const followUp = readFileSync(path.resolve(__dirname, "../../prisma/migrations/20261110161000_mty_doluluk_silme/migration.sql"), "utf8").replace(/^\s*--.*$/gm, "").trim();
    await testDb.$executeRawUnsafe(followUp);
    // Later grants on top: MB-ZIM O,D (20261112030000, its @limits block), CR-RAD V,R (20261112090000) and
    // MB-TAN O,D (20261112120000, its @limits block).
    const limitsOf = (dir: string) => {
      const sql = readFileSync(path.resolve(__dirname, `../../prisma/migrations/${dir}/migration.sql`), "utf8");
      return sql
        .slice(sql.indexOf("-- @limits:begin"), sql.indexOf("-- @limits:end"))
        .split(/;\s*\n/)
        .map((x) => x.replace(/^\s*--.*$/gm, "").trim())
        .filter((x) => x.length > 0);
    };
    const later = [
      ...limitsOf("20261112030000_otel_deposu_stok_takibi"),
      ...limitsOf("20261112090000_mty_radar"),
      ...limitsOf("20261112120000_mty_tanim_ve_onaysiz_duzeltme"),
    ];
    expect(later.length).toBeGreaterThanOrEqual(3);
    for (const statement of later) await testDb.$executeRawUnsafe(statement);
    expect(await read()).toEqual(expected);

    // The whole file runs twice without error (idempotent) and leaves the same matrix.
    const all = file
      .split(/;\s*\n/)
      .map((x) => x.replace(/^\s*--.*$/gm, "").trim())
      .filter((x) => x.length > 0);
    for (let i = 0; i < 2; i++) {
      for (const statement of all) await testDb.$executeRawUnsafe(statement);
      await testDb.$executeRawUnsafe(followUp);
      for (const statement of later) await testDb.$executeRawUnsafe(statement);
    }
    expect(await read()).toEqual(expected);
    const access = await testDb.roleModuleAccess.findMany({ where: { hotelId: null, role: { code: { in: [...NEW_ROLES] } } }, include: { role: true } });
    expect(access.map((a) => `${a.role.code}|${a.moduleKey}`).sort()).toEqual(
      ["R-MTY|CORE", "R-MTY|MINIBAR", "R-QMY|CORE", "R-QMY|QR_MENU", "R-OUY|QR_ORDER", "R-MUY|QR_ORDER"].sort(),
    );
  });
});

describe("Minibar Takip Yöneticisi: Operasyon Radarı", () => {
  it("radarı yalnız MINIBAR katmanıyla izler; diğer yönetim rolleri sistem katmanını da görür", async () => {
    const { assertRadarScope } = await import("@/modules/radar/server/scope");
    const w = await minibarWorld();
    const mty = (await ctxOf("R-MTY")).ctx;
    expect(await assertRadarScope(mty, w.hotelId, "V")).toEqual(["MINIBAR"]);
    const otm = (await ctxOf("R-OTM", "y-radar-otm")).ctx;
    const layers = await assertRadarScope(otm, w.hotelId, "V");
    expect(layers).toContain("SISTEM");
    expect(layers).toContain("MINIBAR");
    // QR Menü Yönetimi keeps no radar at all.
    const qmy = (await ctxOf("R-QMY", "y-radar-qmy")).ctx;
    await expect(assertRadarScope(qmy, w.hotelId, "V")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
