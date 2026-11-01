import { z } from "zod";
import { OutletArea, Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import {
  conflictFromPrisma,
  listQuerySchema,
  type Page,
  parseInput,
  publishDefinition,
  type SortSpec,
  toPage,
  withAdminTx,
} from "./crud";

const SCREEN = "CR-TAN";
const LABEL_TAKEN = "Bu etikette bir masa zaten var";
const HAS_RECORDS = "Masanın sipariş, çağrı veya atama kaydı var; silmek yerine pasife alın";
/** Most tables one bulkCreate call may add. */
export const BULK_MAX = 500;
const CONFLICT_LIST_SHOWN = 10;

export type TableRow = {
  id: string;
  outletId: string;
  number: number | null;
  name: string | null;
  capacity: number | null;
  area: OutletArea;
  areaId: string;
  areaName: string | null;
  areaLabel: string;
  label: string;
  /** QR tokens are issued in P5; the token itself never leaves the server. */
  hasQr: boolean;
  isActive: boolean;
};

const SELECT = {
  id: true,
  outletId: true,
  number: true,
  name: true,
  capacity: true,
  areaId: true,
  area: { select: { id: true, type: true, name: true } },
  outlet: { select: { name: true } },
  label: true,
  qrToken: true,
  isActive: true,
} satisfies Prisma.OutletTableSelect;

type TableRecord = Prisma.OutletTableGetPayload<{ select: typeof SELECT }>;

const toRow = (table: TableRecord): TableRow => ({
  id: table.id,
  outletId: table.outletId,
  number: table.number,
  name: table.name?.trim() === String(table.number) ? null : table.name,
  capacity: table.capacity,
  area: table.area.type,
  areaId: table.area.id,
  areaName: table.area.name,
  areaLabel: table.area.name?.trim()
    ? `${table.area.name.trim()} · ${table.area.type === "ACIK" ? "Açık alan" : "Kapalı alan"}`
    : table.area.type === "ACIK"
      ? "Açık alan"
      : "Kapalı alan",
  label: table.label,
  hasQr: table.qrToken !== null,
  isActive: table.isActive,
});

export const tableSchema = z.object({
  // `label` remains accepted for older callers; the current form uses number/name/area.
  label: z.string().trim().min(1, "Masa etiketi gerekli").max(80, "En fazla 80 karakter olabilir").optional(),
  number: z.preprocess(
    (value) => (value === "" ? undefined : value === undefined ? undefined : Number(value)),
    z.number().int().min(1, "Sıra numarası 1 veya daha büyük olmalıdır").max(99999).optional(),
  ),
  name: z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().trim().max(80, "Masa adı en fazla 80 karakter olabilir").nullable().optional(),
  ),
  capacity: z.preprocess(
    (value) => (value === "" ? null : value === undefined ? undefined : Number(value)),
    z.number().int().min(1, "Kişi kapasitesi en az 1 olmalıdır").max(1000).nullable().optional(),
  ),
  areaId: z.string().min(1, "Alan seçin").optional(),
  isActive: z.boolean().optional(),
});
export type TableInput = z.input<typeof tableSchema>;

const bulkNumber = (label: string) =>
  z
    .number(`${label} gerekli`)
    .int(`${label} tam sayı olmalıdır`)
    .min(1, `${label} 1 veya daha büyük olmalıdır`)
    .max(99999, `${label} en fazla 99999 olabilir`);

export const bulkSchema = z
  .object({
    prefix: z.string().trim().max(10, "Ön ek en fazla 10 karakter olabilir").optional().default("M"),
    from: bulkNumber("Başlangıç numarası"),
    to: bulkNumber("Bitiş numarası"),
    areaId: z.string().min(1, "Alan seçin").optional(),
    capacity: z.preprocess(
      (value) => (value === "" ? null : value === undefined ? undefined : Number(value)),
      z.number().int().min(1, "Kişi sayısı en az 1 olmalıdır").max(1000).nullable().optional(),
    ),
    useAreaLabel: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.to < value.from) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "Bitiş numarası başlangıçtan küçük olamaz" });
    } else if (value.to - value.from + 1 > BULK_MAX) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: `Tek seferde en fazla ${BULK_MAX} masa eklenebilir`,
      });
    }
  });
export type BulkInput = z.input<typeof bulkSchema>;

export type BulkResult = { created: number; labels: string[] };

/** "M2" before "M10": numbers inside labels compare as numbers. */
const collator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });

const COMPARE: Record<string, (a: TableRow, b: TableRow) => number> = {
  label: (a, b) => collator.compare(a.label, b.label),
  number: (a, b) => (a.number ?? 0) - (b.number ?? 0),
  isActive: (a, b) => Number(a.isActive) - Number(b.isActive),
  hasQr: (a, b) => Number(a.hasQr) - Number(b.hasQr),
};

function sorted(rows: TableRow[], sort: SortSpec | undefined): TableRow[] {
  const compare = (sort && COMPARE[sort.field]) || COMPARE.label;
  const sign = sort?.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => sign * compare(a, b) || collator.compare(a.label, b.label));
}

