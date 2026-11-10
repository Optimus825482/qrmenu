import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businessDay } from "@/lib/time";
import { testDb } from "../helpers/db";
import { dropReferenceData, hotelId, resetReferenceData, resetTestData } from "../helpers/fixtures";
import { resetMinibarData, staff } from "../helpers/minibarFixtures";
import { buildP4001Xlsx, buildStandardXlsx } from "../helpers/xlsx";

// Runs before the (hoisted) imports so @/lib/env sees the temp uploads directory.
const uploadsDir = await vi.hoisted(async () => {
  const [{ mkdtempSync }, { tmpdir }, { join }] = await Promise.all([
    import("node:fs"),
    import("node:os"),
    import("node:path"),
  ]);
  const dir = mkdtempSync(join(tmpdir(), "merit-occupancy-"));
  process.env.UPLOADS_DIR = dir;
  return dir;
});

vi.mock("@/lib/prisma", async () => ({ prisma: (await import("../helpers/db")).testDb }));
vi.mock("@/lib/realtime", () => ({ publish: vi.fn() }));

const svc = await import("@/modules/minibar/server/occupancyUpload");
const jobs = await import("@/modules/minibar/server/uploadTasks");

beforeAll(resetReferenceData);
beforeEach(async () => {
  fs.rmSync(path.join(uploadsDir, "occupancy"), { recursive: true, force: true });
  await resetMinibarData();
  await resetTestData();
  svc.setDailyTaskReconciler(null);
});
afterAll(async () => {
  await dropReferenceData();
  await testDb.$disconnect();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

// 2026-11-03 10:00 Nicosia (UTC+2 in winter)
const NOW = new Date("2026-11-03T08:00:00.000Z");
const TODAY = "2026-11-03";
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

/** A floor with rooms `numbers` in `hotelCode`. */
async function rooms(hotelCode: string, numbers: string[]) {
  const hid = await hotelId(hotelCode);
  const floor = await testDb.floor.create({ data: { hotelId: hid, number: Math.floor(Math.random() * 900_000) + 1, name: "Kat" } });
  const out: Record<string, string> = {};
  for (const number of numbers) {
    out[number] = (await testDb.room.create({ data: { hotelId: hid, floorId: floor.id, number } })).id;
  }
  return { hid, ids: out };
}

const HEADERS = ["Room no", "Arrival", "Departure", "Adult", "Arr.Time", "Dep.Time"];
const stdFile = (rows: (string | number | Date | null)[][], headers = HEADERS) => buildStandardXlsx(rows, headers);
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return (e as { code?: string }).code ?? "ERR";
  }
};

async function world() {
  const royal = await rooms("ROYAL", ["101", "102", "103", "104"]);
  const diamond = await rooms("DIAMOND", ["301"]);
  const dep = await staff("R-DEP", "ROYAL");
  return { royal, diamond, dep };
}

