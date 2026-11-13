import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderStatus } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import type { MeritEvent } from "@/lib/realtime-events";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeOutlet, makeUser, resetReferenceData, resetTestData, roleByCode } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
// The real matchesScope is under test; only the NOTIFY is replaced.
vi.mock("@/lib/realtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/realtime")>()),
  publish: publishMock,
}));

const { matchesScope } = await import("@/lib/realtime");
const { can } = await import("@/lib/rbac");
const { coverage, COVERAGE_CHANGED_EVENT } = await import("@/modules/order/server/roomService/coverage");
const { sseCoverage } = await import("@/modules/order/server/roomService/coverageAccess");
const { board } = await import("@/modules/order/server/roomService/board");
const { orders } = await import("@/modules/order/server/orders");
const { approvals } = await import("@/modules/order/server/approvals");

const HOUR = 3_600_000;
const codeOf = (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string }) => e.code ?? "ERR");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.printJob.deleteMany({});
  await testDb.notification.deleteMany({});
  await testDb.orderEvent.deleteMany({});
  await testDb.orderItem.deleteMany({});
  await testDb.order.deleteMany({});
  await testDb.auditLog.deleteMany({});
  await testDb.roomServiceCoverage.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

/** The hotel's room-service outlet (created when the seed did not), without the phone-confirmation step. */
async function rsOutlet(hotelCode: string) {
  const id = await hotelId(hotelCode);
  const data = {
    isActive: true,
    hasMenu: true,
    hasOrdering: true,
    orderingEnabled: true,
    phoneConfirmRequired: false,
    autoPrintReceipt: true,
  };
  const existing = await testDb.outlet.findFirst({ where: { hotelId: id, type: "ODA_SERVISI" } });
  if (existing) return testDb.outlet.update({ where: { id: existing.id }, data });
  return testDb.outlet.create({ data: { hotelId: id, name: "Oda Servisi", type: "ODA_SERVISI", ...data } });
}

async function roomOf(hotelCode: string) {
  const id = await hotelId(hotelCode);
  const floor =
    (await testDb.floor.findFirst({ where: { hotelId: id } })) ??
    (await testDb.floor.create({ data: { hotelId: id, name: "1. Kat", number: 1 } }));
  return (
    (await testDb.room.findFirst({ where: { hotelId: id, number: "101" } })) ??
    (await testDb.room.create({ data: { hotelId: id, floorId: floor.id, number: "101", extension: "4101" } }))
  );
}

async function seedOrder(outlet: { id: string; hotelId: string }, over: Record<string, unknown> = {}) {
  const node = await testDb.menuNode.create({ data: { outletId: outlet.id, kind: "OGE", name: "Club Sandviç", price: "15.00" } });
  const orderNo = (await testDb.order.count()) + 1;
  return testDb.order.create({
    data: {
      hotelId: outlet.hotelId,
      outletId: outlet.id,
      kind: "ODA_SERVISI",
      roomId: null,
      tableId: null,
      orderNo,
      status: "GONDERILDI",
      guestLanguage: "tr",
      idempotencyKey: randomUUID(),
      clientIp: "127.0.0.1",
      businessDate: new Date("2026-10-31"),
      items: { create: [{ menuNodeId: node.id, nameSnapshot: "Club Sandviç", qty: 1, unitPrice: "15.00" }] },
      ...over,
    },
  });
}

/** A room-service order of `hotelCode` in `status`. */
async function rsOrder(hotelCode: string, status: OrderStatus = "GONDERILDI") {
  const outlet = await rsOutlet(hotelCode);
  const room = await roomOf(hotelCode);
  return seedOrder(outlet, { roomId: room.id, status });
}

/** A user of `hotelCode` with a session in that hotel, optionally bound to an outlet. */
async function staff(username: string, roleCode: string, hotelCode: string, outletId?: string) {
  const user = await makeUser({ username, roleCode, hotelCode });
  const ctx = await ctxFor(user, { hotelCode });
  if (outletId) ctx.session.outletId = outletId;
  return { user, ctx };
}

/**
 * The usual cast: Diamond is the source hotel, Royal the covering one. `oss` runs Diamond's room service,
 * `ods` is Royal's room-service attendant signed in at Royal's room-service desk.
 */
async function world() {
  const diamond = await hotelId("DIAMOND");
  const royal = await hotelId("ROYAL");
  const diamondOutlet = await rsOutlet("DIAMOND");
  const royalOutlet = await rsOutlet("ROYAL");
  const oss = await staff("oss-diamond", "R-OSS", "DIAMOND");
  const ods = await staff("ods-royal", "R-ODS", "ROYAL", royalOutlet.id);
  return { diamond, royal, diamondOutlet, royalOutlet, oss, ods };
}

