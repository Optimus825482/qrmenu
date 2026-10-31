import ExcelJS from "exceljs";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import {
  conflictFromPrisma,
  listQuerySchema,
  orderByFor,
  type Page,
  pageArgs,
  parseInput,
  publishDefinition,
  toPage,
  withAdminTx,
} from "./crud";

const SCREEN = "CR-TAN";
const NUMBER_TAKEN = "Bu numarada bir oda zaten var";
const HAS_RECORDS = "Bu odanın işlem, talep veya kontrol kaydı var; silmek yerine pasife alın";
const INVALID = "Girilen bilgiler geçersiz";
/** Most rooms one bulkCreate call may add. */
export const BULK_MAX = 500;
const CONFLICT_LIST_SHOWN = 10;

export type RoomRow = {
  id: string;
  hotelId: string;
  floorId: string;
  floorNumber: number;
  floorName: string;
  roomTypeId: string | null;
  roomTypeName: string | null;
  number: string;
  capacity: number | null;
  guestMessage: string | null;
  /** The QR token itself never leaves the server: lists and audit rows only know whether one exists. */
  hasQr: boolean;
  isActive: boolean;
};

const SELECT = {
  id: true,
  hotelId: true,
  floorId: true,
  roomTypeId: true,
  number: true,
  capacity: true,
  guestMessage: true,
  qrToken: true,
  isActive: true,
  floor: { select: { number: true, name: true } },
  roomType: { select: { name: true } },
} satisfies Prisma.RoomSelect;

type RoomWithRelations = Prisma.RoomGetPayload<{ select: typeof SELECT }>;

const toRow = (room: RoomWithRelations): RoomRow => ({
  id: room.id,
  hotelId: room.hotelId,
  floorId: room.floorId,
  floorNumber: room.floor.number,
  floorName: room.floor.name,
  roomTypeId: room.roomTypeId,
  roomTypeName: room.roomType?.name ?? null,
  number: room.number,
  capacity: room.capacity,
  guestMessage: room.guestMessage,
  hasQr: room.qrToken !== null,
  isActive: room.isActive,
});

/** Blank / missing → null. */
const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .nullish()
    .transform((value) => value || null);

export const roomSchema = z.object({
  floorId: z.string("Kat seçin").trim().min(1, "Kat seçin"),
  roomTypeId: optionalText(64, "Geçersiz oda tipi"),
  number: z.string("Oda numarası gerekli").trim().min(1, "Oda numarası gerekli").max(20, "En fazla 20 karakter olabilir"),
  capacity: z
    .number("Kapasite sayı olmalıdır")
    .int("Kapasite tam sayı olmalıdır")
    .min(1, "Kapasite en az 1 olmalıdır")
    .max(20, "Kapasite en fazla 20 olabilir")
    .nullish()
    .transform((value) => value ?? null),
  guestMessage: optionalText(500, "Misafir mesajı en fazla 500 karakter olabilir"),
  isActive: z.boolean().optional(),
});
export type RoomInput = z.input<typeof roomSchema>;

const bulkNumber = (label: string) =>
  z
    .number(`${label} gerekli`)
    .int(`${label} tam sayı olmalıdır`)
    .min(0, `${label} 0 dan küçük olamaz`)
    .max(99999, `${label} en fazla 99999 olabilir`);

export const bulkSchema = z
  .object({
    floorId: z.string("Kat seçin").trim().min(1, "Kat seçin"),
    roomTypeId: optionalText(64, "Geçersiz oda tipi"),
    from: bulkNumber("Başlangıç numarası"),
    to: bulkNumber("Bitiş numarası"),
    prefix: z.string().trim().max(10, "Ön ek en fazla 10 karakter olabilir").optional().default(""),
    skip: z
      .array(z.number("Atlanacak numaralar sayı olmalıdır").int("Atlanacak numaralar tam sayı olmalıdır"))
      .max(BULK_MAX)
      .optional()
      .default([]),
  })
  .superRefine((value, ctx) => {
    if (value.to < value.from) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Bitiş numarası başlangıçtan küçük olamaz" });
    } else if (value.to - value.from + 1 > BULK_MAX) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `Tek seferde en fazla ${BULK_MAX} oda eklenebilir`,
      });
    }
  });