describe("doluluk yükleme: kayıt ve hatalar", () => {
  it("3 geçerli + 2 hatalı satır: kayıtlar yazılır, hatalar satır numarasıyla", async () => {
    const { royal, dep } = await world();
    const data = await stdFile([
      ["101", d("2026-11-01"), d("2026-11-06"), 2, null, null],
      ["102", d("2026-11-02"), d("2026-11-07"), 1, null, null],
      ["103", d("2026-11-01"), d("2026-11-09"), 3, null, null],
      ["104", "bozuk", d("2026-11-09"), 2, null, null],
      ["999", d("2026-11-01"), d("2026-11-09"), 2, null, null],
    ]);
    const res = await svc.commitOccupancy(dep.ctx, { fileName: "ih.xlsx", data, kind: "IN_HOUSE" }, NOW);
    expect(res).toMatchObject({ totalRows: 5, okRows: 3, errorRows: 2, tasksGenerated: false });
    expect(res.errors).toEqual([
      { row: 5, message: "Geçersiz giriş tarihi" },
      { row: 6, message: "Oda '999' sistemde bulunamadı" },
    ]);
    expect(await testDb.guestRecord.count({ where: { hotelId: royal.hid } })).toBe(3);
    const upload = await testDb.occupancyUpload.findUniqueOrThrow({ where: { id: res.uploadId } });
    expect(upload).toMatchObject({ status: "TAMAMLANDI", kind: "IN_HOUSE", okRows: 3, errorRows: 2 });
    expect(upload.code).toMatch(/^DOL-20261103-\d{6}-[0-9A-F]{8}$/);
    expect(upload.storedPath).toBe(`occupancy/${royal.hid}/${upload.code}.xlsx`);
    expect(fs.existsSync(path.join(uploadsDir, upload.storedPath as string))).toBe(true);
    expect(await testDb.auditLog.count({ where: { action: "OCCUPANCY_UPLOAD", entityId: upload.id } })).toBe(1);
  });

  it("başka otelin oda numarası bulunamaz ve oda oluşturulmaz", async () => {
    const { diamond, dep } = await world();
    const before = await testDb.room.count();
    const data = await stdFile([["301", d("2026-11-01"), d("2026-11-06"), 2, null, null]]);
    const res = await svc.commitOccupancy(dep.ctx, { fileName: "ih.xlsx", data, kind: "IN_HOUSE" }, NOW);
    expect(res).toMatchObject({ okRows: 0, errorRows: 1 });
    expect(res.errors).toEqual([{ row: 2, message: "Oda '301' sistemde bulunamadı" }]);
    expect(await testDb.room.count()).toBe(before);
    expect(await testDb.guestRecord.count({ where: { hotelId: diamond.hid } })).toBe(0);
    expect((await testDb.occupancyUpload.findUniqueOrThrow({ where: { id: res.uploadId } })).status).toBe("HATA");
    // hiç satır kaydedilmediyse UploadTask tamamlanmaz
    expect(await testDb.uploadTask.count()).toBe(0);
  });

  it("önizleme hiçbir şey yazmaz", async () => {
    const { dep } = await world();
    const data = await stdFile(
      [
        ["101", d("2026-11-01"), d("2026-11-06"), 2],
        ["301", d("2026-11-01"), d("2026-11-06"), 2],
        ["101", d("2026-11-02"), d("2026-11-08"), 2],
      ],
      ["Room no", "Arrival", "Departure", "Adult"],
    );
    const view = await svc.previewOccupancy(dep.ctx, { fileName: "ih.xlsx", data }, NOW);
    expect(view).toMatchObject({ format: "STANDARD", detectedKind: "IN_HOUSE", totalRows: 3, okRows: 2, errorRows: 1, unknownRooms: ["301"] });
    expect(view.errors).toEqual([{ row: 3, message: "Oda '301' sistemde bulunamadı" }]);
    expect(view.warnings[0]).toContain("Oda '101'");
    expect(view.sample).toHaveLength(2);
    expect(await testDb.guestRecord.count()).toBe(0);
    expect(await testDb.occupancyUpload.count()).toBe(0);
    expect(await testDb.uploadTask.count()).toBe(0);
    expect(await testDb.auditLog.count({ where: { action: "OCCUPANCY_UPLOAD" } })).toBe(0);
    expect(fs.existsSync(path.join(uploadsDir, "occupancy"))).toBe(false);
  });

  it("P4001 önizleme: otel adı uyuşmazlığı uyarı", async () => {
    const { dep } = await world();
    const data = await buildP4001Xlsx({
      reportLine: "Date: 3.11.2026",
      hotelName: "MERIT ROYAL DIAMOND",
      rows: [["A", "101", "STD", "1.11.", "6.11.", 2]],
    });
    const view = await svc.previewOccupancy(dep.ctx, { fileName: "p4001.xlsx", data }, NOW);
    expect(view.format).toBe("P4001");
    expect(view.hotelMatch).toEqual({ label: "MERIT ROYAL DIAMOND", matches: false });
    expect(view.warnings[0]).toContain("uyuşmuyor");
    const royalFile = await buildP4001Xlsx({ reportLine: "Date: 3.11.2026", hotelName: "MERIT ROYAL", rows: [["A", "101", "STD", "1.11.", "6.11.", 2]] });
    expect((await svc.previewOccupancy(dep.ctx, { fileName: "p.xlsx", data: royalFile }, NOW)).hotelMatch?.matches).toBe(true);
  });
});

