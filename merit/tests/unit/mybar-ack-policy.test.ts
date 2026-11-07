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

  it("özel rol: MB-PERS'te tüm haklara sahip olsa da rol kodu kat sorumlusu değilse false", async () => {
    const role = await testDb.role.create({ data: { code: "R-OZEL-ACK", name: "Özel ack rolü", kind: "MINIBAR" } });
    const screen = await testDb.appScreen.findUniqueOrThrow({ where: { code: "MB-PERS" } });
    await testDb.roleScreenPermission.create({
      data: { roleId: role.id, screenId: screen.id, hotelId: null, canView: true, canCreate: true, canEdit: true, canApprove: true },
    });
    await testDb.roleModuleAccess.create({ data: { roleId: role.id, hotelId: null, moduleKey: "MINIBAR", enabled: true } });
    const custom = await ctxFor(
      await makeUser({ username: "ozel-ack7", roleCode: "R-OZEL-ACK", hotelCode: "ROYAL" }),
      { hotelCode: "ROYAL" },
    );
    expect(await shouldShowAckHost(custom)).toBe(false);
  });

  it("MINIBAR modülü kapalı otelde kat sorumlusu için de false", async () => {
    await testDb.hotelModule.updateMany({
      where: { hotelId: katDiamond.session.hotelId, moduleKey: "MINIBAR" },
      data: { enabled: false },
    });
    expect(await shouldShowAckHost(katDiamond)).toBe(false);
  });
});
