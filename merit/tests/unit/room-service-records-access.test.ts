import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff } from "../helpers/minibarFixtures";

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const { listRoomServiceOrdersAction } = await import("@/modules/order/server/actions/roomServiceRecords");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetMinibarData();
  await resetTestData();
  requireUser.mockReset();
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
});

const as = (ctx: Ctx) => requireUser.mockResolvedValue(ctx);

describe("oda servisi kayıtları yetkisi", () => {
  it("kapsam dışı otel FORBIDDEN", async () => {
    const mgr = await staff("R-FBM", "ROYAL");
    as(mgr.ctx);
    const res = await listRoomServiceOrdersAction({ hotelId: await hotelId("DIAMOND") });
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });

  it("RO-TAL görüntüleme yetkisi olmayan rol (kat sorumlusu) FORBIDDEN", async () => {
    const kat = await staff("R-KAT", "ROYAL");
    as(kat.ctx);
    const res = await listRoomServiceOrdersAction({ hotelId: kat.ctx.session.hotelId });
    expect(!res.ok && res.error.code).toBe("FORBIDDEN");
  });

  it("yetkili rol kendi otelinin kayıtlarını görür", async () => {
    const mgr = await staff("R-FBM", "ROYAL");
    as(mgr.ctx);
    const res = await listRoomServiceOrdersAction({ hotelId: mgr.ctx.session.hotelId });
    expect(res.ok).toBe(true);
  });
});
