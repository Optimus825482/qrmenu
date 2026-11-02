import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { addMember, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { openSession, staffCtx } from "../helpers/orderFixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
const publishMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/realtime", () => ({ publish: publishMock }));

const { approvals } = await import("@/modules/order/server/approvals");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.order.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  publishMock.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function getOrCreateRsOutlet(hotelIdStr: string) {
  const existing = await testDb.outlet.findFirst({
    where: { hotelId: hotelIdStr, type: "ODA_SERVISI" },
  });
  if (existing) {
    return testDb.outlet.update({
      where: { id: existing.id },
      data: { isActive: true, hasMenu: true, hasOrdering: true, orderingEnabled: true },
    });
  }
  return testDb.outlet.create({
    data: {
      hotelId: hotelIdStr,
      name: "Oda Servisi",
      type: "ODA_SERVISI",
      isActive: true,
      hasMenu: true,
      hasOrdering: true,
      orderingEnabled: true,
    },
  });
}

describe("approvals.recipientsFor (ODA_SERVISI)", () => {
  it("online R-ODS + R-MUS + R-FBM -> 3 alıcı; offline R-ODS sayılmaz; başka otelin R-FBM'si sayılmaz; R-SGF dahil değil", async () => {
    const mrId = await hotelId("ROYAL");
    const mrdId = await hotelId("DIAMOND");
    const rsOutlet = await getOrCreateRsOutlet(mrId);

    // 1. Online R-ODS at the room service outlet
    const ods = await staffCtx("ods_online", "R-ODS", rsOutlet.id);
    await openSession(ods.user.id, rsOutlet.id, "R-ODS", "ONLINE");

    // 2. Online R-MUS at the room service outlet
    const mus = await staffCtx("mus_online", "R-MUS", rsOutlet.id);
    await openSession(mus.user.id, rsOutlet.id, "R-MUS", "ONLINE");

    // 3. Hotel F&B Manager (R-FBM) for MR
    const fbm = await staffCtx("fbm_mr", "R-FBM");

    // 4. Offline (CIKTI) R-ODS at the outlet -> should NOT be included
    const odsOffline = await staffCtx("ods_offline", "R-ODS", rsOutlet.id);
    await openSession(odsOffline.user.id, rsOutlet.id, "R-ODS", "CIKTI");

    // 5. Another hotel's R-FBM (DIAMOND) -> should NOT be included
    const userMrdFbm = await makeUser({ username: "fbm_mrd", roleCode: "R-FBM", hotelCode: "DIAMOND" });

    // 6. R-SGF member at MR -> should NOT be included for ODA_SERVISI
    const sgf = await staffCtx("sgf_mr", "R-SGF", rsOutlet.id);
    await addMember(sgf.user.id, rsOutlet.id);
    await openSession(sgf.user.id, rsOutlet.id, "R-SGF", "ONLINE");

    const order = {
      hotelId: mrId,
      outletId: rsOutlet.id,
      kind: "ODA_SERVISI" as const,
      assignedWaiterId: null,
    };

    const got = await testDb.$transaction((tx) => approvals.recipientsFor(tx, order));

    // Must contain exactly ods, mus, fbm
    expect(got.sort()).toEqual([ods.user.id, mus.user.id, fbm.user.id].sort());
    expect(got).not.toContain(odsOffline.user.id);
    expect(got).not.toContain(userMrdFbm.id);
    expect(got).not.toContain(sgf.user.id);
  });
});