type World = Awaited<ReturnType<typeof world>>;

const give = (w: World, mode: "IZLEME" | "ISLEME", over: Record<string, unknown> = {}) =>
  coverage.grant(w.oss.ctx, { userId: w.ods.user.id, hotelId: w.diamond, mode, ...over });

/** A grant row written straight into the table (time windows the service would refuse to create). */
async function rawGrant(w: World, userId: string, data: Record<string, unknown>) {
  return testDb.roomServiceCoverage.create({
    data: {
      userId,
      hotelId: w.diamond,
      mode: "ISLEME",
      grantedById: w.oss.user.id,
      startsAt: new Date(Date.now() - 1000),
      ...data,
    },
  });
}

describe("coverage.grant / revoke: kim, kime, hangi otel", () => {
  it("Oda Servisi Sorumlusu kendi oteli için ekibindeki role izin verir; denetim kaydı ve kullanıcıya olay yazılır", async () => {
    const w = await world();
    const row = await give(w, "IZLEME", { endsAt: new Date(Date.now() + 2 * HOUR), note: "Gece vardiyası" });
    expect(row).toMatchObject({ mode: "IZLEME", state: "AKTIF", user: { id: w.ods.user.id }, hotel: { id: w.diamond } });

    const stored = await testDb.roomServiceCoverage.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored).toMatchObject({ userId: w.ods.user.id, hotelId: w.diamond, grantedById: w.oss.user.id, revokedAt: null });

    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "RS_COVERAGE_GRANTED" } });
    expect(log).toMatchObject({ userId: w.oss.user.id, hotelId: w.diamond, entity: "RoomServiceCoverage", entityId: row.id });
    expect(log.after).toMatchObject({ granteeId: w.ods.user.id, hotelId: w.diamond, mode: "IZLEME", note: "Gece vardiyası" });
    expect((log.after as { endsAt: string | null }).endsAt).not.toBeNull();

    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: COVERAGE_CHANGED_EVENT, userIds: [w.ods.user.id] }),
      expect.anything(),
    );
    expect((await coverage.activeFor(w.ods.user.id)).get(w.diamond)).toBe("IZLEME");
  });

  it("sistem yöneticisi verir; saha rolü ve yetkisiz yönetici veremez", async () => {
    const w = await world();
    const sysUser = await makeUser({ username: "sys", roleCode: "R-SYS", hotelCode: "ROYAL" });
    const sys = await ctxFor(sysUser, { hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND", "PREMIUM"] });
    const input = { userId: w.ods.user.id, hotelId: w.diamond, mode: "IZLEME" };
    expect(await codeOf(coverage.grant(sys, input))).toBe("OK");

    // A field role, even of the source hotel itself.
    const odsDiamond = await staff("ods-diamond", "R-ODS", "DIAMOND", w.diamondOutlet.id);
    expect(await codeOf(coverage.grant(odsDiamond.ctx, input))).toBe("FORBIDDEN");
    // A manager role that is not on the list (Otel Yönetimi has no room-service module either).
    const otm = await staff("otm-diamond", "R-OTM", "DIAMOND");
    expect(await codeOf(coverage.grant(otm.ctx, input))).toBe("FORBIDDEN");
  });

  it("yalnızca kendi oteli için: kapsam dışındaki otel FORBIDDEN", async () => {
    const w = await world();
    const premium = await hotelId("PREMIUM");
    expect(await codeOf(coverage.grant(w.oss.ctx, { userId: w.ods.user.id, hotelId: premium, mode: "IZLEME" }))).toBe("FORBIDDEN");
    // Royal's own manager cannot open Diamond either.
    const ossRoyal = await staff("oss-royal", "R-OSS", "ROYAL");
    expect(await codeOf(coverage.grant(ossRoyal.ctx, { userId: w.ods.user.id, hotelId: w.diamond, mode: "IZLEME" }))).toBe("FORBIDDEN");
    expect(await testDb.roomServiceCoverage.count()).toBe(0);
  });

  it("yalnızca yönetebildiği role: ekip dışı saha rolü ve üst kademe FORBIDDEN", async () => {
    const w = await world();
    const waiter = await makeUser({ username: "gar-royal", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const manager = await makeUser({ username: "fbm-royal", roleCode: "R-FBM", hotelCode: "ROYAL" });
    const peer = await makeUser({ username: "oss-royal", roleCode: "R-OSS", hotelCode: "ROYAL" });
    for (const user of [waiter, manager, peer]) {
      expect(await codeOf(coverage.grant(w.oss.ctx, { userId: user.id, hotelId: w.diamond, mode: "IZLEME" }))).toBe("FORBIDDEN");
    }
    // F&B Müdürü reaches the Oda Servisi Sorumlusu of the other hotel.
    const fbm = await staff("fbm-diamond", "R-FBM", "DIAMOND");
    expect(await codeOf(coverage.grant(fbm.ctx, { userId: peer.id, hotelId: w.diamond, mode: "ISLEME" }))).toBe("OK");
  });

  it("kullanıcının kendi oteli, pasif kullanıcı ve geçmiş bitiş VALIDATION", async () => {
    const w = await world();
    const own = await makeUser({ username: "ods-own", roleCode: "R-ODS", hotelCode: "DIAMOND" });
    const linked = await makeUser({ username: "ods-linked", roleCode: "R-ODS", hotelCode: "ROYAL", extraHotelCodes: ["DIAMOND"] });
    const passive = await makeUser({ username: "ods-passive", roleCode: "R-ODS", hotelCode: "ROYAL", isActive: false });
    for (const user of [own, linked, passive]) {
      expect(await codeOf(coverage.grant(w.oss.ctx, { userId: user.id, hotelId: w.diamond, mode: "IZLEME" }))).toBe("VALIDATION");
    }
    expect(await codeOf(give(w, "IZLEME", { endsAt: new Date(Date.now() - HOUR) }))).toBe("VALIDATION");
    expect(await codeOf(give(w, "IZLEME", { startsAt: new Date(Date.now() + 2 * HOUR), endsAt: new Date(Date.now() + HOUR) }))).toBe("VALIDATION");
    expect(await codeOf(coverage.grant(w.oss.ctx, { userId: w.ods.user.id, hotelId: w.diamond, mode: "HEPSI" }))).toBe("VALIDATION");
    expect(await codeOf(coverage.grant(w.oss.ctx, { userId: "yok", hotelId: w.diamond, mode: "IZLEME" }))).toBe("NOT_FOUND");
    expect(await testDb.roomServiceCoverage.count()).toBe(0);
  });

  it("aynı kullanıcı + otel için ikinci izin yığılmaz: tek açık satır değişir", async () => {
    const w = await world();
    const first = await give(w, "IZLEME", { endsAt: new Date(Date.now() + HOUR) });
    const second = await give(w, "ISLEME");
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ mode: "ISLEME", endsAt: null });
    expect(await testDb.roomServiceCoverage.count({ where: { userId: w.ods.user.id, hotelId: w.diamond } })).toBe(1);
    const changed = await testDb.auditLog.findFirstOrThrow({ where: { action: "RS_COVERAGE_CHANGED" } });
    expect(changed.before).toMatchObject({ mode: "IZLEME" });
    expect(changed.after).toMatchObject({ mode: "ISLEME", endsAt: null });

    // An ended grant is history: the next grant is a new row.
    await testDb.roomServiceCoverage.update({ where: { id: first.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const third = await give(w, "IZLEME");
    expect(third.id).not.toBe(first.id);
    expect(await testDb.roomServiceCoverage.count({ where: { userId: w.ods.user.id, hotelId: w.diamond } })).toBe(2);
  });

  it("kaldırma: yetkili kaldırır, denetim kaydı yazılır, ikinci kez CONFLICT, yetkisiz kaldıramaz", async () => {
    const w = await world();
    const row = await give(w, "ISLEME");

    const odsDiamond = await staff("ods-diamond", "R-ODS", "DIAMOND", w.diamondOutlet.id);
    expect(await codeOf(coverage.revoke(odsDiamond.ctx, { id: row.id }))).toBe("FORBIDDEN");
    // The grantee does not even see the row as theirs to manage (hotel outside their scope).
    expect(await codeOf(coverage.revoke(w.ods.ctx, { id: row.id }))).toBe("NOT_FOUND");
    expect((await coverage.activeFor(w.ods.user.id)).size).toBe(1);

    publishMock.mockClear();
    const revoked = await coverage.revoke(w.oss.ctx, { id: row.id });
    expect(revoked.state).toBe("KALDIRILDI");
    const stored = await testDb.roomServiceCoverage.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.revokedAt).not.toBeNull();
    expect(stored.revokedById).toBe(w.oss.user.id);
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "RS_COVERAGE_REVOKED" } });
    expect(log).toMatchObject({ userId: w.oss.user.id, hotelId: w.diamond, entityId: row.id });
    expect(log.after).toMatchObject({ granteeId: w.ods.user.id, mode: "ISLEME", revokedById: w.oss.user.id });
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: COVERAGE_CHANGED_EVENT, userIds: [w.ods.user.id] }),
      expect.anything(),
    );
    expect((await coverage.activeFor(w.ods.user.id)).size).toBe(0);
    expect(await codeOf(coverage.revoke(w.oss.ctx, { id: row.id }))).toBe("CONFLICT");
  });

  it("yönetici penceresi: kendi otellerinin izinleri ve izin verilebilecek kullanıcılar", async () => {
    const w = await world();
    await makeUser({ username: "ods-diamond", roleCode: "R-ODS", hotelCode: "DIAMOND" });
    await makeUser({ username: "gar-royal", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const row = await give(w, "IZLEME");
    const view = await coverage.list(w.oss.ctx);
    expect(view.hotels.map((h) => h.id)).toEqual([w.diamond]);
    expect(view.rows.map((r) => r.id)).toEqual([row.id]);
    expect(view.rows[0]).toMatchObject({ state: "AKTIF", grantedByName: w.oss.user.fullName });
    // Only reachable roles with the room-service board, and never someone who already works in the hotel.
    expect(view.candidates.map((c) => c.username)).toEqual(["ods-royal"]);
    expect(await codeOf(coverage.list(w.ods.ctx))).toBe("FORBIDDEN");
  });
});

