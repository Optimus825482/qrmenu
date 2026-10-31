import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import {
  conflictFromPrisma,
  type ListQuery,
  orderByFor,
  type Page,
  pageArgs,
  parseInput,
  publishDefinition,
  toPage,
  withAdminTx,
} from "./crud";

const SCREEN = "CR-TAN";
const NUMBER_TAKEN = "Bu numarada bir kat zaten var";
const HAS_ROOMS = "Katta kayıtlı odalar var; önce odaları taşıyın/silin";

export type FloorRow = {
  id: string;
  hotelId: string;
  number: number;
  name: string;
  isActive: boolean;
  roomCount: number;
};

const SELECT = {
  id: true,
  hotelId: true,
  number: true,
  name: true,
  isActive: true,
  _count: { select: { rooms: true } },
} satisfies Prisma.FloorSelect;

type FloorWithCount = Prisma.FloorGetPayload<{ select: typeof SELECT }>;

const toRow = ({ _count, ...floor }: FloorWithCount): FloorRow => ({
  ...floor,
  roomCount: _count.rooms,
});

export const floorSchema = z.object({
  number: z
    .number("Kat numarası gerekli")
    .int("Kat numarası tam sayı olmalıdır")
    .min(-5, "Kat numarası en az -5 olabilir")
    .max(200, "Kat numarası en fazla 200 olabilir"),
  name: z.string().trim().min(1, "Kat adı gerekli").max(80, "En fazla 80 karakter olabilir"),
  isActive: z.boolean().optional(),
});
export type FloorInput = z.input<typeof floorSchema>;

const ORDER = {
  number: (dir: "asc" | "desc") => ({ number: dir }),
  name: (dir: "asc" | "desc") => ({ name: dir }),
  isActive: (dir: "asc" | "desc") => ({ isActive: dir }),
  roomCount: (dir: "asc" | "desc") => ({ rooms: { _count: dir } }),
};

export async function list(ctx: Ctx, hotelId: string, query: ListQuery): Promise<Page<FloorRow>> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const numeric = query.q !== undefined && /^-?\d+$/.test(query.q) ? Number(query.q) : undefined;
  const where: Prisma.FloorWhereInput = {
    hotelId,
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            ...(numeric !== undefined && Number.isSafeInteger(numeric) ? [{ number: numeric }] : []),
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.floor.findMany({
      where,
      select: SELECT,
      orderBy: orderByFor<Prisma.FloorOrderByWithRelationInput>(query.sort, ORDER, { number: "asc" }),
      ...pageArgs(query),
    }),
    prisma.floor.count({ where }),
  ]);
  return toPage(items.map(toRow), total, query);
}

export async function create(ctx: Ctx, hotelId: string, raw: FloorInput): Promise<FloorRow> {
  const input = parseInput(floorSchema, raw);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
      const created = await tx.floor.create({
        data: { hotelId, number: input.number, name: input.name, isActive: input.isActive ?? true },
        select: SELECT,
      });
      const row = toRow(created);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "FLOOR_CREATE",
        entity: "Floor",
        entityId: row.id,
        after: row,
      });
      await publishDefinition(tx, { hotelId, entity: "floor", id: row.id, op: "create" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, NUMBER_TAKEN);
  }
}

export async function update(
  ctx: Ctx,
  hotelId: string,
  id: string,
  raw: FloorInput,
): Promise<FloorRow> {
  const input = parseInput(floorSchema, raw);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
      const before = await tx.floor.findFirst({ where: { id, hotelId }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", "Kat bulunamadı");
      const updated = await tx.floor.update({
        where: { id },
        data: {
          number: input.number,
          name: input.name,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: SELECT,
      });
      const row = toRow(updated);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "FLOOR_UPDATE",
        entity: "Floor",
        entityId: id,
        before: toRow(before),
        after: row,
      });
      await publishDefinition(tx, { hotelId, entity: "floor", id, op: "update" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, NUMBER_TAKEN);
  }
}

export async function remove(ctx: Ctx, hotelId: string, id: string): Promise<void> {
  try {
    await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
      const before = await tx.floor.findFirst({ where: { id, hotelId }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", "Kat bulunamadı");
      if (before._count.rooms > 0) throw new DomainError("CONFLICT", HAS_ROOMS);
      await tx.floor.delete({ where: { id } });
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "FLOOR_DELETE",
        entity: "Floor",
        entityId: id,
        before: toRow(before),
      });
      await publishDefinition(tx, { hotelId, entity: "floor", id, op: "delete" });
    });
  } catch (error) {
    // A room added between the count and the delete trips the foreign key.
    conflictFromPrisma(error, HAS_ROOMS);
  }
}

export { remove as delete };
