import { randomBytes } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import type { GuestRecord, Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { getSetting } from "@/lib/settings";
import { businessDate, businessDay, TZ } from "@/lib/time";
import { removeUpload, saveUpload } from "@/lib/uploads";
import { audit } from "@/modules/core/server/audit";
import { mybarCheckoutSweep } from "@/modules/mybar/server/checkout";
import { publishRadar } from "@/modules/radar/publish";
import { UPLOAD_KINDS } from "../constants";
import { OCCUPANCY_UPLOADED } from "../events";
import { OCCUPANCY_MAX_BYTES, parseWorkbook, type ParsedRow, type RowError, type UploadKind } from "./occupancyParse";

const SCREEN = "MB-DOL";
const MAX_ERRORS = 50;
const MAX_WARNINGS = 20;
const MAX_SAMPLE = 20;

/** Daily-task reconciliation (Task 8: `taskGeneration.ts › reconcileDailyTasks`), plugged in without a hard dependency. */
export type DailyTaskReconciler = (
  hotelId: string,
  day: string,
  opts: { actorId?: string },
  now: Date,
) => Promise<{ created: number; added: number; removed: number; updated: number }>;

let reconciler: DailyTaskReconciler | null = null;

/**
 * Wires the task reconciler. Task 8 calls this (or replaces the two call sites below with a direct import).
 * Without a reconciler uploads still succeed and `tasksGenerated` stays false.
 */
export function setDailyTaskReconciler(fn: DailyTaskReconciler | null): void {
  reconciler = fn;
}

export type PreviewSample = {
  row: number;
  roomNumber: string;
  arrivalDate: string;
  departureDate: string;
  arrivalTime?: string;
  departureTime?: string;
  guestCount: number;
};

export type PreviewView = {
  format: "STANDARD" | "P4001";
  detectedKind: UploadKind;
  reportDate?: string;
  totalRows: number;
  okRows: number;
  errorRows: number;
  errors: RowError[];
  warnings: string[];
  unknownRooms: string[];
  sample: PreviewSample[];
  /** P4001 only: whether the hotel named in the file is the target hotel. */
  hotelMatch?: { label: string; matches: boolean };
  /** What the upload would do to the stored records (same rules as the commit). */
  changes: { create: number; update: number; remove: number };
  /** Reasons the commit will be refused (hotel or report date mismatch); empty when it may proceed. */
  blockers: string[];
};

export type CommitResult = {
  uploadId: string;
  code: string;
  totalRows: number;
  okRows: number;
  errorRows: number;
  errors: RowError[];
  tasksGenerated: boolean;
  createdRows: number;
  updatedRows: number;
  /** Records of the same kind and day whose room is missing from the new file (removed; restored on delete). */
  removedRows: number;
};

export type UploadView = {
  id: string;
  code: string;
  fileName: string;
  kind: string;
  status: string;
  totalRows: number;
  okRows: number;
  errorRows: number;
  hasFile: boolean;
  userName: string;
  createdAt: string;
};

const inputSchema = z
  .object({
    fileName: z.string().trim().min(1, "Dosya adı gerekli").max(255),
    hotelId: z.string().min(1).optional(),
    kind: z.enum(["IN_HOUSE", "ARRIVAL", "DEPARTURE"]).optional(),
  })
  .strict();

function check<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw fromZod(parsed.error);
  return parsed.data;
}

function assertXlsxName(fileName: string): void {
  if (!/\.xlsx$/i.test(fileName)) {
    throw new DomainError("VALIDATION", "Dosya .xlsx biçiminde olmalı (Excel'de Farklı Kaydet → .xlsx)");
  }
}

/** A @db.Date value as 'yyyy-MM-dd' (stored as UTC midnight of the business day). */
const dayStr = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * 09:00 - 10:00 standard upload window (informational only, never blocks: K12).
 */