describe("IZLEME: görür, hiçbir işlem yapamaz", () => {
  it("kapsanan otelin açık talepleri listelenir; her geçiş FORBIDDEN", async () => {
    const w = await world();
    const sent = await rsOrder("DIAMOND", "GONDERILDI");
    const approved = await rsOrder("DIAMOND", "ONAYLANDI");
    const ready = await rsOrder("DIAMOND", "HAZIR");
    const onWay = await rsOrder("DIAMOND", "YOLDA");
    await rsOrder("DIAMOND", "TESLIM_EDILDI");
    await give(w, "IZLEME");

    const view = await board.covered(w.ods.ctx);
    expect(view.hotels).toHaveLength(1);
    expect(view.hotels[0]).toMatchObject({ hotelId: w.diamond, hotelCode: "DIAMOND", outletId: w.diamondOutlet.id, mode: "IZLEME", canProcess: false });
    expect(view.hotels[0].cards.map((c) => c.card.id).sort()).toEqual([sent.id, approved.id, ready.id, onWay.id].sort());
    expect(view.hotels[0].cards.find((c) => c.card.id === sent.id)).toMatchObject({ column: "NEW", card: { roomNumber: "101" } });

    const t = (id: string, to: OrderStatus) => codeOf(orders.transition(w.ods.ctx, id, to, { reason: "Misafir vazgeçti" }));
    expect(await t(sent.id, "ONAYLANDI")).toBe("FORBIDDEN");
    expect(await t(sent.id, "IPTAL")).toBe("FORBIDDEN");
    expect(await t(approved.id, "HAZIR")).toBe("FORBIDDEN");
    expect(await t(approved.id, "IPTAL")).toBe("FORBIDDEN");
    expect(await t(ready.id, "YOLDA")).toBe("FORBIDDEN");
    expect(await t(onWay.id, "TESLIM_EDILDI")).toBe("FORBIDDEN");
    expect(await codeOf(orders.confirmPhone(w.ods.ctx, sent.id))).toBe("FORBIDDEN");
    expect(await codeOf(orders.startPrep(w.ods.ctx, approved.id))).toBe("FORBIDDEN");
    expect(await codeOf(orders.revertReady(w.ods.ctx, ready.id))).toBe("FORBIDDEN");

    const statuses = await testDb.order.findMany({ where: { id: { in: [sent.id, approved.id, ready.id, onWay.id] } }, select: { status: true } });
    expect(statuses.map((s) => s.status).sort()).toEqual(["GONDERILDI", "HAZIR", "ONAYLANDI", "YOLDA"]);
    expect(await testDb.orderEvent.count()).toBe(0);
    // The attempts are on record against the source hotel.
    expect(await testDb.auditLog.count({ where: { action: "YETKISIZ_DENEME", userId: w.ods.user.id, hotelId: w.diamond } })).toBeGreaterThan(0);
  });
});

