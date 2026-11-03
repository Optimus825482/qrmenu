import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, truncate } from "../helpers/db";
import { ctxFor, dropReferenceData, hotelId, makeOutlet, makeUser, resetReferenceData, resetTestData } from "../helpers/fixtures";

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));

const { getRoutines, evaluateAuto } = await import("@/modules/core/server/routines");
const { setChecklistItem } = await import("@/modules/core/server/guidePrefs");
const { ROLE_ROUTINES } = await import("@/modules/core/screenGuide");
const { visibleScreens } = await import("@/lib/rbac");
const { screenForPath, guardScreenOf } = await import("@/modules/core/screenPaths");
const { SCREENS } = await import("@/modules/core/screens");

// 2026-11-03 10:00 in Nicosia (UTC+2).
const NOON = new Date("2026-11-03T08:00:00Z");
const DAY = "2026-11-03";
const DATE = new Date(`${DAY}T00:00:00.000Z`);

beforeAll(resetReferenceData);
beforeEach(async () => {
  await resetTestData();
  await truncate("audit_logs");
  await testDb.hotelModule.updateMany({ data: { enabled: true } });
  await testDb.roleScreenPermission.deleteMany({ where: { hotelId: { not: null } } });
  await testDb.roleModuleAccess.deleteMany({ where: { hotelId: { not: null } } });
  await testDb.order.deleteMany();
  await testDb.mybarRequest.deleteMany();
  await testDb.roomDnd.deleteMany();
  await testDb.dailyTask.deleteMany();
  await testDb.uploadTask.deleteMany();
  await testDb.occupancyUpload.deleteMany();
  await testDb.printer.deleteMany();
  await testDb.room.deleteMany();
  await testDb.floor.deleteMany();
});
afterAll(async () => {
  await truncate("audit_logs");
  await dropReferenceData();
  await testDb.$disconnect();
});

async function ctxOf(roleCode: string, name: string, outletId?: string) {
  const user = await makeUser({ username: name, roleCode, hotelCode: "ROYAL" });
  const ctx = await ctxFor(user, { hotelCode: "ROYAL" });
  if (outletId) ctx.session.outletId = outletId;
  return { user, ctx };
}

async function aRoom() {
  const hid = await hotelId("ROYAL");
  const floor = await testDb.floor.create({ data: { hotelId: hid, number: 1, name: "1. Kat" } });
  return testDb.room.create({ data: { hotelId: hid, floorId: floor.id, number: `R${randomUUID().slice(0, 5)}` } });
}