export function checkUploadScheduleWindow(now: Date = new Date()): {
  isWithinWindow: boolean;
  currentTimeStr: string;
  message: string;
} {
  const currentTimeStr = formatInTimeZone(now, TZ, "HH:mm");
  const currentHour = Number(currentTimeStr.slice(0, 2));
  const isWithinWindow = currentHour >= 9 && currentHour < 10;
  const message = isWithinWindow
    ? "Standart doluluk yükleme saat aralığındasınız (09:00 - 10:00)."
    : `Dikkat: Standart doluluk yükleme saati 09:00 - 10:00 arasıdır (Şu an: ${currentTimeStr}). Yönetici yetkiniz ile yüklemeye devam edebilirsiniz.`;
  return { isWithinWindow, currentTimeStr, message };
}

const normLabel = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

async function hotelMatchOf(hotelId: string, label: string): Promise<{ label: string; matches: boolean }> {
  const hotels = await prisma.hotel.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  const target = normLabel(label);
  // The longest hotel name contained in the label wins ("Merit Royal" is a prefix of "Merit Royal Diamond").
  let best: { id: string; len: number } | null = null;
  for (const h of hotels) {
    const n = normLabel(h.name);
    if (n && target.includes(n) && (!best || n.length > best.len)) best = { id: h.id, len: n.length };
  }
  return { label, matches: best === null ? true : best.id === hotelId };
}

function targetHotel(ctx: Ctx, requested?: string): string {
  return requested ?? ctx.session.hotelId;
}

type KnownRow = ParsedRow & { roomId: string };
type RecordReader = Pick<Prisma.TransactionClient, "guestRecord">;

/** A GuestRecord as it was before an upload changed or removed it (dates 'yyyy-MM-dd'); restored on delete. */
type RecordSnapshot = {
  id: string;
  roomId: string;
  uploadId: string | null;
  batchCode: string;
  guestCount: number;
  arrivalDate: string;
  departureDate: string;
  arrivalTime: string | null;
  departureTime: string | null;
  createdAt: string;
};
type RevertData = { updated: RecordSnapshot[]; removed: RecordSnapshot[] };

const snapshot = (r: GuestRecord): RecordSnapshot => ({
  id: r.id,
  roomId: r.roomId,
  uploadId: r.uploadId,
  batchCode: r.batchCode,
  guestCount: r.guestCount,
  arrivalDate: dayStr(r.arrivalDate),
  departureDate: dayStr(r.departureDate),
  arrivalTime: r.arrivalTime,
  departureTime: r.departureTime,
  createdAt: r.createdAt.toISOString(),
});

type RecordPlan = {
  /** In file order; one record may be updated by several rows (the last one wins). */
  updates: { id: string; row: KnownRow }[];
  /** New records (a row overlapping an earlier new row of the same file is folded into it). */
  creates: KnownRow[];
  /** The stored state of every updated record before this upload. */
  originals: GuestRecord[];
  /** Records of this kind and day whose room does not appear in the file. */
  removals: GuestRecord[];
  createdRows: number;
  updatedRows: number;
};

/**
 * The upsert rule (room + kind + overlapping dates) plus the replacement rule: when the file is clean (no row
 * errors), a stored record of the same kind that belongs to `day` (ARRIVAL: arrives that day, DEPARTURE: leaves
 * that day, IN_HOUSE: stays over it) and whose room is not in the file goes. Reads only.
 */