/** The outlet's hotel, or NOT_FOUND; every table operation authorises against it. */
async function outletHotel(db: Pick<typeof prisma, "outlet">, outletId: string): Promise<string> {
  const found = await db.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  if (!found) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  return found.hotelId;
}

type AreaChoice = { id: string; type: OutletArea; name: string | null };
type OutletSettings = { hotelId: string; name: string; areas: AreaChoice[] };

async function outletSettings(
  db: Pick<Prisma.TransactionClient, "outlet">,
  outletId: string,
): Promise<OutletSettings> {
  const found = await db.outlet.findUnique({
    where: { id: outletId },
    select: { hotelId: true, name: true, areas: { select: { id: true, type: true, name: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!found) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  return found;
}

/** Serialize per-outlet sequence allocation so concurrent creates receive different numbers. */
async function lockOutletNumbering(tx: Prisma.TransactionClient, outletId: string): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>`SELECT id FROM outlets WHERE id = ${outletId} FOR UPDATE`;
}

async function nextTableNumber(tx: Prisma.TransactionClient, outletId: string): Promise<number> {
  const current = await tx.outletTable.aggregate({ where: { outletId }, _max: { number: true } });
  return (current._max.number ?? 0) + 1;
}

function resolveArea(settings: OutletSettings, requested?: string): AreaChoice {
  if (settings.areas.length === 0) {
    throw new DomainError("VALIDATION", "Önce bu outlet için en az bir alan tanımlayın", {
      fieldErrors: { areaId: ["Önce outlet için alan ekleyin"] },
    });
  }
  const selected = requested
    ? settings.areas.find((area) => area.id === requested)
    : settings.areas.length === 1
      ? settings.areas[0]
      : undefined;
  if (!selected) {
    throw new DomainError("VALIDATION", "Masanın alanını seçin", {
      fieldErrors: { areaId: ["Bir alan seçin"] },
    });
  }
  return selected;
}

function tableLabel(outletName: string, number: number, name: string | null): string {
  const base = `${outletName} ${number}`;
  const detail = name?.trim();
  return detail && detail !== String(number) ? `${base} · ${detail}` : base;
}

export async function list(
  ctx: Ctx,
  outletId: string,
  rawQuery: z.input<typeof listQuerySchema>,
): Promise<Page<TableRow>> {
  const hotelId = await outletHotel(prisma, outletId);
  await assertCan(ctx, SCREEN, "V", hotelId);
  const query = parseInput(listQuerySchema, rawQuery);
  // An outlet has a few dozen tables: sorted in memory so labels order naturally (M2 before M10).
  const items = await prisma.outletTable.findMany({
    where: {
      outletId,
      ...(query.q ? { label: { contains: query.q, mode: "insensitive" } } : {}),
    },
    select: SELECT,
  });
  const all = sorted(items.map(toRow), query.sort);
  const start = (query.page - 1) * query.pageSize;
  return toPage(all.slice(start, start + query.pageSize), all.length, query);
}

export async function create(ctx: Ctx, outletId: string, raw: TableInput): Promise<TableRow> {
  const input = parseInput(tableSchema, raw);
  const hotelId = await outletHotel(prisma, outletId);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
      await lockOutletNumbering(tx, outletId);
      const outlet = await outletSettings(tx, outletId);
      const area = resolveArea(outlet, input.areaId);
      const number = input.number ?? (await nextTableNumber(tx, outletId));
      const name = input.name ?? null;
      const created = await tx.outletTable.create({
        data: {
          outletId,
          number,
          name,
          capacity: input.capacity ?? null,
          areaId: area.id,
      label: input.label ?? tableLabel(outlet.name, number, name),
          isActive: input.isActive ?? true,
        },
        select: SELECT,
      });
      const row = toRow(created);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "TABLE_CREATE",
        entity: "OutletTable",
        entityId: row.id,
        after: row,
      });
      await publishDefinition(tx, { hotelId, entity: "table", id: row.id, op: "create" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, LABEL_TAKEN);
  }
}

export async function update(
  ctx: Ctx,
  outletId: string,
  id: string,
  raw: TableInput,
): Promise<TableRow> {
  const input = parseInput(tableSchema, raw);
  const hotelId = await outletHotel(prisma, outletId);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
      await lockOutletNumbering(tx, outletId);
      const before = await tx.outletTable.findFirst({ where: { id, outletId }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", "Masa bulunamadı");
      const outlet = await outletSettings(tx, outletId);
      const area = resolveArea(outlet, input.areaId ?? before.areaId);
      const number = input.number ?? before.number ?? (await nextTableNumber(tx, outletId));
      const name = input.name === undefined ? before.name : input.name;
      const capacity = input.capacity === undefined ? before.capacity : input.capacity;
      const labelChanged = number !== before.number || name !== before.name || area.id !== before.areaId;
      const updated = await tx.outletTable.update({
        where: { id },
        data: {
          number,
          name,
          capacity,
          areaId: area.id,
          label: input.label ?? (labelChanged ? tableLabel(outlet.name, number, name) : before.label),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: SELECT,
      });
      const row = toRow(updated);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "TABLE_UPDATE",
        entity: "OutletTable",
        entityId: id,
        before: toRow(before),
        after: row,
      });
      await publishDefinition(tx, { hotelId, entity: "table", id, op: "update" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, LABEL_TAKEN);
  }
}

export async function remove(ctx: Ctx, outletId: string, id: string): Promise<void> {
  const hotelId = await outletHotel(prisma, outletId);
  try {
    await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
      const before = await tx.outletTable.findFirst({
        where: { id, outletId },
        select: {
          ...SELECT,
          _count: { select: { orders: true, waiterCalls: true, assignments: true, qrScanLogs: true } },
        },
      });
      if (!before) throw new DomainError("NOT_FOUND", "Masa bulunamadı");
      if (Object.values(before._count).some((count) => count > 0)) {
        throw new DomainError("CONFLICT", HAS_RECORDS);
      }
      await tx.outletTable.delete({ where: { id } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "TABLE_DELETE",
        entity: "OutletTable",
        entityId: id,
        before: toRow(before),
      });
      await publishDefinition(tx, { hotelId, entity: "table", id, op: "delete" });
    });
  } catch (error) {
    conflictFromPrisma(error, HAS_RECORDS);
  }
}

