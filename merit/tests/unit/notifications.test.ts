import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { testDb } from "../helpers/db";
import {
  dropReferenceData,
  hotelId,
  makeUser,
  resetReferenceData,
  resetTestData,
} from "../helpers/fixtures";

vi.mock("@/lib/env", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/env")>();
  return { env: { ...actual.env, DATABASE_URL: process.env.DATABASE_URL_TEST! } };
});
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { startRealtimeListener, stopRealtimeListener, subscribe } = await import("@/lib/realtime");
const { notify } = await import("@/modules/core/server/notifications");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const input = { type: "test.note", title: "Başlık", body: "Gövde", refType: "order", refId: "o1" };

let received: MeritEvent[] = [];
let off: () => void = () => {};

beforeAll(async () => {
  await resetReferenceData();
  await startRealtimeListener();
});
beforeEach(async () => {
  await resetTestData();
  received = [];
  off();
  off = subscribe(
    (e) => e.type === "notification.created",
    (e) => received.push(e),
  );
});
afterAll(async () => {
  off();
  await stopRealtimeListener();
  await dropReferenceData();
  await testDb.$disconnect();
});

describe("notify", () => {
  it("otel+rol alıcıları: o oteldeki o rollerdeki aktif kullanıcılar kadar satır", async () => {
    const mr = await hotelId("MR");
    const kat1 = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "MR" });
    const dep1 = await makeUser({ username: "dep1", roleCode: "R-DEP", hotelCode: "MR" });
    // Assigned to another hotel but also entitled to MR through UserHotel: still a recipient.
    const kat2 = await makeUser({
      username: "kat2",
      roleCode: "R-KAT",
      hotelCode: "MRD",
      extraHotelCodes: ["MR"],
    });
    await makeUser({ username: "katPasif", roleCode: "R-KAT", hotelCode: "MR", isActive: false });
    await makeUser({ username: "katBaska", roleCode: "R-KAT", hotelCode: "MRD" });
    await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "MR" }); // other role

    const count = await notify({
      ...input,
      recipients: { hotelId: mr, roleCodes: ["R-KAT", "R-DEP"] },
    });

    expect(count).toBe(3);
    const rows = await testDb.notification.findMany();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.userId).sort()).toEqual([kat1.id, dep1.id, kat2.id].sort());
    expect(rows[0]).toMatchObject({
      hotelId: mr,
      type: "test.note",
      title: "Başlık",
      body: "Gövde",
      refType: "order",
      refId: "o1",
      isRead: false,
    });

    await sleep(300);
    expect(received).toHaveLength(1);
    expect(received[0].hotelId).toBe(mr);
    expect([...(received[0].userIds ?? [])].sort()).toEqual([kat1.id, dep1.id, kat2.id].sort());
    expect(received[0].payload).toMatchObject({
      type: "test.note",
      title: "Başlık",
      refType: "order",
    });
  });

  it("açık kimlik listesi: 2 satır (tekrarlar tekilleştirilir) ve olay yalnız onlara gider", async () => {
    const a = await makeUser({ username: "a1", roleCode: "R-GAR", hotelCode: "MR" });
    const b = await makeUser({ username: "b1", roleCode: "R-GAR", hotelCode: "MR" });

    const count = await notify({ ...input, recipients: [a.id, b.id, a.id] });

    expect(count).toBe(2);
    const rows = await testDb.notification.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.hotelId === null)).toBe(true);
    await sleep(300);
    expect(received).toHaveLength(1);
    expect([...(received[0].userIds ?? [])].sort()).toEqual([a.id, b.id].sort());
  });

  it("alıcı yoksa 0 döner, satır yazılmaz, olay yayılmaz", async () => {
    expect(await notify({ ...input, recipients: [] })).toBe(0);
    expect(
      await notify({
        ...input,
        recipients: { hotelId: await hotelId("MR"), roleCodes: ["R-KAT"] },
      }),
    ).toBe(0);
    await sleep(300);
    expect(await testDb.notification.count()).toBe(0);
    expect(received).toHaveLength(0);
  });

  it("tx verilirse satırlar ve olay transaction'la birlikte geri alınır", async () => {
    const a = await makeUser({ username: "tx1", roleCode: "R-GAR", hotelCode: "MR" });
    await expect(
      testDb.$transaction(async (tx) => {
        expect(await notify({ ...input, recipients: [a.id] }, tx)).toBe(1);
        throw new Error("geri al");
      }),
    ).rejects.toThrow("geri al");
    await sleep(300);
    expect(await testDb.notification.count()).toBe(0);
    expect(received).toHaveLength(0);
  });
});