async function planRecords(
  db: RecordReader,
  hotelId: string,
  kind: UploadKind,
  known: KnownRow[],
  day: string,
  allowRemoval: boolean,
): Promise<RecordPlan> {
  // Existing records that could overlap one of the new rows (same room + kind).
  const existing = new Map<string, GuestRecord[]>();
  if (known.length > 0) {
    const minArrival = known.reduce((m, r) => (r.arrivalDate < m ? r.arrivalDate : m), known[0].arrivalDate);
    const maxDeparture = known.reduce((m, r) => (r.departureDate > m ? r.departureDate : m), known[0].departureDate);
    const found = await db.guestRecord.findMany({
      where: {
        hotelId,
        kind,
        roomId: { in: [...new Set(known.map((r) => r.roomId))] },
        arrivalDate: { lte: businessDay(maxDeparture) },
        departureDate: { gte: businessDay(minArrival) },
      },
      orderBy: { createdAt: "asc" },
    });
    for (const rec of found) existing.set(rec.roomId, [...(existing.get(rec.roomId) ?? []), rec]);
  }

  const updates: RecordPlan["updates"] = [];
  const originals = new Map<string, GuestRecord>();
  const creates: KnownRow[] = [];
  // Rows created earlier in this same file also take part in the overlap rule.
  const fresh = new Map<string, { arrival: string; departure: string; index: number }[]>();
  let createdRows = 0;
  let updatedRows = 0;

  for (const row of known) {
    const candidates = (existing.get(row.roomId) ?? []).filter(
      (rec) => dayStr(rec.arrivalDate) <= row.departureDate && dayStr(rec.departureDate) >= row.arrivalDate,
    );
    // Prefer an exact date match, else the most recently created overlapping record.
    const match =
      candidates.find((rec) => dayStr(rec.arrivalDate) === row.arrivalDate && dayStr(rec.departureDate) === row.departureDate) ??
      candidates[candidates.length - 1];

    if (match) {
      if (!originals.has(match.id)) originals.set(match.id, match);
      updates.push({ id: match.id, row });
      // Later rows of the file see the record as this row leaves it.
      const updated: GuestRecord = {
        ...match,
        arrivalDate: businessDay(row.arrivalDate),
        departureDate: businessDay(row.departureDate),
        guestCount: row.guestCount,
        arrivalTime: row.arrivalTime ?? match.arrivalTime,
        departureTime: row.departureTime ?? match.departureTime,
      };
      existing.set(
        row.roomId,
        (existing.get(row.roomId) ?? []).map((rec) => (rec.id === match.id ? updated : rec)),
      );
      updatedRows++;
      continue;
    }

    // Overlap with a row created earlier in this file: fold into that pending insert.
    const pendingList = fresh.get(row.roomId) ?? [];
    const pendingMatch = pendingList.find((p) => p.arrival <= row.departureDate && p.departure >= row.arrivalDate);
    if (pendingMatch) {
      const prev = creates[pendingMatch.index];
      creates[pendingMatch.index] = {
        ...row,
        arrivalTime: row.arrivalTime ?? prev.arrivalTime,
        departureTime: row.departureTime ?? prev.departureTime,
      };
      pendingMatch.arrival = row.arrivalDate;
      pendingMatch.departure = row.departureDate;
      updatedRows++;
      continue;
    }

    creates.push(row);
    pendingList.push({ arrival: row.arrivalDate, departure: row.departureDate, index: creates.length - 1 });
    fresh.set(row.roomId, pendingList);
    createdRows++;
  }

  let removals: GuestRecord[] = [];
  if (allowRemoval && known.length > 0) {
    const date = businessDay(day);
    const window: Prisma.GuestRecordWhereInput =
      kind === "ARRIVAL"
        ? { arrivalDate: date }
        : kind === "DEPARTURE"
          ? { departureDate: date }
          : { arrivalDate: { lte: date }, departureDate: { gte: date } };
    removals = await db.guestRecord.findMany({
      where: { hotelId, kind, ...window, roomId: { notIn: [...new Set(known.map((r) => r.roomId))] } },
      orderBy: { createdAt: "asc" },
    });
  }

  return { updates, creates, originals: [...originals.values()], removals, createdRows, updatedRows };
}

/** Refusal reasons of a commit: the P4001 hotel label names another hotel, or its report date is not `today`. */
function commitBlockers(
  sheet: { reportDate?: string },
  hotelMatch: { label: string; matches: boolean } | undefined,
  today: string,
): string[] {
  const out: string[] = [];
  if (hotelMatch && !hotelMatch.matches) {
    out.push(`Dosyadaki otel adı ('${hotelMatch.label}') seçili otelle uyuşmuyor; doğru oteli seçin`);
  }
  if (sheet.reportDate && sheet.reportDate !== today) {
    out.push(`Dosyanın rapor tarihi (${sheet.reportDate}) bugünle (${today}) uyuşmuyor; bugünün raporunu yükleyin`);
  }
  return out;
}