describe("evaluateAuto (gerçek test DB)", () => {
  it("queueEmpty: GONDERILDI sipariş varken false, onaylanınca true", async () => {
    const outlet = await makeOutlet("ROYAL", "Havuz", "BAR");
    const { ctx } = await ctxOf("R-KAS", "kasa1", outlet.id);
    expect(await evaluateAuto("queueEmpty", ctx, NOON)).toBe(true);
    const order = await testDb.order.create({
      data: {
        hotelId: await hotelId("ROYAL"), outletId: outlet.id, kind: "MASA", businessDate: DATE, orderNo: 1,
        status: "GONDERILDI", guestLanguage: "tr", idempotencyKey: randomUUID(), clientIp: "10.0.0.1",
      },
    });
    expect(await evaluateAuto("queueEmpty", ctx, NOON)).toBe(false);
    await testDb.order.update({ where: { id: order.id }, data: { status: "ONAYLANDI" } });
    expect(await evaluateAuto("queueEmpty", ctx, NOON)).toBe(true);
  });

  it("printerOk: 100 sn önceki sinyal false, 10 sn önceki true, durum OK değilse false", async () => {
    const outlet = await makeOutlet("ROYAL", "Havuz", "BAR");
    const { ctx } = await ctxOf("R-KAS", "kasa2", outlet.id);
    expect(await evaluateAuto("printerOk", ctx, NOON)).toBe(false); // no printer at all
    const printer = await testDb.printer.create({
      data: { hotelId: await hotelId("ROYAL"), name: "Fis", ip: "10.0.0.5", lastStatus: "OK", lastSeenAt: new Date(NOON.getTime() - 100_000) },
    });
    await testDb.outlet.update({ where: { id: outlet.id }, data: { printerId: printer.id } });
    expect(await evaluateAuto("printerOk", ctx, NOON)).toBe(false);
    await testDb.printer.update({ where: { id: printer.id }, data: { lastSeenAt: new Date(NOON.getTime() - 10_000) } });
    expect(await evaluateAuto("printerOk", ctx, NOON)).toBe(true);
    await testDb.printer.update({ where: { id: printer.id }, data: { lastStatus: "kağıt yok" } });
    expect(await evaluateAuto("printerOk", ctx, NOON)).toBe(false);
  });

  it("mybarAllSeen: görülmemiş talep varken false, görülünce true", async () => {
    const { ctx, user } = await ctxOf("R-KAT", "kat1");
    const room = await aRoom();
    expect(await evaluateAuto("mybarAllSeen", ctx, NOON)).toBe(true);
    const req = await testDb.mybarRequest.create({
      data: { hotelId: await hotelId("ROYAL"), roomId: room.id, businessDate: DATE, language: "tr", idempotencyKey: randomUUID(), clientIp: "127.0.0.1" },
    });
    expect(await evaluateAuto("mybarAllSeen", ctx, NOON)).toBe(false);
    await testDb.mybarRequest.update({ where: { id: req.id }, data: { seenAt: NOON, seenById: user.id } });
    expect(await evaluateAuto("mybarAllSeen", ctx, NOON)).toBe(true);
  });

  it("dndOpenZero: bugünkü AKTIF DND varken false, tamamlanınca true", async () => {
    const { ctx } = await ctxOf("R-KAT", "kat2");
    const room = await aRoom();
    const hid = await hotelId("ROYAL");
    expect(await evaluateAuto("dndOpenZero", ctx, NOON)).toBe(true);
    const dnd = await testDb.roomDnd.create({ data: { hotelId: hid, roomId: room.id, date: DATE, count: 1, status: "AKTIF" } });
    expect(await evaluateAuto("dndOpenZero", ctx, NOON)).toBe(false);
    await testDb.roomDnd.update({ where: { id: dnd.id }, data: { status: "TAMAMLANDI", count: 2 } });
    expect(await evaluateAuto("dndOpenZero", ctx, NOON)).toBe(true);
  });

  it("uploadsDone: 2/3 false, 3/3 true", async () => {
    const { ctx, user } = await ctxOf("R-DEP", "depo1");
    const hid = await hotelId("ROYAL");
    const kinds = ["IN_HOUSE", "ARRIVAL", "DEPARTURE"] as const;
    for (const [i, kind] of kinds.entries()) {
      const upload = await testDb.occupancyUpload.create({
        data: { hotelId: hid, code: `U-${randomUUID().slice(0, 8)}`, fileName: `${kind}.xlsx`, kind, status: "TAMAMLANDI", userId: user.id },
      });
      await testDb.uploadTask.create({ data: { hotelId: hid, date: DATE, kind, status: "TAMAMLANDI", uploadId: upload.id } });
      if (i === 1) expect(await evaluateAuto("uploadsDone", ctx, NOON)).toBe(false);
    }
    expect(await evaluateAuto("uploadsDone", ctx, NOON)).toBe(true);
  });

  it("tasksDone: bekleyen kalem varken false, hepsi tamam olunca true; görev yoksa false", async () => {
    const { ctx } = await ctxOf("R-KAT", "kat3");
    const room = await aRoom();
    const hid = await hotelId("ROYAL");
    expect(await evaluateAuto("tasksDone", ctx, NOON)).toBe(false);
    const task = await testDb.dailyTask.create({ data: { hotelId: hid, date: DATE, type: "INHOUSE_KONTROL" } });
    const item = await testDb.dailyTaskItem.create({ data: { taskId: task.id, roomId: room.id } });
    expect(await evaluateAuto("tasksDone", ctx, NOON)).toBe(false);
    await testDb.dailyTaskItem.update({ where: { id: item.id }, data: { status: "TAMAMLANDI" } });
    expect(await evaluateAuto("tasksDone", ctx, NOON)).toBe(true);
  });
});