describe("ISLEME: kendi otelindeki hakları kadar işler", () => {
  it("onaylar, hazır yapar, yola çıkarır, teslim eder; işlemi yapan kayda geçer", async () => {
    const w = await world();
    const order = await rsOrder("DIAMOND");
    await give(w, "ISLEME");

    const view = await board.covered(w.ods.ctx);
    expect(view.hotels[0]).toMatchObject({ hotelId: w.diamond, mode: "ISLEME", canProcess: true });

    for (const to of ["ONAYLANDI", "HAZIR", "YOLDA", "TESLIM_EDILDI"] as const) {
      const updated = await orders.transition(w.ods.ctx, order.id, to);
      expect(updated.status).toBe(to);
    }
    const stored = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored).toMatchObject({ status: "TESLIM_EDILDI", approvedById: w.ods.user.id, deliveredById: w.ods.user.id });
    const events = await testDb.orderEvent.findMany({ where: { orderId: order.id } });
    expect(events).toHaveLength(4);
    expect(events.every((e) => e.userId === w.ods.user.id)).toBe(true);
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: "ORDER_ONAYLANDI", entityId: order.id } });
    expect(log).toMatchObject({ userId: w.ods.user.id, hotelId: w.diamond });
    // The event still belongs to the source hotel and its outlet.
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "order.delivered", hotelId: w.diamond, outletId: w.diamondOutlet.id }),
      expect.anything(),
    );
    // Delivered: no longer among the open requests.
    expect((await board.covered(w.ods.ctx)).hotels[0].cards).toHaveLength(0);
  });

  it("kendi otelinde olmayan hak kapsanan otelde de yoktur (onay sonrası iptal)", async () => {
    const w = await world();
    const sent = await rsOrder("DIAMOND", "GONDERILDI");
    const approved = await rsOrder("DIAMOND", "ONAYLANDI");
    await give(w, "ISLEME");
    // The attendant's home rights: no approve on delivery tracking, edit on phone confirmation.
    expect(await can(w.ods.ctx, "RO-TES", "A", w.royal)).toBe(false);
    expect(await can(w.ods.ctx, "RO-TEL", "D", w.royal)).toBe(true);

    expect(await codeOf(orders.transition(w.ods.ctx, approved.id, "IPTAL", { reason: "Stok yok" }))).toBe("FORBIDDEN");
    expect((await testDb.order.findUniqueOrThrow({ where: { id: approved.id } })).status).toBe("ONAYLANDI");
    // What they may do at home (cancel before approval) they may do here.
    expect(await codeOf(orders.transition(w.ods.ctx, sent.id, "IPTAL", { reason: "Misafir vazgeçti" }))).toBe("OK");

    // A manager with the right at home has it on the covered hotel too.
    const ossRoyal = await staff("oss-royal", "R-OSS", "ROYAL");
    const fbm = await staff("fbm-diamond", "R-FBM", "DIAMOND");
    await coverage.grant(fbm.ctx, { userId: ossRoyal.user.id, hotelId: w.diamond, mode: "ISLEME" });
    expect(await codeOf(orders.transition(ossRoyal.ctx, approved.id, "IPTAL", { reason: "Stok yok" }))).toBe("OK");
  });

  it("kendi otelinde oda servisi masasına bağlı olmayan oturum kapsanan oteli de açamaz", async () => {
    const w = await world();
    const order = await rsOrder("DIAMOND");
    const bar = await makeOutlet("ROYAL", "Lobi Bar", "BAR");
    // A VIP waiter signed in at a bar: the outlet rule keeps them away from Royal's own room-service requests.
    const but = await staff("but-royal", "R-BUT", "ROYAL", bar.id);
    await rawGrant(w, but.user.id, {});
    expect((await board.covered(but.ctx)).hotels).toHaveLength(0);
    expect(await codeOf(orders.transition(but.ctx, order.id, "ONAYLANDI"))).toBe("NOT_FOUND");
    expect(await sseCoverage(but.ctx)).toEqual([]);
  });

  it("kaynak otelin personeli eskisi gibi görür ve işler", async () => {
    const w = await world();
    const order = await rsOrder("DIAMOND");
    const other = await rsOrder("DIAMOND");
    await give(w, "ISLEME");
    const home = await staff("ods-diamond", "R-ODS", "DIAMOND", w.diamondOutlet.id);

    const own = await board.get(home.ctx, w.diamondOutlet.id);
    expect(own.kpis.open).toBe(2);
    expect((await orders.transition(home.ctx, order.id, "ONAYLANDI")).approvedById).toBe(home.user.id);
    // Both sides act on the same list; the second attempt on a handled order is a CONFLICT, as always.
    expect((await orders.transition(w.ods.ctx, other.id, "ONAYLANDI")).approvedById).toBe(w.ods.user.id);
    expect(await codeOf(orders.transition(home.ctx, other.id, "ONAYLANDI"))).toBe("CONFLICT");
    // The source hotel's staff have no covered hotels of their own.
    expect((await board.covered(home.ctx)).hotels).toHaveLength(0);
  });
});