export type BulkInput = z.input<typeof bulkSchema>;
type ParsedBulk = z.output<typeof bulkSchema>;

/** The room numbers a bulk request stands for: prefix + n for n in from..to, minus the skipped ones. */
function bulkNumbers(input: ParsedBulk): string[] {
  const skipped = new Set(input.skip);
  const result: string[] = [];
  for (let n = input.from; n <= input.to; n++) {
    if (!skipped.has(n)) result.push(`${input.prefix}${n}`);
  }
  if (result.length === 0) {
    throw new DomainError("VALIDATION", INVALID, {
      fieldErrors: { to: ["Eklenecek oda kalmadı; atlanan numaraları gözden geçirin"] },
    });
  }
  return result;
}

export const roomListQuerySchema = listQuerySchema.extend({
  floorId: z.string().min(1).max(64).optional(),
  roomTypeId: z.string().min(1).max(64).optional(),
});
export type RoomListQuery = z.output<typeof roomListQuerySchema>;

const ORDER = {
  number: (dir: "asc" | "desc") => ({ number: dir }),
  floorName: (dir: "asc" | "desc") => ({ floor: { number: dir } }),
  roomTypeName: (dir: "asc" | "desc") => ({ roomType: { name: dir } }),
  capacity: (dir: "asc" | "desc") => ({ capacity: dir }),
  hasQr: (dir: "asc" | "desc") => ({ qrToken: dir }),
  isActive: (dir: "asc" | "desc") => ({ isActive: dir }),
};

type RefDb = Pick<Prisma.TransactionClient, "floor" | "roomType">;

function fieldInvalid(field: string, message: string): DomainError {
  return new DomainError("VALIDATION", INVALID, { fieldErrors: { [field]: [message] } });
}

/** The floor (and room type) must belong to this hotel; a foreign id is a field error, not a crash. */
async function assertRefs(
  db: RefDb,
  hotelId: string,
  refs: { floorId: string; roomTypeId: string | null },
): Promise<void> {
  const floor = await db.floor.findFirst({ where: { id: refs.floorId, hotelId }, select: { id: true } });
  if (!floor) throw fieldInvalid("floorId", "Kat bulunamadı");
  if (refs.roomTypeId) {
    const type = await db.roomType.findFirst({
      where: { id: refs.roomTypeId, hotelId },
      select: { id: true },
    });
    if (!type) throw fieldInvalid("roomTypeId", "Oda tipi bulunamadı");
  }
}

