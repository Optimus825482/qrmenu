import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/lib/auth";
import { testDb } from "../helpers/db";
import { ctxFor, dropReferenceData, makeUser, resetReferenceData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { shouldShowAckHost } = await import("@/modules/mybar/server/ackPolicy");

let kat: Ctx;
let katDiamond: Ctx;
let dep: Ctx;
let otm: Ctx;

beforeAll(async () => {
  await resetReferenceData();
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  kat = await ctxFor(await makeUser({ username: "kat-ack7", roleCode: "R-KAT", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
  katDiamond = await ctxFor(await makeUser({ username: "katd-ack7", roleCode: "R-KAT", hotelCode: "DIAMOND" }), {
    hotelCode: "DIAMOND",
  });
  dep = await ctxFor(await makeUser({ username: "dep-ack7", roleCode: "R-DEP", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
  otm = await ctxFor(await makeUser({ username: "otm-ack7", roleCode: "R-OTM", hotelCode: "ROYAL" }), { hotelCode: "ROYAL" });
});

afterAll(async () => {
  await dropReferenceData();
});

describe("shouldShowAckHost", () => {
  it("kat sorumlusu için true; depo ve otel müdürü için false", async () => {
    expect(await shouldShowAckHost(kat)).toBe(true);
    expect(await shouldShowAckHost(dep)).toBe(false);
    expect(await shouldShowAckHost(otm)).toBe(false);
  });

  it("MINIBAR modülü kapalı otelde kat sorumlusu için de false", async () => {
    await testDb.hotelModule.updateMany({
      where: { hotelId: katDiamond.session.hotelId, moduleKey: "MINIBAR" },
      data: { enabled: false },
    });
    expect(await shouldShowAckHost(katDiamond)).toBe(false);
  });
});