const PENDING_ITEM = ["BEKLIYOR", "DEVAM"] as const;

/**
 * Drops guest records: pending task items that rest on them go (an emptied task goes with them), finished /
 * DND / missing items stay without a record.
 */
async function dropRecords(
  tx: Prisma.TransactionClient,
  recordIds: string[],
): Promise<{ deletedPendingItems: number; keptCompletedItems: number }> {
  if (recordIds.length === 0) return { deletedPendingItems: 0, keptCompletedItems: 0 };
  const pendingItems = await tx.dailyTaskItem.findMany({
    where: { guestRecordId: { in: recordIds }, status: { in: [...PENDING_ITEM] } },
    select: { id: true, taskId: true },
  });
  if (pendingItems.length > 0) {
    await tx.dailyTaskItem.deleteMany({ where: { id: { in: pendingItems.map((i) => i.id) } } });
    const taskIds = [...new Set(pendingItems.map((i) => i.taskId))];
    await tx.dailyTask.deleteMany({ where: { id: { in: taskIds }, items: { none: {} } } });
  }
  const keptCompletedItems = await tx.dailyTaskItem.count({ where: { guestRecordId: { in: recordIds } } });
  await tx.dailyTaskItem.updateMany({ where: { guestRecordId: { in: recordIds } }, data: { guestRecordId: null } });
  await tx.guestRecord.deleteMany({ where: { id: { in: recordIds } } });
  return { deletedPendingItems: pendingItems.length, keptCompletedItems };
}

/**
 * Parses the workbook against the hotel's rooms and reports what an upload would do.
 * Writes nothing (no upload row, no file, no audit).
 */
export async function previewOccupancy(
  ctx: Ctx,
  input: { fileName: string; data: Buffer; hotelId?: string; kind?: UploadKind },
  now: Date = new Date(),
): Promise<PreviewView> {
  const { fileName, hotelId: requested, kind } = check(inputSchema, {
    fileName: input.fileName,
    hotelId: input.hotelId,
    kind: input.kind,
  });
  const hotelId = targetHotel(ctx, requested);
  await assertCan(ctx, SCREEN, "O", hotelId);
  assertXlsxName(fileName);

  const today = businessDate(now);
  const sheet = await parseWorkbook(input.data, { today, kindHint: kind });
  const rooms = await prisma.room.findMany({ where: { hotelId, isActive: true }, select: { id: true, number: true } });
  const roomIds = new Map(rooms.map((r) => [r.number.trim(), r.id]));

  const errors: RowError[] = [...sheet.errors];
  const unknown = new Set<string>();
  const okRows: KnownRow[] = [];
  for (const row of sheet.rows) {
    const roomId = roomIds.get(row.roomNumber);
    if (roomId) {
      okRows.push({ ...row, roomId });
    } else {
      unknown.add(row.roomNumber);
      errors.push({ row: row.row, message: `Oda '${row.roomNumber}' sistemde bulunamadı` });
    }
  }
  errors.sort((a, b) => a.row - b.row);

  const hotelMatch = sheet.hotelLabel ? await hotelMatchOf(hotelId, sheet.hotelLabel) : undefined;
  const blockers = commitBlockers(sheet, hotelMatch, today);
  const warnings = [...blockers, ...sheet.warnings];
  const plan = await planRecords(prisma, hotelId, sheet.detectedKind, okRows, today, errors.length === 0);
  if (errors.length > 0 && okRows.length > 0) {
    warnings.push("Hatalı satır olduğu için dosyada bulunmayan eski kayıtlar silinmeyecek");
  }

  return {
    format: sheet.format,
    detectedKind: sheet.detectedKind,
    ...(sheet.reportDate ? { reportDate: sheet.reportDate } : {}),
    totalRows: sheet.totalRows,
    okRows: okRows.length,
    errorRows: sheet.totalRows - okRows.length,
    errors: errors.slice(0, MAX_ERRORS),
    warnings: warnings.slice(0, MAX_WARNINGS),
    unknownRooms: [...unknown],
    sample: okRows.slice(0, MAX_SAMPLE).map(({ row, roomNumber, arrivalDate, departureDate, arrivalTime, departureTime, guestCount }) => ({
      row,
      roomNumber,
      arrivalDate,
      departureDate,
      ...(arrivalTime ? { arrivalTime } : {}),
      ...(departureTime ? { departureTime } : {}),
      guestCount,
    })),
    ...(hotelMatch ? { hotelMatch } : {}),
    changes: { create: plan.createdRows, update: plan.originals.length, remove: plan.removals.length },
    blockers,
  };
}