export async function list(
  ctx: Ctx,
  hotelId: string,
  rawQuery: z.input<typeof roomListQuerySchema>,
): Promise<Page<RoomRow>> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const query = parseInput(roomListQuerySchema, rawQuery);
  const where: Prisma.RoomWhereInput = {
    hotelId,
    ...(query.floorId ? { floorId: query.floorId } : {}),
    ...(query.roomTypeId ? { roomTypeId: query.roomTypeId } : {}),
    ...(query.q
      ? {
          OR: [
            { number: { contains: query.q, mode: "insensitive" } },
            { floor: { name: { contains: query.q, mode: "insensitive" } } },
            { roomType: { name: { contains: query.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.RoomOrderByWithRelationInput[] = query.sort
    ? (orderByFor<Prisma.RoomOrderByWithRelationInput>(query.sort, ORDER, {
        number: "asc",
      }) as Prisma.RoomOrderByWithRelationInput[])
    : [{ floor: { number: "asc" } }, { number: "asc" }, { id: "asc" }];
  const [items, total] = await Promise.all([
    prisma.room.findMany({ where, select: SELECT, orderBy, ...pageArgs(query) }),
    prisma.room.count({ where }),
  ]);
  return toPage(items.map(toRow), total, query);
}

export async function create(ctx: Ctx, hotelId: string, raw: RoomInput): Promise<RoomRow> {
  const input = parseInput(roomSchema, raw);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
      await assertRefs(tx, hotelId, input);
      const created = await tx.room.create({
        data: {
          hotelId,
          floorId: input.floorId,
          roomTypeId: input.roomTypeId,
          number: input.number,
          capacity: input.capacity,
          guestMessage: input.guestMessage,
          isActive: input.isActive ?? true,
        },
        select: SELECT,
      });
      const row = toRow(created);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "ROOM_CREATE",
        entity: "Room",
        entityId: row.id,
        after: row,
      });
      await publishDefinition(tx, { hotelId, entity: "room", id: row.id, op: "create" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, NUMBER_TAKEN);
  }
}

/** Replaces the editable fields: an omitted room type / capacity / message is cleared. */
export async function update(
  ctx: Ctx,
  hotelId: string,
  id: string,
  raw: RoomInput,
): Promise<RoomRow> {
  const input = parseInput(roomSchema, raw);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
      const before = await tx.room.findFirst({ where: { id, hotelId }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
      await assertRefs(tx, hotelId, input);
      const updated = await tx.room.update({
        where: { id },
        data: {
          floorId: input.floorId,
          roomTypeId: input.roomTypeId,
          number: input.number,
          capacity: input.capacity,
          guestMessage: input.guestMessage,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: SELECT,
      });
      const row = toRow(updated);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "ROOM_UPDATE",
        entity: "Room",
        entityId: id,
        before: toRow(before),
        after: row,
      });
      await publishDefinition(tx, { hotelId, entity: "room", id, op: "update" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, NUMBER_TAKEN);
  }
}

/** Activates / deactivates a room; the hotel is read from the room itself and authorised as usual. */
export async function setActive(ctx: Ctx, id: string, isActive: boolean): Promise<RoomRow> {
  const found = await prisma.room.findUnique({ where: { id }, select: { hotelId: true } });
  if (!found) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
  const { hotelId } = found;
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
    const before = await tx.room.findFirst({ where: { id, hotelId }, select: SELECT });
    if (!before) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
    if (before.isActive === isActive) return toRow(before);
    const updated = await tx.room.update({ where: { id }, data: { isActive }, select: SELECT });
    const row = toRow(updated);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "ROOM_SET_ACTIVE",
      entity: "Room",
      entityId: id,
      before: toRow(before),
      after: row,
    });
    await publishDefinition(tx, { hotelId, entity: "room", id, op: "update" });
    return row;
  });
}

export async function remove(ctx: Ctx, hotelId: string, id: string): Promise<void> {
  try {
    await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
      const before = await tx.room.findFirst({
        where: { id, hotelId },
        select: {
          ...SELECT,
          _count: {
            select: {
              minibarTransactions: true,
              mybarRequests: true,
              roomChecks: true,
              roomDnds: true,
              guestRecords: true,
              dailyTaskItems: true,
              orders: true,
            },
          },
        },
      });
      if (!before) throw new DomainError("NOT_FOUND", "Oda bulunamadı");
      if (Object.values(before._count).some((count) => count > 0)) {
        throw new DomainError("CONFLICT", HAS_RECORDS);
      }
      await tx.room.delete({ where: { id } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "ROOM_DELETE",
        entity: "Room",
        entityId: id,
        before: toRow(before),
      });
      await publishDefinition(tx, { hotelId, entity: "room", id, op: "delete" });
    });
  } catch (error) {
    // A record added between the count and the delete trips the foreign key.
    conflictFromPrisma(error, HAS_RECORDS);
  }
}

export { remove as delete };

export type BulkResult = { created: number; conflicts: string[] };
export type BulkPreview = { numbers: string[]; conflicts: string[] };

/** The requested numbers that already exist in the hotel, in request order. */
async function existingNumbers(
  db: Pick<Prisma.TransactionClient, "room">,
  hotelId: string,
  numbers: string[],
): Promise<string[]> {
  const found = await db.room.findMany({
    where: { hotelId, number: { in: numbers } },
    select: { number: true },
  });
  const taken = new Set(found.map((r) => r.number));
  return numbers.filter((n) => taken.has(n));
}

