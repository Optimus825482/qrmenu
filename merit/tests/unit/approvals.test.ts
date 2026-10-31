import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { addMember, dropReferenceData, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { type OrderSetup, openSession, orderSetup, seedOrder, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { approvals } = await import("@/modules/order/server/approvals");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.order.deleteMany({});
  await testDb.tableAssignment.deleteMany({});
  await testDb.outletTable.deleteMany({});
  await testDb.menuNode.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const recipients = (order: { hotelId: string; outletId: string; assignedWaiterId: string | null }) =>
  testDb.$transaction((tx) => approvals.recipientsFor(tx, order));

async function online(username: string, roleCode: string, s: OrderSetup, status: "ONLINE" | "UYARI" | "CIKTI" = "ONLINE") {
  const a = await staffCtx(username, roleCode, s.outlet.id);
  await openSession(a.user.id, s.outlet.id, roleCode, status);
  return a;
}

describe("approvals.recipientsFor", () => {
  it("online kasa + atanmış garson = 2 alıcı", async () => {
    const s = await orderSetup();
    const kas = await online("kas", "R-KAS", s);
    const gar = await staffCtx("gar", "R-GAR", s.outlet.id); // atanmış, oturumu gerekmez
    const order = await seedOrder(s, { assignedWaiterId: gar.user.id });
    expect((await recipients(order)).sort()).toEqual([kas.user.id, gar.user.id].sort());
  });

  it("atama yoksa online 2 garson + kasa", async () => {
    const s = await orderSetup();
    const kas = await online("kas", "R-KAS", s);
    const g1 = await online("g1", "R-GAR", s);
    const g2 = await online("g2", "R-GAR", s);
    const order = await seedOrder(s);
    expect((await recipients(order)).sort()).toEqual([kas.user.id, g1.user.id, g2.user.id].sort());
  });

  it("offline (CIKTI) garson sayılmaz; UYARI sayılır", async () => {
    const s = await orderSetup();
    await online("g1", "R-GAR", s, "CIKTI");
    const g2 = await online("g2", "R-GAR", s, "UYARI");
    const order = await seedOrder(s);
    expect(await recipients(order)).toEqual([g2.user.id]);
  });

  it("başka outletin kasası sayılmaz", async () => {
    const s = await orderSetup();
    const other = await orderSetup({ outlet: { name: "Başka Bar" } });
    await online("kasx", "R-KAS", other);
    const order = await seedOrder(s);
    expect(await recipients(order)).toEqual([]);
  });

  it("R-SGF (outlet üyesi) ve R-FBM dahil; üye olmayan SGF dahil değil; benzersiz", async () => {
    const s = await orderSetup();
    const sgf = await staffCtx("sgf", "R-SGF", s.outlet.id);
    await addMember(sgf.user.id, s.outlet.id);
    await staffCtx("sgf2", "R-SGF"); // üye değil
    const fbm = await staffCtx("fbm", "R-FBM");
    const kas = await online("kas", "R-KAS", s);
    await openSession(sgf.user.id, s.outlet.id, "R-SGF"); // aynı kullanıcı iki yoldan
    const order = await seedOrder(s);
    const got = await recipients(order);
    expect(got.sort()).toEqual([kas.user.id, sgf.user.id, fbm.user.id].sort());
    expect(new Set(got).size).toBe(got.length);
  });
});

describe("approvals.canApproveOrder / visibleQueue", () => {
  it("canApproveOrder: KAS evet; GAR yalnız atanmışsa; başka outlet hayır", async () => {
    const s = await orderSetup();
    const other = await orderSetup({ outlet: { name: "Başka Bar" } });
    const kas = await staffCtx("kas", "R-KAS", s.outlet.id);
    const gar = await staffCtx("gar", "R-GAR", s.outlet.id);
    const garX = await staffCtx("garx", "R-GAR", other.outlet.id);
    const free = await seedOrder(s);
    const mine = await seedOrder(s, { assignedWaiterId: gar.user.id });
    expect(await approvals.canApproveOrder(kas.ctx, free)).toBe(true);
    expect(await approvals.canApproveOrder(gar.ctx, free)).toBe(false);
    expect(await approvals.canApproveOrder(gar.ctx, mine)).toBe(true);
    expect(await approvals.canApproveOrder(garX.ctx, mine)).toBe(false);
  });

  it("visibleQueue(R-GAR): atanmış başkasına ait siparişi göstermez; atanmamış ve kendisininkini gösterir", async () => {
    const s = await orderSetup();
    const gar = await staffCtx("gar", "R-GAR", s.outlet.id);
    const gar2 = await staffCtx("gar2", "R-GAR", s.outlet.id);
    const kas = await staffCtx("kas", "R-KAS", s.outlet.id);
    const free = await seedOrder(s);
    const mine = await seedOrder(s, { assignedWaiterId: gar.user.id });
    const theirs = await seedOrder(s, { assignedWaiterId: gar2.user.id });
    await seedOrder(s, { status: "ONAYLANDI" }); // kuyruk yalnız GONDERILDI
    const ids = (await approvals.visibleQueue(gar.ctx, s.outlet.id)).map((o) => o.id);
    expect(ids.sort()).toEqual([free.id, mine.id].sort());
    expect((await approvals.visibleQueue(kas.ctx, s.outlet.id)).map((o) => o.id).sort()).toEqual(
      [free.id, mine.id, theirs.id].sort(),
    );
  });
});