describe("doluluk yükleme: yinelenen kural (upsert)", () => {
  it("aynı dosya iki kez yüklenince kayıt sayısı artmaz, kayıtlar son yüklemeye bağlanır", async () => {
    const { royal, dep } = await world();
    const data = await stdFile([
      ["101", d("2026-11-01"), d("2026-11-06"), 2, null, null],
      ["102", d("2026-11-02"), d("2026-11-07"), 1, null, null],
    ]);
    const first = await svc.commitOccupancy(dep.ctx, { fileName: "ih.xlsx", data, kind: "IN_HOUSE" }, NOW);
    const second = await svc.commitOccupancy(dep.ctx, { fileName: "ih.xlsx", data, kind: "IN_HOUSE" }, new Date(NOW.getTime() + 60_000));
    expect(second).toMatchObject({ okRows: 2, createdRows: 0, updatedRows: 2 });
    expect(first.createdRows).toBe(2);
    expect(await testDb.guestRecord.count({ where: { hotelId: royal.hid } })).toBe(2);
    expect(await testDb.guestRecord.count({ where: { uploadId: second.uploadId } })).toBe(2);
    expect(await testDb.guestRecord.count({ where: { uploadId: first.uploadId } })).toBe(0);
    expect(await testDb.guestRecord.count({ where: { batchCode: second.code } })).toBe(2);
  });

  it("çakışan tarihli farklı dosya mevcut kaydı günceller, saat verilmediyse eski saat kalır", async () => {
    const { royal, dep } = await world();
    await svc.commitOccupancy(
      dep.ctx,
      { fileName: "a.xlsx", kind: "ARRIVAL", data: await stdFile([["101", d(TODAY), d("2026-11-06"), 2, "14:00", null]]) },
      NOW,
    );
    const res = await svc.commitOccupancy(
      dep.ctx,
      { fileName: "b.xlsx", kind: "ARRIVAL", data: await stdFile([["101", d(TODAY), d("2026-11-08"), 3, null, null]]) },
      NOW,
    );
    expect(res).toMatchObject({ createdRows: 0, updatedRows: 1 });
    const rec = await testDb.guestRecord.findMany({ where: { hotelId: royal.hid } });
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ guestCount: 3, arrivalTime: "14:00", uploadId: res.uploadId });
    expect(rec[0].departureDate.toISOString().slice(0, 10)).toBe("2026-11-08");
    // verilen saat eskisinin üzerine yazar
    await svc.commitOccupancy(
      dep.ctx,
      { fileName: "c.xlsx", kind: "ARRIVAL", data: await stdFile([["101", d(TODAY), d("2026-11-08"), 3, "16:30", null]]) },
      NOW,
    );
    expect((await testDb.guestRecord.findFirstOrThrow({ where: { hotelId: royal.hid } })).arrivalTime).toBe("16:30");
  });

  it("çakışmayan tarih ve farklı tür yeni kayıt ekler; dosya içinde çakışan satırlar tek kayıt olur", async () => {
    const { royal, dep } = await world();
    await svc.commitOccupancy(
      dep.ctx,
      { fileName: "a.xlsx", kind: "IN_HOUSE", data: await stdFile([["101", d("2026-11-01"), d("2026-11-03"), 2, null, null]]) },
      NOW,
    );
    await svc.commitOccupancy(
      dep.ctx,
      { fileName: "b.xlsx", kind: "IN_HOUSE", data: await stdFile([["101", d("2026-11-10"), d("2026-11-12"), 2, null, null]]) },
      NOW,
    );
    await svc.commitOccupancy(
      dep.ctx,
      { fileName: "c.xlsx", kind: "ARRIVAL", data: await stdFile([["101", d("2026-11-01"), d("2026-11-03"), 2, null, null]]) },
      NOW,
    );
    expect(await testDb.guestRecord.count({ where: { hotelId: royal.hid } })).toBe(3);
    await svc.commitOccupancy(
      dep.ctx,
      {
        fileName: "d.xlsx",
        kind: "DEPARTURE",
        data: await stdFile([
          ["102", d("2026-11-01"), d("2026-11-03"), 1, null, null],
          ["102", d("2026-11-02"), d("2026-11-03"), 2, null, null],
        ]),
      },
      NOW,
    );
    expect(await testDb.guestRecord.count({ where: { roomId: royal.ids["102"] } })).toBe(1);
  });

  it("eşzamanlı iki yükleme (farklı tür): kopyasız kayıt ve UploadTask", async () => {
    const { royal, dep } = await world();
    const a = await stdFile([["101", d("2026-11-01"), d("2026-11-06"), 2, null, null]]);
    const b = await stdFile([["101", d("2026-10-30"), d(TODAY), 2, null, "11:00"]]);
    await Promise.all([
      svc.commitOccupancy(dep.ctx, { fileName: "a.xlsx", kind: "IN_HOUSE", data: a }, NOW),
      svc.commitOccupancy(dep.ctx, { fileName: "b.xlsx", kind: "DEPARTURE", data: b }, NOW),
      svc.commitOccupancy(dep.ctx, { fileName: "a2.xlsx", kind: "IN_HOUSE", data: a }, NOW),
    ]);
    expect(await testDb.guestRecord.count({ where: { hotelId: royal.hid, kind: "IN_HOUSE" } })).toBe(1);
    expect(await testDb.guestRecord.count({ where: { hotelId: royal.hid, kind: "DEPARTURE" } })).toBe(1);
    expect(await testDb.uploadTask.count({ where: { hotelId: royal.hid, status: "TAMAMLANDI" } })).toBe(2);
  });
});