describe("süre ve kaldırma: sunucu her kullanımda saate bakar", () => {
  it("başlamadan önce, bittikten sonra ve kaldırıldıktan sonra liste boş, işlem reddedilir", async () => {
    const w = await world();
    const order = await rsOrder("DIAMOND");
    const now = Date.now();
    const cases: Record<string, unknown>[] = [
      { startsAt: new Date(now + HOUR), endsAt: new Date(now + 2 * HOUR) },
      { startsAt: new Date(now - 2 * HOUR), endsAt: new Date(now - 1000) },
      { startsAt: new Date(now - HOUR), revokedAt: new Date(now - 1000), revokedById: w.oss.user.id },
    ];
    for (const data of cases) {
      await testDb.roomServiceCoverage.deleteMany({});
      await rawGrant(w, w.ods.user.id, data);
      expect((await board.covered(w.ods.ctx)).hotels).toEqual([]);
      expect((await coverage.activeFor(w.ods.user.id)).size).toBe(0);
      // Without a working grant the order does not exist for the user: the answer every out-of-scope order gets.
      expect(await codeOf(orders.transition(w.ods.ctx, order.id, "ONAYLANDI"))).toBe("NOT_FOUND");
      expect(await codeOf(orders.transition(w.ods.ctx, order.id, "IPTAL", { reason: "Misafir vazgeçti" }))).toBe("NOT_FOUND");
      expect(await codeOf(orders.confirmPhone(w.ods.ctx, order.id))).toBe("NOT_FOUND");
    }
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("GONDERILDI");
  });

  it("servisle verilen izin kaldırılınca hemen durur", async () => {
    const w = await world();
    const order = await rsOrder("DIAMOND");
    const row = await give(w, "ISLEME");
    expect((await board.covered(w.ods.ctx)).hotels).toHaveLength(1);
    await coverage.revoke(w.oss.ctx, { id: row.id });
    expect((await board.covered(w.ods.ctx)).hotels).toEqual([]);
    expect(await codeOf(orders.transition(w.ods.ctx, order.id, "ONAYLANDI"))).toBe("NOT_FOUND");
  });

  it("izin hiç yokken davranış değişmez", async () => {
    const w = await world();
    const order = await rsOrder("DIAMOND");
    expect((await board.covered(w.ods.ctx)).hotels).toEqual([]);
    expect(await codeOf(orders.transition(w.ods.ctx, order.id, "ONAYLANDI"))).toBe("NOT_FOUND");
    expect(await codeOf(board.get(w.ods.ctx, w.diamondOutlet.id))).toBe("FORBIDDEN");
  });
});