function bulkConflict(conflicts: string[]): DomainError {
  const shown = conflicts.slice(0, CONFLICT_LIST_SHOWN).join(", ");
  const more = conflicts.length > CONFLICT_LIST_SHOWN ? ` ve ${conflicts.length - CONFLICT_LIST_SHOWN} numara daha` : "";
  return new DomainError(
    "CONFLICT",
    `Şu oda numaraları zaten kayıtlı: ${shown}${more}. Hiçbir oda eklenmedi.`,
    { fieldErrors: { conflicts } },
  );
}

/**
 * Adds `prefix + n` for every n in from..to (minus `skip`) on one floor, all or nothing: when any
 * number already exists nothing is written and the CONFLICT error carries the clashing numbers in
 * `fieldErrors.conflicts`.
 */
export async function bulkCreate(ctx: Ctx, hotelId: string, raw: BulkInput): Promise<BulkResult> {
  const input = parseInput(bulkSchema, raw);
  const numbers = bulkNumbers(input);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
      await assertRefs(tx, hotelId, input);
      const conflicts = await existingNumbers(tx, hotelId, numbers);
      if (conflicts.length > 0) throw bulkConflict(conflicts);
      await tx.room.createMany({
        data: numbers.map((number) => ({
          hotelId,
          floorId: input.floorId,
          roomTypeId: input.roomTypeId,
          number,
        })),
      });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "ROOM_BULK_CREATE",
        entity: "Room",
        after: {
          floorId: input.floorId,
          roomTypeId: input.roomTypeId,
          count: numbers.length,
          numbers,
        },
      });
      await publishDefinition(tx, { hotelId, entity: "room", id: input.floorId, op: "create" });
      return { created: numbers.length, conflicts: [] };
    });
  } catch (error) {
    // A room added by someone else between the check and the insert trips the unique index; the
    // transaction is gone, so report the clash from a fresh read.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const conflicts = await existingNumbers(prisma, hotelId, numbers);
      throw bulkConflict(conflicts.length > 0 ? conflicts : numbers);
    }
    // The floor or room type was deleted between the reference check and the insert.
    conflictFromPrisma(error, "Seçilen kat veya oda tipi artık yok; listeyi yenileyip tekrar deneyin");
  }
}

/** What bulkCreate would do for this input, without writing: the numbers and which already exist. */
export async function bulkPreview(ctx: Ctx, hotelId: string, raw: BulkInput): Promise<BulkPreview> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const input = parseInput(bulkSchema, raw);
  const numbers = bulkNumbers(input);
  await assertRefs(prisma, hotelId, input);
  return { numbers, conflicts: await existingNumbers(prisma, hotelId, numbers) };
}

/** A spreadsheet reads a cell starting with = + - @ as a formula: user text is neutralised with a leading apostrophe. */
function textCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

const EXPORT_HEADERS = ["Oda No", "Kat", "Oda Tipi", "Kapasite", "Aktif", "QR"] as const;

/** Every room of the hotel as an .xlsx workbook (Oda No, Kat, Oda Tipi, Kapasite, Aktif, QR). */
export async function exportExcel(ctx: Ctx, hotelId: string): Promise<Buffer> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const items = await prisma.room.findMany({
    where: { hotelId },
    select: SELECT,
    orderBy: [{ floor: { number: "asc" } }, { number: "asc" }, { id: "asc" }],
  });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Odalar");
  sheet.columns = EXPORT_HEADERS.map((header, i) => ({
    header,
    key: String(i),
    width: [12, 22, 22, 10, 8, 8][i],
  }));
  sheet.getRow(1).font = { bold: true };
  for (const room of items.map(toRow)) {
    sheet.addRow([
      textCell(room.number),
      textCell(room.floorName),
      textCell(room.roomTypeName ?? ""),
      room.capacity,
      room.isActive ? "Evet" : "Hayır",
      room.hasQr ? "Var" : "Yok",
    ]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