describe("doluluk yükleme: UploadTask ve görev uzlaştırma kancası", () => {
  it("UploadTask TAMAMLANDI + uploadId; üç tür tamamlanınca uzlaştırma (geç yükleme dahil)", async () => {
    const { royal, dep } = await world();
    const reconcile = vi.fn(async () => ({ created: 3, added: 0, removed: 0, updated: 0 }));
    svc.setDailyTaskReconciler(reconcile);

    const inHouse = await svc.commitOccupancy(
      dep.ctx,
      { fileName: "ih.xlsx", kind: "IN_HOUSE", data: await stdFile([["101", d("2026-11-01"), d("2026-11-06"), 2, null, null]]) },
      NOW,
    );
    const task = await testDb.uploadTask.findFirstOrThrow({ where: { hotelId: royal.hid, kind: "IN_HOUSE" } });
    expect(task).toMatchObject({ status: "TAMAMLANDI", uploadId: inHouse.uploadId });
    expect(task.date.toISOString().slice(0, 10)).toBe(TODAY);

    const arrival = await svc.commitOccupancy(
      dep.ctx,
      { fileName: "ar.xlsx", kind: "ARRIVAL", data: await stdFile([["102", d(TODAY), d("2026-11-06"), 2, "14:00", null]]) },
      NOW,
    );
    expect(arrival.tasksGenerated).toBe(false);
    expect(reconcile).not.toHaveBeenCalled();

    const departure = await svc.commitOccupancy(
      dep.ctx,
      { fileName: "dp.xlsx", kind: "DEPARTURE", data: await stdFile([["103", d("2026-11-01"), d(TODAY), 2, null, "11:00"]]) },
      NOW,
    );
    expect(departure.tasksGenerated).toBe(true);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith(royal.hid, TODAY, { actorId: dep.userId }, NOW);

    // geç yükleme: düzeltilmiş departure dosyası uzlaştırmayı yeniden çalıştırır
    const late = await svc.commitOccupancy(
      dep.ctx,
      { fileName: "dp2.xlsx", kind: "DEPARTURE", data: await stdFile([["104", d("2026-11-01"), d(TODAY), 2, null, "12:00"]]) },
      NOW,
    );
    expect(late.tasksGenerated).toBe(true);
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(await testDb.uploadTask.count({ where: { hotelId: royal.hid } })).toBe(3);
  });

  it("uzlaştırma hatası yüklemeyi bozmaz", async () => {
    const { royal, dep } = await world();
    svc.setDailyTaskReconciler(async () => {
      throw new Error("boom");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const [kind, row] of [
      ["IN_HOUSE", ["101", d("2026-11-01"), d("2026-11-06"), 2, null, null]],
      ["ARRIVAL", ["102", d(TODAY), d("2026-11-06"), 2, null, null]],
      ["DEPARTURE", ["103", d("2026-11-01"), d(TODAY), 2, null, null]],
    ] as const) {
      const res = await svc.commitOccupancy(dep.ctx, { fileName: "x.xlsx", kind, data: await stdFile([[...row]]) }, NOW);
      expect(res.okRows).toBe(1);
      expect(res.tasksGenerated).toBe(false);
    }
    errorSpy.mockRestore();
    expect(await testDb.guestRecord.count({ where: { hotelId: royal.hid } })).toBe(3);
  });
});

describe("doluluk yükleme: silme", () => {
  it("bekleyen kalemler gider, tamamlanan kalır, UploadTask BEKLIYOR olur, dosya silinir", async () => {
    const { royal, dep } = await world();
    const res = await svc.commitOccupancy(
      dep.ctx,
      {
        fileName: "dp.xlsx",
        kind: "DEPARTURE",
        data: await stdFile([
          ["101", d("2026-11-01"), d(TODAY), 2, null, "11:00"],
          ["102", d("2026-11-01"), d(TODAY), 2, null, "12:00"],
          ["103", d("2026-11-01"), d(TODAY), 2, null, "13:00"],
        ]),
      },
      NOW,
    );
    const upload = await testDb.occupancyUpload.findUniqueOrThrow({ where: { id: res.uploadId } });
    const file = path.join(uploadsDir, upload.storedPath as string);
    expect(fs.existsSync(file)).toBe(true);

    const records = await testDb.guestRecord.findMany({ where: { uploadId: res.uploadId } });
    const rec = (room: string) => records.find((r) => r.roomId === royal.ids[room])!.id;
    const date = businessDay(TODAY);
    const departureTask = await testDb.dailyTask.create({ data: { hotelId: royal.hid, date, type: "DEPARTURE_KONTROL" } });
    const otherTask = await testDb.dailyTask.create({ data: { hotelId: royal.hid, date, type: "INHOUSE_KONTROL" } });
    const pending = await testDb.dailyTaskItem.create({ data: { taskId: departureTask.id, roomId: royal.ids["101"], guestRecordId: rec("101"), status: "BEKLIYOR" } });
    const done = await testDb.dailyTaskItem.create({ data: { taskId: departureTask.id, roomId: royal.ids["102"], guestRecordId: rec("102"), status: "TAMAMLANDI" } });
    const dnd = await testDb.dailyTaskItem.create({ data: { taskId: departureTask.id, roomId: royal.ids["103"], guestRecordId: rec("103"), status: "DND_BEKLIYOR" } });
    const lonely = await testDb.dailyTaskItem.create({ data: { taskId: otherTask.id, roomId: royal.ids["104"], guestRecordId: rec("101"), status: "BEKLIYOR" } });

    const out = await svc.deleteUpload(dep.ctx, res.uploadId, NOW);
    expect(out).toEqual({ keptCompletedItems: 2 });

    expect(await testDb.guestRecord.count({ where: { hotelId: royal.hid } })).toBe(0);
    expect(await testDb.dailyTaskItem.findUnique({ where: { id: pending.id } })).toBeNull();
    expect(await testDb.dailyTaskItem.findUnique({ where: { id: lonely.id } })).toBeNull();
    expect(await testDb.dailyTask.findUnique({ where: { id: otherTask.id } })).toBeNull(); // boşalan görev
    expect(await testDb.dailyTask.findUnique({ where: { id: departureTask.id } })).not.toBeNull();
    expect((await testDb.dailyTaskItem.findUniqueOrThrow({ where: { id: done.id } })).guestRecordId).toBeNull();
    expect((await testDb.dailyTaskItem.findUniqueOrThrow({ where: { id: dnd.id } })).status).toBe("DND_BEKLIYOR");
    expect((await testDb.dailyTaskItem.findUniqueOrThrow({ where: { id: dnd.id } })).guestRecordId).toBeNull();

    const task = await testDb.uploadTask.findFirstOrThrow({ where: { hotelId: royal.hid, kind: "DEPARTURE" } });
    expect(task).toMatchObject({ status: "BEKLIYOR", uploadId: null });
    expect(await testDb.occupancyUpload.findUniqueOrThrow({ where: { id: res.uploadId } })).toMatchObject({ status: "SILINDI", storedPath: null });
    expect(fs.existsSync(file)).toBe(false);
    expect(await testDb.auditLog.count({ where: { action: "OCCUPANCY_UPLOAD_DELETE", entityId: res.uploadId } })).toBe(1);

    expect(await codeOf(svc.deleteUpload(dep.ctx, res.uploadId, NOW))).toBe("CONFLICT");
  });

  it("eşzamanlı çift silme: biri OK, diğeri CONFLICT", async () => {
    const { royal, dep } = await world();
    const res = await svc.commitOccupancy(
      dep.ctx,
      { fileName: "ih.xlsx", kind: "IN_HOUSE", data: await stdFile([["101", d("2026-11-01"), d("2026-11-06"), 2, null, null]]) },
      NOW,
    );
    const out = await Promise.all([
      codeOf(svc.deleteUpload(dep.ctx, res.uploadId, NOW)),
      codeOf(svc.deleteUpload(dep.ctx, res.uploadId, NOW)),
    ]);
    expect([...out].sort()).toEqual(["CONFLICT", "OK"]);
    expect(await testDb.auditLog.count({ where: { action: "OCCUPANCY_UPLOAD_DELETE", entityId: res.uploadId } })).toBe(1);
    expect(await testDb.guestRecord.count({ where: { hotelId: royal.hid } })).toBe(0);
  });

  it("silme sonrası kalan görevler için uzlaştırma çalışır", async () => {
    const { royal, dep } = await world();
    const reconcile = vi.fn(async () => ({ created: 0, added: 0, removed: 0, updated: 0 }));
    svc.setDailyTaskReconciler(reconcile);
    const res = await svc.commitOccupancy(
      dep.ctx,
      { fileName: "ih.xlsx", kind: "IN_HOUSE", data: await stdFile([["101", d("2026-11-01"), d("2026-11-06"), 2, null, null]]) },
      NOW,
    );
    await svc.deleteUpload(dep.ctx, res.uploadId, NOW);
    expect(reconcile).toHaveBeenCalledWith(royal.hid, TODAY, { actorId: dep.userId }, NOW);
  });
});

describe("doluluk yükleme: geri alma, değiştirme ve uyuşmazlık (DEP-1/5/6)", () => {
  it("DEP-1: yalnız güncellenen eski kayıt silinmez, önceki haline döner; yeni kayıt silinir", async () => {
    const { royal, dep } = await world();
    const first = await svc.commitOccupancy(
      dep.ctx,
      {
        fileName: "a.xlsx",
        kind: "IN_HOUSE",
        data: await stdFile([
          ["101", d("2026-11-01"), d("2026-11-06"), 2, "14:00", null],
          ["102", d("2026-11-02"), d("2026-11-07"), 1, null, null],
        ]),
      },
      NOW,
    );
    const later = new Date(NOW.getTime() + 60_000);
    const second = await svc.commitOccupancy(
      dep.ctx,
      {
        fileName: "b.xlsx",
        kind: "IN_HOUSE",
        data: await stdFile([
          ["101", d("2026-11-01"), d("2026-11-08"), 3, null, null],
          ["102", d("2026-11-02"), d("2026-11-07"), 1, null, null],
          ["103", d("2026-11-02"), d("2026-11-05"), 2, null, null],
        ]),
      },
      later,
    );
    expect(second).toMatchObject({ createdRows: 1, updatedRows: 2, removedRows: 0 });

    await svc.deleteUpload(dep.ctx, second.uploadId, later);
    const recs = await testDb.guestRecord.findMany({ where: { hotelId: royal.hid }, orderBy: { roomId: "asc" } });
    expect(recs).toHaveLength(2);
    const r101 = recs.find((r) => r.roomId === royal.ids["101"])!;
    expect(r101).toMatchObject({ uploadId: first.uploadId, batchCode: first.code, guestCount: 2, arrivalTime: "14:00" });
    expect(r101.departureDate.toISOString().slice(0, 10)).toBe("2026-11-06");
    expect(recs.every((r) => r.uploadId === first.uploadId)).toBe(true);
    expect(await testDb.guestRecord.count({ where: { roomId: royal.ids["103"] } })).toBe(0);
  });

  it("DEP-6: temiz dosyada olmayan aynı gün kaydı kaldırılır, önizleme sayıları doğru; silinince geri gelir", async () => {
    const { royal, dep } = await world();
    const first = await svc.commitOccupancy(
      dep.ctx,
      {
        fileName: "a.xlsx",
        kind: "ARRIVAL",
        data: await stdFile([
          ["101", d(TODAY), d("2026-11-06"), 2, "14:00", null],
          ["102", d(TODAY), d("2026-11-07"), 1, null, null],
        ]),
      },
      NOW,
    );
    const next = await stdFile([
      ["101", d(TODAY), d("2026-11-06"), 2, "15:00", null],
      ["104", d(TODAY), d("2026-11-05"), 2, null, null],
    ]);
    const view = await svc.previewOccupancy(dep.ctx, { fileName: "b.xlsx", data: next, kind: "ARRIVAL" }, NOW);
    expect(view.changes).toEqual({ create: 1, update: 1, remove: 1 });
    expect(view.blockers).toEqual([]);

    const second = await svc.commitOccupancy(dep.ctx, { fileName: "b.xlsx", data: next, kind: "ARRIVAL" }, NOW);
    expect(second).toMatchObject({ createdRows: 1, updatedRows: 1, removedRows: 1 });
    expect(await testDb.guestRecord.count({ where: { roomId: royal.ids["102"] } })).toBe(0);

    await svc.deleteUpload(dep.ctx, second.uploadId, NOW);
    const back = await testDb.guestRecord.findMany({ where: { hotelId: royal.hid } });
    expect(back.map((r) => r.roomId).sort()).toEqual([royal.ids["101"], royal.ids["102"]].sort());
    expect(back.every((r) => r.uploadId === first.uploadId)).toBe(true);
    expect(back.find((r) => r.roomId === royal.ids["101"])!.arrivalTime).toBe("14:00");
  });

  it("DEP-6: hatalı satırı olan dosya eski kayıtları kaldırmaz (uyarı verir)", async () => {
    const { royal, dep } = await world();
    await svc.commitOccupancy(
      dep.ctx,
      { fileName: "a.xlsx", kind: "ARRIVAL", data: await stdFile([["102", d(TODAY), d("2026-11-07"), 1, null, null]]) },
      NOW,
    );
    const data = await stdFile([
      ["101", d(TODAY), d("2026-11-06"), 2, null, null],
      ["999", d(TODAY), d("2026-11-06"), 2, null, null],
    ]);
    const view = await svc.previewOccupancy(dep.ctx, { fileName: "b.xlsx", data, kind: "ARRIVAL" }, NOW);
    expect(view.changes.remove).toBe(0);
    expect(view.warnings.join(" ")).toContain("silinmeyecek");
    const res = await svc.commitOccupancy(dep.ctx, { fileName: "b.xlsx", data, kind: "ARRIVAL" }, NOW);
    expect(res.removedRows).toBe(0);
    expect(await testDb.guestRecord.count({ where: { roomId: royal.ids["102"] } })).toBe(1);
  });

  it("DEP-5: P4001 otel adı ya da rapor tarihi uyuşmazsa yükleme reddedilir, hiçbir şey yazılmaz", async () => {
    const { dep } = await world();
    const wrongHotel = await buildP4001Xlsx({
      reportLine: "Date: 3.11.2026",
      hotelName: "MERIT ROYAL DIAMOND",
      rows: [["A", "101", "STD", "1.11.", "6.11.", 2]],
    });
    const view = await svc.previewOccupancy(dep.ctx, { fileName: "p.xlsx", data: wrongHotel }, NOW);
    expect(view.blockers[0]).toContain("otel adı");
    expect(await codeOf(svc.commitOccupancy(dep.ctx, { fileName: "p.xlsx", data: wrongHotel }, NOW))).toBe("VALIDATION");

    const wrongDay = await buildP4001Xlsx({
      reportLine: "Date: 2.11.2026",
      hotelName: "MERIT ROYAL",
      rows: [["A", "101", "STD", "1.11.", "6.11.", 2]],
    });
    expect((await svc.previewOccupancy(dep.ctx, { fileName: "p.xlsx", data: wrongDay }, NOW)).blockers[0]).toContain("rapor tarihi");
    expect(await codeOf(svc.commitOccupancy(dep.ctx, { fileName: "p.xlsx", data: wrongDay }, NOW))).toBe("VALIDATION");

    expect(await testDb.occupancyUpload.count()).toBe(0);
    expect(await testDb.guestRecord.count()).toBe(0);
    expect(fs.existsSync(path.join(uploadsDir, "occupancy"))).toBe(false);

    const ok = await buildP4001Xlsx({ reportLine: "Date: 3.11.2026", hotelName: "MERIT ROYAL", rows: [["A", "101", "STD", "1.11.", "6.11.", 2]] });
    expect((await svc.commitOccupancy(dep.ctx, { fileName: "p.xlsx", data: ok }, NOW)).okRows).toBe(1);
  });
});

describe("doluluk yükleme: yetki ve kapsam", () => {
  it("kind verilmemişse de yetki parse'dan önce denetlenir (bozuk dosya + yetkisiz = FORBIDDEN)", async () => {
    await world();
    const kat = await staff("R-KAT", "ROYAL");
    const garbage = Buffer.from("bu bir xlsx degil");
    expect(await codeOf(svc.commitOccupancy(kat.ctx, { fileName: "x.xlsx", data: garbage }, NOW))).toBe("FORBIDDEN");
    const dep = await staff("R-DEP", "ROYAL");
    expect(await codeOf(svc.commitOccupancy(dep.ctx, { fileName: "x.xlsx", data: garbage }, NOW))).toBe("VALIDATION");
  });

  it("kind verilmemişse dosyadan algılanan tür kullanılır", async () => {
    const { dep } = await world();
    const data = await stdFile([["101", d("2026-11-01"), d(TODAY), 2, null, "11:00"]]);
    const res = await svc.commitOccupancy(dep.ctx, { fileName: "dp.xlsx", data }, NOW);
    expect((await testDb.occupancyUpload.findUniqueOrThrow({ where: { id: res.uploadId } })).kind).toBe("DEPARTURE");
  });

  it("R-KAT ve R-HKS yükleyemez/silemez; başka otelin yüklemesi bulunamaz", async () => {
    const { diamond, dep } = await world();
    const data = await stdFile([["101", d("2026-11-01"), d("2026-11-06"), 2, null, null]]);
    const kat = await staff("R-KAT", "ROYAL");
    const hks = await staff("R-HKS", "ROYAL");
    for (const who of [kat, hks]) {
      expect(await codeOf(svc.previewOccupancy(who.ctx, { fileName: "x.xlsx", data }, NOW))).toBe("FORBIDDEN");
      expect(await codeOf(svc.commitOccupancy(who.ctx, { fileName: "x.xlsx", data, kind: "IN_HOUSE" }, NOW))).toBe("FORBIDDEN");
    }
    const ok = await svc.commitOccupancy(dep.ctx, { fileName: "x.xlsx", data, kind: "IN_HOUSE" }, NOW);
    expect(await codeOf(svc.deleteUpload(kat.ctx, ok.uploadId, NOW))).toBe("FORBIDDEN");
    expect(await codeOf(svc.deleteUpload(hks.ctx, ok.uploadId, NOW))).toBe("FORBIDDEN");

    const owner = await staff("R-DEP", "DIAMOND");
    const theirs = await testDb.occupancyUpload.create({
      data: { hotelId: diamond.hid, code: "DOL-X-1", fileName: "y.xlsx", kind: "IN_HOUSE", userId: owner.userId },
    });
    expect(await codeOf(svc.deleteUpload(dep.ctx, theirs.id, NOW))).toBe("NOT_FOUND");
    expect(await codeOf(svc.getUpload(dep.ctx, "DOL-X-1"))).toBe("NOT_FOUND");
    expect((await svc.listUploads(dep.ctx)).map((u) => u.code)).toEqual([ok.code]);
    expect((await svc.getUpload(dep.ctx, ok.code)).errors).toEqual([]);
  });

  it("çok otelli depo sorumlusu seçtiği otele yükler; kapsam dışı otel FORBIDDEN", async () => {
    const { diamond } = await world();
    const multi = await staff("R-DEP", "ROYAL", ["DIAMOND"]);
    await rooms("PREMIUM", ["101"]);
    const data = await stdFile([["301", d("2026-11-01"), d("2026-11-06"), 2, null, null]]);
    const res = await svc.commitOccupancy(multi.ctx, { fileName: "x.xlsx", data, kind: "IN_HOUSE", hotelId: diamond.hid }, NOW);
    expect(res.okRows).toBe(1);
    expect(await testDb.guestRecord.count({ where: { hotelId: diamond.hid } })).toBe(1);
    const premium = await hotelId("PREMIUM");
    expect(await codeOf(svc.commitOccupancy(multi.ctx, { fileName: "x.xlsx", data, kind: "IN_HOUSE", hotelId: premium }, NOW))).toBe("FORBIDDEN");
  });

  it("dosya doğrulama: uzantı, imza, boş veri", async () => {
    const { royal, dep } = await world();
    const data = await stdFile([["101", d("2026-11-01"), d("2026-11-06"), 2, null, null]]);
    expect(await codeOf(svc.commitOccupancy(dep.ctx, { fileName: "x.xls", data, kind: "IN_HOUSE" }, NOW))).toBe("VALIDATION");
    expect(await codeOf(svc.commitOccupancy(dep.ctx, { fileName: "x.xlsx", data: Buffer.from("MZ not a zip"), kind: "IN_HOUSE" }, NOW))).toBe("VALIDATION");
    const empty = await stdFile([]);
    expect(await codeOf(svc.commitOccupancy(dep.ctx, { fileName: "x.xlsx", data: empty, kind: "IN_HOUSE" }, NOW))).toBe("VALIDATION");
    expect(await testDb.occupancyUpload.count({ where: { hotelId: royal.hid } })).toBe(0);
    expect(fs.existsSync(path.join(uploadsDir, "occupancy", royal.hid))).toBe(false);
  });
});

describe("saklama", () => {
  async function uploadAt(dep: Awaited<ReturnType<typeof world>>["dep"], at: Date, name: string, room: string) {
    return svc.commitOccupancy(
      dep.ctx,
      { fileName: name, kind: "IN_HOUSE", data: await stdFile([[room, d("2026-10-01"), d("2026-12-01"), 2, null, null]]) },
      at,
    );
  }

  it("5 günlük dosya silinir, 3 günlük kalır; kayıtlar korunur", async () => {
    const { royal, dep } = await world();
    const old = await uploadAt(dep, daysAgo(5), "eski.xlsx", "101");
    const recent = await uploadAt(dep, daysAgo(3), "yeni.xlsx", "102");
    const oldRow = await testDb.occupancyUpload.findUniqueOrThrow({ where: { id: old.uploadId } });
    const oldFile = path.join(uploadsDir, oldRow.storedPath as string);
    expect(fs.existsSync(oldFile)).toBe(true);

    // DEP-6: the newer IN_HOUSE file replaces records missing from it, so the count is taken before the cleanup.
    const recordsBefore = await testDb.guestRecord.count({ where: { hotelId: royal.hid } });
    expect(recordsBefore).toBeGreaterThan(0);
    expect(await svc.cleanupOldFiles(NOW)).toEqual({ removed: 1, failed: 0 });
    expect(fs.existsSync(oldFile)).toBe(false);
    expect((await testDb.occupancyUpload.findUniqueOrThrow({ where: { id: old.uploadId } })).storedPath).toBeNull();
    expect((await testDb.occupancyUpload.findUniqueOrThrow({ where: { id: recent.uploadId } })).storedPath).not.toBeNull();
    expect(await testDb.guestRecord.count({ where: { hotelId: royal.hid } })).toBe(recordsBefore);
    expect(await svc.cleanupOldFiles(NOW)).toEqual({ removed: 0, failed: 0 });
  });

  it("tek dosya silinemezse diğerleri temizlenir ve failed sayılır", async () => {
    const { dep } = await world();
    const bad = await uploadAt(dep, daysAgo(6), "bozuk.xlsx", "101");
    const good = await uploadAt(dep, daysAgo(5), "iyi.xlsx", "102");
    const badRow = await testDb.occupancyUpload.findUniqueOrThrow({ where: { id: bad.uploadId } });
    // The stored path becomes a non-empty directory: fs.rm (no recursion) fails on it.
    const badPath = path.join(uploadsDir, badRow.storedPath as string);
    fs.rmSync(badPath, { force: true });
    fs.mkdirSync(badPath);
    fs.writeFileSync(path.join(badPath, "x"), "x");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await svc.cleanupOldFiles(NOW)).toEqual({ removed: 1, failed: 1 });
    } finally {
      log.mockRestore();
    }
    expect((await testDb.occupancyUpload.findUniqueOrThrow({ where: { id: good.uploadId } })).storedPath).toBeNull();
    expect((await testDb.occupancyUpload.findUniqueOrThrow({ where: { id: bad.uploadId } })).storedPath).not.toBeNull();
  });

  it("saklama süresi ayardan gelir (10 gün iken 5 günlük kalır)", async () => {
    const { royal, dep } = await world();
    const old = await uploadAt(dep, daysAgo(5), "eski.xlsx", "101");
    await testDb.setting.create({ data: { key: "occupancy.fileRetentionDays", hotelId: royal.hid, value: 10 as never } });
    expect(await svc.cleanupOldFiles(NOW)).toEqual({ removed: 0, failed: 0 });
    expect((await testDb.occupancyUpload.findUniqueOrThrow({ where: { id: old.uploadId } })).storedPath).not.toBeNull();
  });
});