describe("izin yalnızca oda servisi taleplerini açar", () => {
  it("otel kapsamı genişlemez: ekran hakkı, kendi panosu, masa siparişleri ve sipariş listeleri kapalı kalır", async () => {
    const w = await world();
    await give(w, "ISLEME");
    const rs = await rsOrder("DIAMOND");
    const bar = await makeOutlet("DIAMOND", "Havuz Bar", "BAR");
    const masa = await seedOrder({ id: bar.id, hotelId: w.diamond }, { kind: "MASA" });

    expect(w.ods.ctx.hotelIds).toEqual([w.royal]);
    expect(await can(w.ods.ctx, "RO-TAL", "V", w.diamond)).toBe(false);
    expect(await can(w.ods.ctx, "RO-TAL", "D", w.diamond)).toBe(false);
    // The source hotel's own board (KPIs, delivered history, switches) is not the covered list.
    expect(await codeOf(board.get(w.ods.ctx, w.diamondOutlet.id))).toBe("FORBIDDEN");
    // Another module's reads and writes of the same hotel.
    expect(await codeOf(orders.listForOutlet(w.ods.ctx, bar.id))).toBe("NOT_FOUND");
    expect(await codeOf(orders.listForOutlet(w.ods.ctx, w.diamondOutlet.id))).toBe("NOT_FOUND");
    expect(await codeOf(orders.get(w.ods.ctx, masa.id))).toBe("NOT_FOUND");
    expect(await codeOf(orders.get(w.ods.ctx, rs.id))).toBe("NOT_FOUND");
    expect(await codeOf(orders.transition(w.ods.ctx, masa.id, "ONAYLANDI"))).toBe("NOT_FOUND");
    expect(await codeOf(orders.startPrep(w.ods.ctx, masa.id))).toBe("NOT_FOUND");
    // A third hotel stays closed.
    const premium = await rsOrder("PREMIUM");
    expect(await codeOf(orders.transition(w.ods.ctx, premium.id, "ONAYLANDI"))).toBe("NOT_FOUND");
    expect((await board.covered(w.ods.ctx)).hotels.map((h) => h.hotelCode)).toEqual(["DIAMOND"]);
  });

  it("kendi otelinde oda servisi ekranı olmayan kullanıcı izni olsa da hiçbir şey görmez", async () => {
    const w = await world();
    const order = await rsOrder("DIAMOND");
    // A minibar attendant is in the Oda Servisi Sorumlusu's team, so the grant itself is allowed.
    const kat = await staff("kat-royal", "R-KAT", "ROYAL");
    expect(await codeOf(coverage.grant(w.oss.ctx, { userId: kat.user.id, hotelId: w.diamond, mode: "ISLEME" }))).toBe("OK");
    expect(await can(kat.ctx, "RO-TAL", "V", w.royal)).toBe(false);

    expect(await codeOf(board.covered(kat.ctx))).toBe("FORBIDDEN");
    expect(await codeOf(orders.transition(kat.ctx, order.id, "ONAYLANDI"))).toBe("FORBIDDEN");
    expect((await testDb.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("GONDERILDI");
  });
});

describe("canlı akış (matchesScope) ve bildirim alıcıları", () => {
  const at = new Date().toISOString();
  const scopeOf = (ctx: Ctx, cover: Awaited<ReturnType<typeof sseCoverage>>) => ({
    userId: ctx.user.id,
    sessionId: ctx.session.id,
    hotelIds: ctx.hotelIds,
    outletId: ctx.session.outletId,
    roleKind: ctx.user.roleKind,
    coverage: cover,
  });

  it("kapsanan otelin oda servisi olayı geçer; aynı otelin başka olayları geçmez", async () => {
    const w = await world();
    await give(w, "IZLEME", { endsAt: new Date(Date.now() + HOUR) });
    const cover = await sseCoverage(w.ods.ctx);
    expect(cover).toHaveLength(1);
    expect(cover[0]).toMatchObject({ hotelId: w.diamond, mode: "IZLEME" });
    const scope = scopeOf(w.ods.ctx, cover);
    const base = { hotelId: w.diamond, outletId: w.diamondOutlet.id, at };
    const rs = (type: string): MeritEvent => ({ ...base, type, payload: { orderId: "o1", kind: "ODA_SERVISI" } });

    for (const type of ["order.created", "order.approved", "order.ready", "order.onway", "order.delivered", "order.cancelled"]) {
      expect(matchesScope(rs(type), scope)).toBe(true);
    }
    // The SLA warning is a board event too, and keeps its narrow `kind` gate.
    expect(matchesScope(rs("order.sla"), scope)).toBe(true);
    expect(matchesScope({ ...base, type: "order.sla", payload: { orderId: "o1" } }, scope)).toBe(false);
    // Same hotel, not a room-service request.
    expect(matchesScope({ ...base, type: "order.created", payload: { orderId: "o2", kind: "MASA" } }, scope)).toBe(false);
    expect(matchesScope({ ...base, type: "order.created" }, scope)).toBe(false);
    expect(matchesScope({ ...base, type: "order.created", payloadTruncated: true }, scope)).toBe(false);
    expect(matchesScope({ ...base, type: "call.created", payload: { kind: "ODA_SERVISI" } }, scope)).toBe(false);
    expect(matchesScope({ ...base, type: "print.failed", payload: { kind: "ODA_SERVISI" } }, scope)).toBe(false);
    expect(matchesScope({ type: "settings.changed", hotelId: w.diamond, at }, scope)).toBe(false);
    expect(matchesScope({ type: "mybar.created", hotelId: w.diamond, at, payload: { kind: "ODA_SERVISI" } }, scope)).toBe(false);
    expect(matchesScope({ type: "order.created", hotelId: w.diamond, at, payload: { kind: "ODA_SERVISI" } }, scope)).toBe(false);
    // A hotel that is not covered.
    expect(matchesScope({ ...rs("order.created"), hotelId: await hotelId("PREMIUM") }, scope)).toBe(false);
    // Role-addressed events keep their rule.
    expect(matchesScope({ ...rs("order.created"), roleKinds: ["SISTEM"] }, scope)).toBe(false);
    // Without coverage nothing of that hotel arrives, as before.
    expect(matchesScope(rs("order.created"), scopeOf(w.ods.ctx, []))).toBe(false);
    // The session's own hotel keeps its outlet rule.
    const own = { type: "order.created", hotelId: w.royal, at, payload: { kind: "ODA_SERVISI" } };
    expect(matchesScope({ ...own, outletId: w.royalOutlet.id }, scope)).toBe(true);
    expect(matchesScope({ ...own, outletId: "baska-outlet" }, scope)).toBe(false);
  });

  it("süre penceresi olay anında yeniden değerlendirilir", async () => {
    const w = await world();
    const start = Date.now() + HOUR;
    await rawGrant(w, w.ods.user.id, { mode: "IZLEME", startsAt: new Date(start), endsAt: new Date(start + HOUR) });
    const scope = scopeOf(w.ods.ctx, await sseCoverage(w.ods.ctx));
    expect(scope.coverage).toHaveLength(1);
    const event: MeritEvent = {
      type: "order.created",
      hotelId: w.diamond,
      outletId: w.diamondOutlet.id,
      at,
      payload: { kind: "ODA_SERVISI" },
    };
    expect(matchesScope(event, scope)).toBe(false);
    expect(matchesScope(event, scope, start - 1)).toBe(false);
    expect(matchesScope(event, scope, start)).toBe(true);
    expect(matchesScope(event, scope, start + HOUR - 1)).toBe(true);
    expect(matchesScope(event, scope, start + HOUR)).toBe(false);
  });

  it("bitmiş ve kaldırılmış izin akışa hiç yüklenmez", async () => {
    const w = await world();
    await rawGrant(w, w.ods.user.id, { startsAt: new Date(Date.now() - 2 * HOUR), endsAt: new Date(Date.now() - 1000) });
    expect(await sseCoverage(w.ods.ctx)).toEqual([]);
    const row = await give(w, "ISLEME");
    expect(await sseCoverage(w.ods.ctx)).toHaveLength(1);
    await coverage.revoke(w.oss.ctx, { id: row.id });
    expect(await sseCoverage(w.ods.ctx)).toEqual([]);
  });

  it("kendi otelinde RO-TAL görüntüleme hakkı olmayan kullanıcı izni olsa da kapsanan olay almaz", async () => {
    const w = await world();
    const kat = await staff("kat-royal", "R-KAT", "ROYAL");
    await coverage.grant(w.oss.ctx, { userId: kat.user.id, hotelId: w.diamond, mode: "ISLEME" });
    expect((await coverage.activeFor(kat.user.id)).get(w.diamond)).toBe("ISLEME");
    expect(await can(kat.ctx, "RO-TAL", "V", w.royal)).toBe(false);

    const cover = await sseCoverage(kat.ctx);
    expect(cover).toEqual([]);
    const event: MeritEvent = {
      type: "order.created",
      hotelId: w.diamond,
      outletId: w.diamondOutlet.id,
      at,
      payload: { kind: "ODA_SERVISI" },
    };
    expect(matchesScope(event, scopeOf(kat.ctx, cover))).toBe(false);
  });

  it("oturumun kendi kapsamındaki otel akış kapsamına alınmaz", async () => {
    const w = await world();
    await give(w, "ISLEME");
    const wide: Ctx = { ...w.ods.ctx, hotelIds: [w.royal, w.diamond] };
    expect(await sseCoverage(wide)).toEqual([]);
    expect((await board.covered(wide)).hotels).toEqual([]);
  });

  it("yeni talep bildirimi: çevrimiçi ISLEME kullanıcısı alıcıdır, IZLEME ve çevrimdışı değildir", async () => {
    const w = await world();
    const subject = { hotelId: w.diamond, outletId: w.diamondOutlet.id, assignedWaiterId: null, kind: "ODA_SERVISI" as const };
    const recipients = () => testDb.$transaction((tx) => approvals.recipientsFor(tx, subject));
    const role = await roleByCode("R-ODS");
    const signIn = (userId: string) =>
      testDb.userSession.create({
        data: {
          userId,
          hotelId: w.royal,
          outletId: w.royalOutlet.id,
          roleId: role.id,
          status: "ONLINE",
          expiresAt: new Date(Date.now() + HOUR),
          ip: "127.0.0.1",
          userAgent: "vitest",
        },
      });

    await give(w, "ISLEME");
    expect(await recipients()).not.toContain(w.ods.user.id);
    await signIn(w.ods.user.id);
    expect(await recipients()).toContain(w.ods.user.id);

    await give(w, "IZLEME");
    expect(await recipients()).not.toContain(w.ods.user.id);
  });
});
