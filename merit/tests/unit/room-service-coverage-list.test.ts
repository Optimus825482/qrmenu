import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/realtime")>()),
  publish: vi.fn(),
}));

const { coverage } = await import("@/modules/order/server/roomService/coverage");

// The manager window lists what is still worth looking at: grants that run or are planned, and the ones whose
// time ran out in the last week. A grant the manager removed by hand is gone from the window at once (the audit
// log keeps it).

const HOUR = 3_600_000;

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.auditLog.deleteMany({});
  await testDb.roomServiceCoverage.deleteMany({});
  await resetTestData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

async function world() {
  const diamond = await hotelId("DIAMOND");
  const ossUser = await makeUser({ username: "liste-oss", roleCode: "R-OSS", hotelCode: "DIAMOND" });
  const oss = await ctxFor(ossUser, { hotelCode: "DIAMOND" });
  const ods = await makeUser({ username: "liste-ods", roleCode: "R-ODS", hotelCode: "ROYAL" });
  const other = await makeUser({ username: "liste-ods2", roleCode: "R-ODS", hotelCode: "ROYAL" });
  return { diamond, oss, ossUser, ods, other };
}

describe("coverage.list: removed grants", () => {
  it("drops a grant from the window as soon as it is removed, and offers the user again", async () => {
    const w = await world();
    const row = await coverage.grant(w.oss, { userId: w.ods.id, hotelId: w.diamond, mode: "IZLEME" });
    expect((await coverage.list(w.oss)).rows.map((r) => r.id)).toEqual([row.id]);

    await coverage.revoke(w.oss, { id: row.id });
    const view = await coverage.list(w.oss);
    expect(view.rows).toEqual([]);
    expect(view.candidates.map((c) => c.username)).toContain("liste-ods");
    // Removed from the window, not from the record.
    expect(await testDb.roomServiceCoverage.count({ where: { id: row.id, revokedAt: { not: null } } })).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: "RS_COVERAGE_REVOKED", entityId: row.id } })).toBe(1);
  });

  it("still shows a grant whose time ran out in the last week, after the running ones", async () => {
    const w = await world();
    const now = Date.now();
    const ended = await testDb.roomServiceCoverage.create({
      data: {
        userId: w.other.id,
        hotelId: w.diamond,
        mode: "ISLEME",
        startsAt: new Date(now - 5 * HOUR),
        endsAt: new Date(now - HOUR),
        grantedById: w.ossUser.id,
      },
    });
    const running = await coverage.grant(w.oss, { userId: w.ods.id, hotelId: w.diamond, mode: "IZLEME" });
    const removed = await coverage.grant(w.oss, { userId: w.other.id, hotelId: w.diamond, mode: "IZLEME" });
    await coverage.revoke(w.oss, { id: removed.id });

    const view = await coverage.list(w.oss);
    expect(view.rows.map((r) => [r.id, r.state])).toEqual([
      [running.id, "AKTIF"],
      [ended.id, "BITTI"],
    ]);
  });
});