function uploadCode(now: Date): string {
  return `DOL-${formatInTimeZone(now, TZ, "yyyyMMdd-HHmmss")}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

async function advisoryLock(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** Whether all three kinds are complete today, then reconciles the daily tasks (after the upload committed). */
async function reconcileAfter(
  hotelId: string,
  day: string,
  actorId: string,
  now: Date,
  requireAllKinds: boolean,
): Promise<boolean> {
  if (!reconciler) return false;
  if (requireAllKinds) {
    const done = await prisma.uploadTask.count({
      where: { hotelId, date: businessDay(day), status: "TAMAMLANDI", kind: { in: [...UPLOAD_KINDS] } },
    });
    if (done < UPLOAD_KINDS.length) return false;
  }
  try {
    await reconciler(hotelId, day, { actorId }, now);
    return true;
  } catch (error) {
    // The upload is committed; the "Görevleri yeniden üret" action recovers a failed reconcile.
    console.error("[occupancy] görev uzlaştırması başarısız", { hotelId, day, error });
    return false;
  }
}

/** Saves the file, then writes records (upsert by room + kind + overlapping dates) in ONE transaction. */
export async function commitOccupancy(
  ctx: Ctx,
  input: { fileName: string; data: Buffer; kind?: UploadKind; hotelId?: string },
  now: Date = new Date(),
): Promise<CommitResult> {
  const { fileName, kind: requestedKind, hotelId: requested } = check(inputSchema, {
    fileName: input.fileName,
    kind: input.kind,
    hotelId: input.hotelId,
  });
  const hotelId = targetHotel(ctx, requested);
  await assertCan(ctx, SCREEN, "O", hotelId);
  assertXlsxName(fileName);

  const today = businessDate(now);
  // Without a kind the file decides (detected only after the permission check above).
  const kind = requestedKind ?? (await parseWorkbook(input.data, { today })).detectedKind;
  const sheet = await parseWorkbook(input.data, { today, kindHint: kind });
  const hotelMatch = sheet.hotelLabel ? await hotelMatchOf(hotelId, sheet.hotelLabel) : undefined;
  const blockers = commitBlockers(sheet, hotelMatch, today);
  if (blockers.length > 0) throw new DomainError("VALIDATION", blockers.join(". "));
  const code = uploadCode(now);
  const storedPath = `occupancy/${hotelId}/${code}.xlsx`;
  await saveUpload(storedPath, input.data);

  let outcome: Omit<CommitResult, "tasksGenerated">;
  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        await advisoryLock(tx, `occ:${hotelId}:${today}`);

        const upload = await tx.occupancyUpload.create({
          data: {
            hotelId,
            code,
            fileName,
            kind,
            status: "YUKLENDI",
            totalRows: sheet.totalRows,
            storedPath,
            userId: ctx.user.id,
            createdAt: now,
          },
        });
        await tx.occupancyUpload.update({ where: { id: upload.id }, data: { status: "ISLENIYOR" } });

        const rooms = await tx.room.findMany({ where: { hotelId, isActive: true }, select: { id: true, number: true } });
        const roomIds = new Map(rooms.map((r) => [r.number.trim(), r.id]));

        const errors: RowError[] = [...sheet.errors];
        const known: KnownRow[] = [];
        for (const row of sheet.rows) {
          const roomId = roomIds.get(row.roomNumber);
          if (roomId) known.push({ ...row, roomId });
          else errors.push({ row: row.row, message: `Oda '${row.roomNumber}' sistemde bulunamadı` });
        }
        errors.sort((a, b) => a.row - b.row);

        const plan = await planRecords(tx, hotelId, kind, known, today, errors.length === 0);
        for (const { id, row } of plan.updates) {
          await tx.guestRecord.update({
            where: { id },
            data: {
              arrivalDate: businessDay(row.arrivalDate),
              departureDate: businessDay(row.departureDate),
              guestCount: row.guestCount,
              ...(row.arrivalTime ? { arrivalTime: row.arrivalTime } : {}),
              ...(row.departureTime ? { departureTime: row.departureTime } : {}),
              uploadId: upload.id,
              batchCode: code,
            },
          });
        }
        if (plan.creates.length > 0) {
          await tx.guestRecord.createMany({
            data: plan.creates.map((row) => ({
              hotelId,
              roomId: row.roomId,
              uploadId: upload.id,
              batchCode: code,
              guestCount: row.guestCount,
              arrivalDate: businessDay(row.arrivalDate),
              ...(row.arrivalTime ? { arrivalTime: row.arrivalTime } : {}),
              departureDate: businessDay(row.departureDate),
              ...(row.departureTime ? { departureTime: row.departureTime } : {}),
              kind,
            })),
          });
        }
        // Records of this day the new file no longer lists (snapshotted, so deleting this upload brings them back).
        await dropRecords(tx, plan.removals.map((r) => r.id));
        const { createdRows, updatedRows } = plan;
        const removedRows = plan.removals.length;
        const revert: RevertData = { updated: plan.originals.map(snapshot), removed: plan.removals.map(snapshot) };

        const okRows = known.length;
        const errorRows = sheet.totalRows - okRows;
        const storedErrors = errors.slice(0, MAX_ERRORS);
        await tx.occupancyUpload.update({
          where: { id: upload.id },
          data: {
            status: okRows > 0 ? "TAMAMLANDI" : "HATA",
            okRows,
            errorRows,
            errors: storedErrors as unknown as Prisma.InputJsonValue,
            revertData: revert as unknown as Prisma.InputJsonValue,
          },
        });

        if (okRows > 0) {
          const date = businessDay(today);
          await tx.uploadTask.upsert({
            where: { hotelId_date_kind: { hotelId, date, kind } },
            create: { hotelId, date, kind, status: "TAMAMLANDI", uploadId: upload.id },
            update: { status: "TAMAMLANDI", uploadId: upload.id },
          });
        }

        await audit(tx, {
          userId: ctx.user.id,
          hotelId,
          action: "OCCUPANCY_UPLOAD",
          entity: "OccupancyUpload",
          entityId: upload.id,
          after: { code, fileName, kind, format: sheet.format, totalRows: sheet.totalRows, okRows, errorRows, createdRows, updatedRows, removedRows },
        });
        await publishRadar(
          "occupancy.uploaded",
          { hotelId },
          { uploadId: upload.id, kind, status: okRows > 0 ? "TAMAMLANDI" : "HATA", okRows, errorRows },
          tx,
        );

        return { uploadId: upload.id, code, totalRows: sheet.totalRows, okRows, errorRows, errors: storedErrors, createdRows, updatedRows, removedRows };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (error) {
    await removeUpload(storedPath).catch(() => undefined);
    throw error;
  }

  const tasksGenerated =
    outcome.okRows > 0 ? await reconcileAfter(hotelId, today, ctx.user.id, now, true) : false;
  if (outcome.okRows > 0 && outcome.errorRows === 0) {
    // Guest checkout: open MyBar requests of finished stays are cancelled now (the minute sweep is the backstop).
    try {
      await mybarCheckoutSweep(now, { hotelId });
    } catch (error) {
      console.error("[occupancy] MyBar çıkış iptali başarısız", { hotelId, error });
    }
  }
  return { ...outcome, tasksGenerated };
}

/**
 * Reverts an upload: records it created go (pending task items that rest on them go, an emptied task goes with
 * them, finished/DND/missing items stay without a record); records it only updated get their earlier state back
 * and records it removed come back, unless a later upload owns them by now or their own upload was deleted
 * meanwhile. The day's UploadTask returns to BEKLIYOR.
 */
export async function deleteUpload(
  ctx: Ctx,
  uploadId: string,
  now: Date = new Date(),
): Promise<{ keptCompletedItems: number }> {
  await assertCan(ctx, SCREEN, "D", ctx.session.hotelId);
  const upload = await prisma.occupancyUpload.findFirst({
    where: { id: uploadId, hotelId: { in: ctx.hotelIds } },
  });
  if (!upload) throw new DomainError("NOT_FOUND", "Yükleme bulunamadı");
  if (upload.hotelId !== ctx.session.hotelId) await assertCan(ctx, SCREEN, "D", upload.hotelId);
  if (upload.status === "SILINDI") throw new DomainError("CONFLICT", "Yükleme zaten silinmiş");

  const day = businessDate(upload.createdAt);
  const result = await prisma.$transaction(
    async (tx) => {
      await advisoryLock(tx, `occ:${upload.hotelId}:${day}`);
      // Re-read under the lock: a concurrent delete may have finished while we waited.
      const current = await tx.occupancyUpload.findUnique({ where: { id: upload.id }, select: { status: true } });
      if (!current || current.status === "SILINDI") throw new DomainError("CONFLICT", "Yükleme zaten silinmiş");

      const revert = (await tx.occupancyUpload.findUnique({ where: { id: upload.id }, select: { revertData: true } }))
        ?.revertData as unknown as RevertData | null;
      const updated = revert?.updated ?? [];
      const removed = revert?.removed ?? [];
      // A snapshot whose own upload was deleted meanwhile would not exist without this upload: it is not restored.
      const ownerIds = [...new Set([...updated, ...removed].map((r) => r.uploadId).filter((u): u is string => u !== null))];
      const deletedOwners = new Set(
        (await tx.occupancyUpload.findMany({ where: { id: { in: ownerIds }, status: "SILINDI" }, select: { id: true } })).map(
          (u) => u.id,
        ),
      );
      const alive = (r: RecordSnapshot) => r.uploadId === null || !deletedOwners.has(r.uploadId);

      const owned = await tx.guestRecord.findMany({ where: { uploadId: upload.id }, select: { id: true } });
      const restorable = new Map(updated.filter(alive).map((r) => [r.id, r]));
      const recordIds = owned.map((r) => r.id).filter((recId) => !restorable.has(recId));
      const { deletedPendingItems, keptCompletedItems } = await dropRecords(tx, recordIds);

      let restoredRecords = 0;
      for (const prev of restorable.values()) {
        // Only while this upload still owns the record: a later upload's own change stays.
        const { count } = await tx.guestRecord.updateMany({
          where: { id: prev.id, uploadId: upload.id },
          data: {
            uploadId: prev.uploadId,
            batchCode: prev.batchCode,
            guestCount: prev.guestCount,
            arrivalDate: businessDay(prev.arrivalDate),
            departureDate: businessDay(prev.departureDate),
            arrivalTime: prev.arrivalTime,
            departureTime: prev.departureTime,
          },
        });
        restoredRecords += count;
      }
      const back = removed.filter(alive);
      const recreatedRecords =
        back.length > 0
          ? (
              await tx.guestRecord.createMany({
                data: back.map((r) => ({
                  id: r.id,
                  hotelId: upload.hotelId,
                  roomId: r.roomId,
                  uploadId: r.uploadId,
                  batchCode: r.batchCode,
                  guestCount: r.guestCount,
                  arrivalDate: businessDay(r.arrivalDate),
                  departureDate: businessDay(r.departureDate),
                  arrivalTime: r.arrivalTime,
                  departureTime: r.departureTime,
                  kind: upload.kind as UploadKind,
                  createdAt: new Date(r.createdAt),
                })),
                skipDuplicates: true,
              })
            ).count
          : 0;

      await tx.uploadTask.updateMany({
        where: { uploadId: upload.id },
        data: { status: "BEKLIYOR", uploadId: null },
      });
      await tx.occupancyUpload.update({ where: { id: upload.id }, data: { status: "SILINDI", storedPath: null } });

      await audit(tx, {
        userId: ctx.user.id,
        hotelId: upload.hotelId,
        action: "OCCUPANCY_UPLOAD_DELETE",
        entity: "OccupancyUpload",
        entityId: upload.id,
        before: { code: upload.code, status: upload.status, okRows: upload.okRows },
        after: { deletedRecords: recordIds.length, deletedPendingItems, keptCompletedItems, restoredRecords, recreatedRecords },
      });
      await publish(
        { type: OCCUPANCY_UPLOADED, hotelId: upload.hotelId, payload: { uploadId: upload.id, code: upload.code, deleted: true } },
        tx,
      );
      return { keptCompletedItems };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  if (upload.storedPath) await removeUpload(upload.storedPath).catch(() => undefined);
  await reconcileAfter(upload.hotelId, day, ctx.user.id, now, false);
  return result;
}

function toView(
  u: {
    id: string;
    code: string;
    fileName: string;
    kind: string;
    status: string;
    totalRows: number;
    okRows: number;
    errorRows: number;
    storedPath: string | null;
    createdAt: Date;
    user: { fullName: string } | null;
  },
): UploadView {
  return {
    id: u.id,
    code: u.code,
    fileName: u.fileName,
    kind: u.kind,
    status: u.status,
    totalRows: u.totalRows,
    okRows: u.okRows,
    errorRows: u.errorRows,
    hasFile: u.storedPath !== null,
    userName: u.user?.fullName ?? "Personel",
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listUploads(
  ctx: Ctx,
  opts: { limit?: number; hotelId?: string } = {},
): Promise<UploadView[]> {
  const hotelId = targetHotel(ctx, opts.hotelId);
  await assertCan(ctx, SCREEN, "V", hotelId);
  const rows = await prisma.occupancyUpload.findMany({
    where: { hotelId },
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(opts.limit ?? 50, 1), 200),
  });
  return rows.map(toView);
}

export async function getUpload(
  ctx: Ctx,
  code: string,
): Promise<UploadView & { errors: RowError[]; hotelId: string }> {
  await assertCan(ctx, SCREEN, "V", ctx.session.hotelId);
  const row = await prisma.occupancyUpload.findFirst({
    where: { code, hotelId: { in: ctx.hotelIds } },
    include: { user: { select: { fullName: true } } },
  });
  if (!row) throw new DomainError("NOT_FOUND", "Yükleme bulunamadı");
  if (row.hotelId !== ctx.session.hotelId) await assertCan(ctx, SCREEN, "V", row.hotelId);
  return { ...toView(row), errors: row.errors as unknown as RowError[], hotelId: row.hotelId };
}

/**
 * Retention job: removes stored workbooks older than `occupancy.fileRetentionDays` (hotel setting,
 * default 4). Upload rows and GuestRecords stay; only the file and `storedPath` go.
 */
export async function cleanupOldFiles(now: Date = new Date()): Promise<{ removed: number; failed: number }> {
  const candidates = await prisma.occupancyUpload.findMany({
    where: { storedPath: { not: null }, createdAt: { lt: new Date(now.getTime() - 86_400_000) } },
    select: { id: true, hotelId: true, storedPath: true, createdAt: true },
  });
  const days = new Map<string, number>();
  let removed = 0;
  let failed = 0;
  for (const c of candidates) {
    try {
      if (!days.has(c.hotelId)) days.set(c.hotelId, await getSetting("occupancy.fileRetentionDays", c.hotelId));
      const keepDays = days.get(c.hotelId) as number;
      if (c.createdAt.getTime() >= now.getTime() - keepDays * 86_400_000) continue;
      await removeUpload(c.storedPath as string);
      await prisma.occupancyUpload.update({ where: { id: c.id }, data: { storedPath: null } });
      removed++;
    } catch (error) {
      failed++;
      console.error("[occupancy] dosya temizliği başarısız", { uploadId: c.id, error });
    }
  }
  return { removed, failed };
}

export { OCCUPANCY_MAX_BYTES };
