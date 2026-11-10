import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, makeUser, resetReferenceData } from "../helpers/fixtures";
import { resetMinibarData } from "../helpers/minibarFixtures";
import { makeMybarFixture, makeRequest, type MybarFixture } from "../helpers/mybar";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { mybarStaleSweep, MYBAR_STALE_TYPE } = await import("@/modules/mybar/server/staleSweep");

let fx: MybarFixture;
let depId: string;
let otmId: string;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

beforeAll(async () => {
  await resetReferenceData();
  depId = (await makeUser({ username: "dep-mbstale", roleCode: "R-DEP", hotelCode: "ROYAL" })).id;
  otmId = (await makeUser({ username: "otm-mbstale", roleCode: "R-OTM", hotelCode: "ROYAL" })).id;
});
beforeEach(async () => {
  await resetMinibarData();
  await testDb.notification.deleteMany({ where: { type: MYBAR_STALE_TYPE } });
  fx = await makeMybarFixture({ hotelCode: "ROYAL", roomNumber: "301" });
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const stale = () => testDb.notification.findMany({ where: { type: MYBAR_STALE_TYPE } });

describe("mybarStaleSweep", () => {
  it("escalates an unseen request older than radar.mybarStaleMinutes once, to depot and management", async () => {
    const old = await makeRequest(fx, { createdAt: minutesAgo(45) });
    expect(await mybarStaleSweep(new Date())).toBe(1);
    const rows = await stale();
    expect(rows.map((r) => r.userId).sort()).toEqual([depId, otmId].sort());
    expect(rows.every((r) => r.refId === old.id)).toBe(true);
    expect(await mybarStaleSweep(new Date())).toBe(0);
    expect(await stale()).toHaveLength(2);
  });

  it("ignores young, seen, completed and cancelled requests", async () => {
    await makeRequest(fx, { createdAt: minutesAgo(10) });
    await makeRequest(fx, { createdAt: minutesAgo(45), seen: true });
    await makeRequest(fx, { createdAt: minutesAgo(45), status: "TAMAMLANDI", completedAt: new Date() });
    await makeRequest(fx, { createdAt: minutesAgo(45), status: "IPTAL", cancelledAt: new Date() });
    expect(await mybarStaleSweep(new Date())).toBe(0);
    expect(await stale()).toHaveLength(0);
  });
});