describe("getRoutines", () => {
  it("elle işaretli madde bugün saklanır; gün değişince (Nicosia 00:01) sıfırlanır", async () => {
    const { ctx, user } = await ctxOf("R-KAT", "kat4");
    const before = await getRoutines(ctx, NOON);
    expect(before).toHaveLength(1);
    expect(before[0].items.find((i) => i.id === "gorevleri-ac")?.done).toBe(false);
    await setChecklistItem(user.id, DAY, "gorevleri-ac", true, DAY);
    const same = await getRoutines(ctx, NOON);
    expect(same[0].items.find((i) => i.id === "gorevleri-ac")?.done).toBe(true);
    expect(same[0].doneCount).toBeGreaterThanOrEqual(1);
    // 2026-11-04 00:01 Nicosia = 2026-11-03 22:01 UTC
    const next = await getRoutines(ctx, new Date("2026-11-03T22:01:00Z"));
    expect(next[0].day).toBe("2026-11-04");
    expect(next[0].items.find((i) => i.id === "gorevleri-ac")?.done).toBe(false);
    // 23:59 Nicosia is still the old day
    const late = await getRoutines(ctx, new Date("2026-11-03T21:59:00Z"));
    expect(late[0].items.find((i) => i.id === "gorevleri-ac")?.done).toBe(true);
  });

  it("yetkisiz ekrana bağlı madde listeden çıkar", async () => {
    const { ctx } = await ctxOf("R-KAT", "kat5");
    expect((await getRoutines(ctx, NOON))[0].items.map((i) => i.id)).toContain("dnd-ikinci");
    await testDb.roleScreenPermission.updateMany({
      where: { role: { code: "R-KAT" }, screen: { code: "MB-DND" }, hotelId: null },
      data: { canView: false },
    });
    expect((await getRoutines(ctx, NOON))[0].items.map((i) => i.id)).not.toContain("dnd-ikinci");
  });

  it("R-KAS iki rutin (açılış 06–14, kapanış 14–24) ve saate göre expanded", async () => {
    const outlet = await makeOutlet("ROYAL", "Havuz", "BAR");
    const { ctx } = await ctxOf("R-KAS", "kasa3", outlet.id);
    const morning = await getRoutines(ctx, NOON);
    expect(morning.map((r) => r.routine.id)).toEqual(["kasa-acilis", "kasa-kapanis"]);
    expect(morning.map((r) => r.expanded)).toEqual([true, false]);
    const evening = await getRoutines(ctx, new Date("2026-11-03T18:00:00Z")); // 20:00 Nicosia
    expect(evening.map((r) => r.expanded)).toEqual([false, true]);
    const kuyruk = evening[1].items.find((i) => i.id === "kuyruk-bos")!;
    expect(kuyruk).toMatchObject({ auto: true, kind: "queueEmpty", href: "/kasa" });
  });

  it("rutini olmayan rol boş liste alır", async () => {
    const { ctx } = await ctxOf("R-OTM", "mudur1");
    expect(await getRoutines(ctx, NOON)).toEqual([]);
  });

  it("rastgele ekran alt kümesinde hiçbir madde görünmeyen bir ekrana bağlanmaz", async () => {
    let seed = 20261103;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const roleCodes = [...new Set(ROLE_ROUTINES.map((r) => r.roleCode))];
    for (const roleCode of roleCodes) {
      const { ctx } = await ctxOf(roleCode, `prop-${roleCode}`);
      for (let round = 0; round < 6; round++) {
        await testDb.roleScreenPermission.updateMany({
          where: { role: { code: roleCode }, hotelId: null },
          data: { canView: true },
        });
        const dropped = SCREENS.filter(() => rand() < 0.35).map((s) => s.code);
        await testDb.roleScreenPermission.updateMany({
          where: { role: { code: roleCode }, screen: { code: { in: dropped } }, hotelId: null },
          data: { canView: false },
        });
        const visible = new Set(await visibleScreens(ctx));
        for (const routine of await getRoutines(ctx, NOON)) {
          for (const item of routine.items) {
            expect(visible.has(item.screen), `${roleCode} ${item.id}`).toBe(true);
            const owner = screenForPath(item.href);
            if (owner) expect(visible.has(owner.code), `${roleCode} ${item.id} ${item.href}`).toBe(true);
            const catalogue = SCREENS.find((s) => s.code === item.screen)!;
            expect(visible.has(guardScreenOf(catalogue))).toBe(true);
          }
        }
      }
    }
  });
});