export { remove as delete };

function bulkLabels(input: z.output<typeof bulkSchema>): string[] {
  const labels: string[] = [];
  for (let n = input.from; n <= input.to; n++) labels.push(`${input.prefix}${n}`);
  return labels;
}

async function existingLabels(
  db: Pick<Prisma.TransactionClient, "outletTable">,
  outletId: string,
  labels: string[],
): Promise<string[]> {
  const found = await db.outletTable.findMany({
    where: { outletId, label: { in: labels } },
    select: { label: true },
  });
  const taken = new Set(found.map((t) => t.label));
  return labels.filter((l) => taken.has(l));
}

function bulkConflict(conflicts: string[]): DomainError {
  const shown = conflicts.slice(0, CONFLICT_LIST_SHOWN).join(", ");
  const more =
    conflicts.length > CONFLICT_LIST_SHOWN ? ` ve ${conflicts.length - CONFLICT_LIST_SHOWN} etiket daha` : "";
  return new DomainError(
    "CONFLICT",
    `Şu masa etiketleri zaten kayıtlı: ${shown}${more}. Hiçbir masa eklenmedi.`,
    { fieldErrors: { conflicts } },
  );
}

/**
 * Adds `prefix + n` for every n in from..to (prefix defaults to "M"), all or nothing: when any
 * label already exists nothing is written and the CONFLICT error carries them in `fieldErrors.conflicts`.
 */
export async function bulkCreate(ctx: Ctx, outletId: string, raw: BulkInput): Promise<BulkResult> {
  const input = parseInput(bulkSchema, raw);
  const requestedLabels = bulkLabels(input);
  let attemptedLabels = requestedLabels;
  const hotelId = await outletHotel(prisma, outletId);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
      await lockOutletNumbering(tx, outletId);
      const outlet = await outletSettings(tx, outletId);
      const area = resolveArea(outlet, input.areaId);
      const firstNumber = input.useAreaLabel ? input.from : await nextTableNumber(tx, outletId);
      const numbers = requestedLabels.map((_, index) => firstNumber + index);
      const labels = numbers.map((number) => tableLabel(outlet.name, number, null));
      attemptedLabels = labels;
      const conflicts = await existingLabels(tx, outletId, labels);
      if (conflicts.length > 0) throw bulkConflict(conflicts);
      const numberConflicts = await tx.outletTable.findMany({
        where: { outletId, number: { in: numbers } },
        select: { label: true },
      });
      if (numberConflicts.length > 0) throw bulkConflict(numberConflicts.map((row) => row.label));
      await tx.outletTable.createMany({
        data: labels.map((label, index) => ({ outletId, label, number: numbers[index], areaId: area.id, capacity: input.capacity ?? null })),
      });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "TABLE_BULK_CREATE",
        entity: "OutletTable",
        after: {
          outletId,
          prefix: input.prefix,
          from: input.from,
          to: input.to,
          numberFrom: firstNumber,
          numberTo: numbers.at(-1),
          areaId: area.id,
          count: labels.length,
        },
      });
      await publishDefinition(tx, { hotelId, entity: "table", id: outletId, op: "create" });
      return { created: labels.length, labels };
    });
  } catch (error) {
    // Someone else added a label between the check and the insert: report the clash from a fresh read.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const conflicts = await existingLabels(prisma, outletId, attemptedLabels);
      throw bulkConflict(conflicts.length > 0 ? conflicts : attemptedLabels);
    }
    throw error;
  }
}