describe("uploadTasks işleri", () => {
  it("runDailyUploadTasks: MINIBAR açık otel x 3 tür, ikinci çalıştırma yeni satır üretmez", async () => {
    const royal = await hotelId("ROYAL");
    const diamond = await hotelId("DIAMOND");
    await testDb.hotelModule.updateMany({ where: { hotelId: diamond, moduleKey: "MINIBAR" }, data: { enabled: false } });
    const first = await jobs.runDailyUploadTasks(NOW);
    expect(first).toBeGreaterThanOrEqual(3);
    const rows = await testDb.uploadTask.findMany({ where: { hotelId: royal } });
    expect(rows.map((r) => r.kind).sort()).toEqual(["ARRIVAL", "DEPARTURE", "IN_HOUSE"]);
    expect(rows.every((r) => r.status === "BEKLIYOR" && r.uploadId === null)).toBe(true);
    expect(await testDb.uploadTask.count({ where: { hotelId: diamond } })).toBe(0);
    const total = await testDb.uploadTask.count();
    expect(await jobs.runDailyUploadTasks(NOW)).toBe(0);
    expect(await testDb.uploadTask.count()).toBe(total);
  });

  it("runDailyUploadTasks tamamlanmış satıra dokunmaz", async () => {
    const { royal, dep } = await world();
    await svc.commitOccupancy(
      dep.ctx,
      { fileName: "ih.xlsx", kind: "IN_HOUSE", data: await stdFile([["101", d("2026-11-01"), d("2026-11-06"), 2, null, null]]) },
      NOW,
    );
    await jobs.runDailyUploadTasks(NOW);
    expect(await testDb.uploadTask.findFirstOrThrow({ where: { hotelId: royal.hid, kind: "IN_HOUSE" } })).toMatchObject({ status: "TAMAMLANDI" });
    expect(await testDb.uploadTask.count({ where: { hotelId: royal.hid } })).toBe(3);
  });

  it("runUploadWarnings: eksik türler için R-DEP başına tek bildirim, slot başına bir kez", async () => {
    const { royal, dep } = await world();
    const otherDep = await staff("R-DEP", "ROYAL");
    await staff("R-KAT", "ROYAL");
    await svc.commitOccupancy(
      dep.ctx,
      { fileName: "ih.xlsx", kind: "IN_HOUSE", data: await stdFile([["101", d("2026-11-01"), d("2026-11-06"), 2, null, null]]) },
      NOW,
    );
    await testDb.notification.deleteMany();
    await jobs.runUploadWarnings(NOW, "10:00");

    const mine = await testDb.notification.findMany({ where: { userId: dep.userId, type: "occupancy.missing" } });
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe("Eksik doluluk yüklemesi — Merit Royal");
    expect(mine[0].body).toContain("Arrivals");
    expect(mine[0].body).toContain("Departures");
    expect(mine[0].body).not.toContain("In House");
    expect(mine[0].body).toBe("Eksik: Arrivals, Departures. Lütfen en kısa sürede doluluk bilgilerini sisteme yükleyiniz.");
    expect(mine[0].refId).toBe(`${royal.hid}:${TODAY}:10:00`);
    expect(await testDb.notification.count({ where: { userId: otherDep.userId, type: "occupancy.missing" } })).toBe(1);

    const total = await testDb.notification.count({ where: { type: "occupancy.missing" } });
    await jobs.runUploadWarnings(NOW, "10:00");
    expect(await testDb.notification.count({ where: { type: "occupancy.missing" } })).toBe(total);

    await jobs.runUploadWarnings(NOW, "18:00");
    expect(await testDb.notification.count({ where: { userId: dep.userId, type: "occupancy.missing" } })).toBe(2);
    expect(await testDb.emailLog.count()).toBe(0);
  });

  it("runUploadWarnings: üç tür yüklüyse bildirim yok", async () => {
    const { royal, dep } = await world();
    for (const [kind, row] of [
      ["IN_HOUSE", ["101", d("2026-11-01"), d("2026-11-06"), 2, null, null]],
      ["ARRIVAL", ["102", d(TODAY), d("2026-11-06"), 2, null, null]],
      ["DEPARTURE", ["103", d("2026-11-01"), d(TODAY), 2, null, null]],
    ] as const) {
      await svc.commitOccupancy(dep.ctx, { fileName: "x.xlsx", kind, data: await stdFile([[...row]]) }, NOW);
    }
    await testDb.notification.deleteMany();
    await jobs.runUploadWarnings(NOW, "10:00");
    expect(await testDb.notification.count({ where: { type: "occupancy.missing" } })).toBe(0);
    expect(royal.hid).toBeTruthy();
  });
});
