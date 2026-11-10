import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeritEvent } from "@/lib/realtime-events";
import { testDb } from "../helpers/db";
import {
  addMember,
  ctxFor,
  dropReferenceData,
  hotelId,
  makeOutlet,
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
const { listMyNotifications, markAllRead, markNotificationRead, notify } = await import(
  "@/modules/core/server/notifications"
);

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
    const mr = await hotelId("ROYAL");
    const kat1 = await makeUser({ username: "kat1", roleCode: "R-KAT", hotelCode: "ROYAL" });
    const dep1 = await makeUser({ username: "dep1", roleCode: "R-DEP", hotelCode: "ROYAL" });
    // Assigned to another hotel but also entitled to MR through UserHotel: still a recipient.
    const kat2 = await makeUser({
      username: "kat2",
      roleCode: "R-KAT",
      hotelCode: "DIAMOND",
      extraHotelCodes: ["ROYAL"],
    });
    await makeUser({ username: "katPasif", roleCode: "R-KAT", hotelCode: "ROYAL", isActive: false });
    await makeUser({ username: "katBaska", roleCode: "R-KAT", hotelCode: "DIAMOND" });
    await makeUser({ username: "gar1", roleCode: "R-GAR", hotelCode: "ROYAL" }); // other role

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

  it("otel+rol alıcıları etkin rolü kullanır: üyelikle R-SGF olan garson alır, otelle bağı olmayan almaz", async () => {
    const mr = await hotelId("ROYAL");
    const sgf = await testDb.role.findUniqueOrThrow({ where: { code: "R-SGF" } });
    // Base role R-GAR, assigned to DIAMOND, but works an MR outlet as R-SGF.
    const waiter = await makeUser({ username: "gar.sef", roleCode: "R-GAR", hotelCode: "DIAMOND" });
    const outlet = await makeOutlet("ROYAL", "Havuz Bar", "BAR");
    await testDb.outletMember.create({
      data: { userId: waiter.id, outletId: outlet.id, roleId: sgf.id },
    });
    // Base role R-SGF on an MR outlet without override: entitled through the membership.
    const chief = await makeUser({ username: "sef.mrd", roleCode: "R-SGF", hotelCode: "DIAMOND" });
    await addMember(chief.id, outlet.id);
    // R-SGF with no link to MR at all, and an R-SGF whose MR membership is inactive.
    await makeUser({ username: "sef.baska", roleCode: "R-SGF", hotelCode: "DIAMOND" });
    const inactive = await makeUser({ username: "sef.pasif", roleCode: "R-SGF", hotelCode: "DIAMOND" });
    await addMember(inactive.id, outlet.id, false);
    // The override replaces the base role: an R-SGF demoted to R-GAR at the MR outlet is out.
    const gar = await testDb.role.findUniqueOrThrow({ where: { code: "R-GAR" } });
    const demoted = await makeUser({ username: "sef.dusuk", roleCode: "R-SGF", hotelCode: "DIAMOND" });
    await testDb.outletMember.create({
      data: { userId: demoted.id, outletId: outlet.id, roleId: gar.id },
    });

    const count = await notify({ ...input, recipients: { hotelId: mr, roleCodes: ["R-SGF"] } });

    expect(count).toBe(2);
    const rows = await testDb.notification.findMany();
    expect(rows.map((r) => r.userId).sort()).toEqual([waiter.id, chief.id].sort());
    expect(rows.every((r) => r.hotelId === mr)).toBe(true);
  });

  it("usersEntitledTo: SISTEM rolü her otel için temel rolüyle hak sahibidir", async () => {
    const { usersEntitledTo } = await import("@/modules/core/server/entitlements");
    const sys = await makeUser({ username: "sys9", roleCode: "R-SYS" });
    expect(await usersEntitledTo(await hotelId("PREMIUM"), ["R-SYS"])).toEqual([sys.id]);
    expect(await usersEntitledTo(await hotelId("PREMIUM"), [])).toEqual([]);
  });

  it("açık kimlik listesi: 2 satır (tekrarlar tekilleştirilir) ve olay yalnız onlara gider", async () => {
    const a = await makeUser({ username: "a1", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const b = await makeUser({ username: "b1", roleCode: "R-GAR", hotelCode: "ROYAL" });

    const count = await notify({ ...input, recipients: [a.id, b.id, a.id] });

    expect(count).toBe(2);
    const rows = await testDb.notification.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.hotelId === null)).toBe(true);
    await sleep(300);
    expect(received).toHaveLength(1);
    expect([...(received[0].userIds ?? [])].sort()).toEqual([a.id, b.id].sort());
  });

  it("fallbackHotelId verilince boş alıcı listesi otel yöneticisine / sistem yöneticisine düşer", async () => {
    const mr = await hotelId("ROYAL");
    const otm = await makeUser({ username: "otm1", roleCode: "R-OTM", hotelCode: "ROYAL" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const count = await notify({ ...input, recipients: [], fallbackHotelId: mr });
    expect(count).toBeGreaterThanOrEqual(1);
    const rows = await testDb.notification.findMany();
    expect(rows.map((r) => r.userId)).toContain(otm.id);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("alıcı yoksa 0 döner, satır yazılmaz, olay yayılmaz", async () => {
    expect(await notify({ ...input, recipients: [] })).toBe(0);
    expect(
      await notify({
        ...input,
        recipients: { hotelId: await hotelId("ROYAL"), roleCodes: ["R-KAT"] },
      }),
    ).toBe(0);
    await sleep(300);
    expect(await testDb.notification.count()).toBe(0);
    expect(received).toHaveLength(0);
  });

  it("250 alıcı: 100/100/50 kişilik 3 olaya bölünür, 250 satır yazılır", async () => {
    const role = await testDb.role.findUniqueOrThrow({ where: { code: "R-GAR" } });
    await testDb.user.createMany({
      data: Array.from({ length: 250 }, (_, i) => ({
        username: `bulk${i}`,
        passwordHash: "x",
        fullName: `Bulk ${i}`,
        roleId: role.id,
      })),
    });
    const ids = (await testDb.user.findMany({ select: { id: true } })).map((u) => u.id);
    expect(ids).toHaveLength(250);

    expect(await notify({ ...input, recipients: ids })).toBe(250);

    expect(await testDb.notification.count()).toBe(250);
    await sleep(500);
    expect(received.map((e) => e.userIds?.length).sort()).toEqual([100, 100, 50]);
    expect(received.every((e) => !e.payloadTruncated && e.payload !== undefined)).toBe(true);
    expect(received.flatMap((e) => e.userIds ?? []).sort()).toEqual([...ids].sort());
  });

  it("tx verilirse satırlar ve olay transaction'la birlikte geri alınır", async () => {
    const a = await makeUser({ username: "tx1", roleCode: "R-GAR", hotelCode: "ROYAL" });
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

describe("okuma API'si (yalnız çağıranın satırları)", () => {
  async function seedRows(userId: string, count: number, base = Date.parse("2026-10-31T10:00:00Z")) {
    for (let i = 0; i < count; i++) {
      await testDb.notification.create({
        data: {
          userId,
          type: "test.note",
          title: `N${i}`,
          body: "Gövde",
          createdAt: new Date(base + i * 60_000),
        },
      });
    }
  }

  it("listMyNotifications: yalnız kendi satırları, en yeni önce, limit uygulanır", async () => {
    const me = await makeUser({ username: "okur", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const other = await makeUser({ username: "baskasi", roleCode: "R-GAR", hotelCode: "ROYAL" });
    await seedRows(me.id, 25);
    await seedRows(other.id, 3);
    const ctx = await ctxFor(me, { hotelCode: "ROYAL" });

    const rows = await listMyNotifications(ctx);
    expect(rows).toHaveLength(20); // default limit
    expect(rows[0]).toMatchObject({ title: "N24", isRead: false, type: "test.note", body: "Gövde" });
    expect(rows[19].title).toBe("N5");
    expect(rows.every((r) => r.createdAt instanceof Date)).toBe(true);

    const three = await listMyNotifications(ctx, 3);
    expect(three.map((r) => r.title)).toEqual(["N24", "N23", "N22"]);
  });

  it("markNotificationRead: kendi satırı okundu olur (isRead + readAt)", async () => {
    const me = await makeUser({ username: "okur2", roleCode: "R-GAR", hotelCode: "ROYAL" });
    await seedRows(me.id, 1);
    const row = await testDb.notification.findFirstOrThrow({ where: { userId: me.id } });

    await markNotificationRead(await ctxFor(me, { hotelCode: "ROYAL" }), row.id);

    const after = await testDb.notification.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.isRead).toBe(true);
    expect(after.readAt).toBeInstanceOf(Date);
  });

  it("markNotificationRead: başkasının satırı → NOT_FOUND, değişiklik yok", async () => {
    const me = await makeUser({ username: "okur3", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const other = await makeUser({ username: "sahip", roleCode: "R-GAR", hotelCode: "ROYAL" });
    await seedRows(other.id, 1);
    const row = await testDb.notification.findFirstOrThrow({ where: { userId: other.id } });

    await expect(
      markNotificationRead(await ctxFor(me, { hotelCode: "ROYAL" }), row.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      markNotificationRead(await ctxFor(me, { hotelCode: "ROYAL" }), "olmayan-id"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const after = await testDb.notification.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.isRead).toBe(false);
    expect(after.readAt).toBeNull();
  });

  it("markAllRead: yalnız çağıranın okunmamışlarını işaretler, sayıyı döner", async () => {
    const me = await makeUser({ username: "okur4", roleCode: "R-GAR", hotelCode: "ROYAL" });
    const other = await makeUser({ username: "sahip2", roleCode: "R-GAR", hotelCode: "ROYAL" });
    await seedRows(me.id, 4);
    await seedRows(other.id, 2);
    const mine = await testDb.notification.findFirstOrThrow({ where: { userId: me.id } });
    await testDb.notification.update({ where: { id: mine.id }, data: { isRead: true, readAt: new Date() } });

    expect(await markAllRead(await ctxFor(me, { hotelCode: "ROYAL" }))).toBe(3);

    expect(await testDb.notification.count({ where: { userId: me.id, isRead: false } })).toBe(0);
    expect(await testDb.notification.count({ where: { userId: other.id, isRead: false } })).toBe(2);
  });
});
