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
  label: string;
  /** QR tokens are issued in P5; the token itself never leaves the server. */
  hasQr: boolean;
  isActive: boolean;
};

const SELECT = {
  id: true,
  outletId: true,
  label: true,
  qrToken: true,
  isActive: true,
} satisfies Prisma.OutletTableSelect;

type TableRecord = Prisma.OutletTableGetPayload<{ select: typeof SELECT }>;

const toRow = (table: TableRecord): TableRow => ({
  id: table.id,
  outletId: table.outletId,
  label: table.label,
  hasQr: table.qrToken !== null,
  isActive: table.isActive,
});

export const tableSchema = z.object({
  label: z.string("Masa etiketi gerekli").trim().min(1, "Masa etiketi gerekli").max(40, "En fazla 40 karakter olabilir"),
  isActive: z.boolean().optional(),
});
export type TableInput = z.input<typeof tableSchema>;

const bulkNumber = (label: string) =>
  z
    .number(`${label} gerekli`)
    .int(`${label} tam sayı olmalıdır`)
    .min(0, `${label} 0 dan küçük olamaz`)
    .max(99999, `${label} en fazla 99999 olabilir`);

export const bulkSchema = z
  .object({
    prefix: z.string().trim().max(10, "Ön ek en fazla 10 karakter olabilir").optional().default("M"),
    from: bulkNumber("Başlangıç numarası"),
    to: bulkNumber("Bitiş numarası"),
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
      const created = await tx.outletTable.create({
        data: { outletId, label: input.label, isActive: input.isActive ?? true },
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
      const before = await tx.outletTable.findFirst({ where: { id, outletId }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", "Masa bulunamadı");
      const updated = await tx.outletTable.update({
        where: { id },
        data: {
          label: input.label,
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
  const labels = bulkLabels(input);
  const hotelId = await outletHotel(prisma, outletId);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
      const conflicts = await existingLabels(tx, outletId, labels);
      if (conflicts.length > 0) throw bulkConflict(conflicts);
      await tx.outletTable.createMany({ data: labels.map((label) => ({ outletId, label })) });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "TABLE_BULK_CREATE",
        entity: "OutletTable",
        after: { outletId, prefix: input.prefix, from: input.from, to: input.to, count: labels.length },
      });
      await publishDefinition(tx, { hotelId, entity: "table", id: outletId, op: "create" });
      return { created: labels.length, labels };
    });
  } catch (error) {
    // Someone else added a label between the check and the insert: report the clash from a fresh read.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const conflicts = await existingLabels(prisma, outletId, labels);
      throw bulkConflict(conflicts.length > 0 ? conflicts : labels);
    }
    throw error;
  }
}
