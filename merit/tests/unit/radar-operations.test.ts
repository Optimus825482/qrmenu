import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { recordOperation, purgeOperations } = await import("@/modules/radar/server/operations");

beforeAll(resetReferenceData);
beforeEach(async () => {
  await testDb.operationEvent.deleteMany({});
});
afterAll(async () => {
  await testDb.operationEvent.deleteMany({});
  await dropReferenceData();
  await testDb.$disconnect();
});

const NOW = new Date("2026-11-03T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe("recordOperation", () => {
  it("transaction içinde yazar; rollback satır bırakmaz", async () => {
    const hid = await hotelId("ROYAL");
    await expect(
      testDb.$transaction(async (tx) => {
        await recordOperation(tx, { hotelId: hid, type: "table.assigned", refId: "t1", data: { userId: "u1" } });
        throw new Error("geri al");
      }),
    ).rejects.toThrow("geri al");
    expect(await testDb.operationEvent.count()).toBe(0);

    await testDb.$transaction((tx) =>
      recordOperation(tx, { hotelId: hid, type: "printer.health", refId: "p1", data: { state: "SESSIZ" }, at: NOW }),
    );
    const row = await testDb.operationEvent.findFirstOrThrow();
    expect(row).toMatchObject({ hotelId: hid, type: "printer.health", refId: "p1", outletId: null, data: { state: "SESSIZ" } });
    expect(row.at.toISOString()).toBe(NOW.toISOString());
  });

  it("data verilmezse boş nesne yazar", async () => {
    const hid = await hotelId("ROYAL");
    await testDb.$transaction((tx) => recordOperation(tx, { hotelId: hid, type: "upload.missing" }));
    expect((await testDb.operationEvent.findFirstOrThrow()).data).toEqual({});
  });
});

describe("purgeOperations", () => {
  it("91 günlük satırı siler, 89 günlüğü bırakır ve silinen sayıyı döner", async () => {
    const hid = await hotelId("ROYAL");
    await testDb.$transaction(async (tx) => {
      await recordOperation(tx, { hotelId: hid, type: "presence.idle", refId: "old", at: daysAgo(91) });
      await recordOperation(tx, { hotelId: hid, type: "presence.idle", refId: "new", at: daysAgo(89) });
    });
    expect(await purgeOperations(NOW, 90)).toBe(1);
    const rest = await testDb.operationEvent.findMany();
    expect(rest.map((r) => r.refId)).toEqual(["new"]);
    expect(await purgeOperations(NOW, 90)).toBe(0);
  });
});
