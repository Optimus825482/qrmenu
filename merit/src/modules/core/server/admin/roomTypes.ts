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
const NAME_TAKEN = "Bu adda bir oda tipi zaten var";
const HAS_ROOMS = "Bu oda tipine bağlı odalar var; önce odaların tipini değiştirin";

export type RoomTypeRow = {
  id: string;
  hotelId: string;
  name: string;
  cabinetCount: number;
  isActive: boolean;
  roomCount: number;
};

const SELECT = {
  id: true,
  hotelId: true,
  name: true,
  cabinetCount: true,
  isActive: true,
  _count: { select: { rooms: true } },
} satisfies Prisma.RoomTypeSelect;

type RoomTypeWithCount = Prisma.RoomTypeGetPayload<{ select: typeof SELECT }>;

const toRow = ({ _count, ...type }: RoomTypeWithCount): RoomTypeRow => ({
  ...type,
  roomCount: _count.rooms,
});

export const roomTypeSchema = z.object({
  name: z.string().trim().min(1, "Oda tipi adı gerekli").max(80, "En fazla 80 karakter olabilir"),
  cabinetCount: z
    .number("Kabin sayısı gerekli")
    .int("Kabin sayısı tam sayı olmalıdır")
    .min(0, "Kabin sayısı 0 dan küçük olamaz")
    .max(100, "Kabin sayısı en fazla 100 olabilir"),
  isActive: z.boolean().optional(),
});
export type RoomTypeInput = z.input<typeof roomTypeSchema>;

const ORDER = {
  name: (dir: "asc" | "desc") => ({ name: dir }),
  cabinetCount: (dir: "asc" | "desc") => ({ cabinetCount: dir }),
  isActive: (dir: "asc" | "desc") => ({ isActive: dir }),
  roomCount: (dir: "asc" | "desc") => ({ rooms: { _count: dir } }),
};

export async function list(
  ctx: Ctx,
  hotelId: string,
  query: ListQuery,
): Promise<Page<RoomTypeRow>> {
  await assertCan(ctx, SCREEN, "V", hotelId);
  const where: Prisma.RoomTypeWhereInput = {
    hotelId,
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.roomType.findMany({
      where,
      select: SELECT,
      orderBy: orderByFor<Prisma.RoomTypeOrderByWithRelationInput>(query.sort, ORDER, { name: "asc" }),
      ...pageArgs(query),
    }),
    prisma.roomType.count({ where }),
  ]);
  return toPage(items.map(toRow), total, query);
}

export async function create(ctx: Ctx, hotelId: string, raw: RoomTypeInput): Promise<RoomTypeRow> {
  const input = parseInput(roomTypeSchema, raw);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
      const created = await tx.roomType.create({
        data: {
          hotelId,
          name: input.name,
          cabinetCount: input.cabinetCount,
          isActive: input.isActive ?? true,
        },
        select: SELECT,
      });
      const row = toRow(created);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "ROOMTYPE_CREATE",
        entity: "RoomType",
        entityId: row.id,
        after: row,
      });
      await publishDefinition(tx, { hotelId, entity: "roomType", id: row.id, op: "create" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, NAME_TAKEN);
  }
}

export async function update(
  ctx: Ctx,
  hotelId: string,
  id: string,
  raw: RoomTypeInput,
): Promise<RoomTypeRow> {
  const input = parseInput(roomTypeSchema, raw);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
      const before = await tx.roomType.findFirst({ where: { id, hotelId }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", "Oda tipi bulunamadı");
      const updated = await tx.roomType.update({
        where: { id },
        data: {
          name: input.name,
          cabinetCount: input.cabinetCount,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: SELECT,
      });
      const row = toRow(updated);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "ROOMTYPE_UPDATE",
        entity: "RoomType",
        entityId: id,
        before: toRow(before),
        after: row,
      });
      await publishDefinition(tx, { hotelId, entity: "roomType", id, op: "update" });
      return row;
    });
  } catch (error) {
    conflictFromPrisma(error, NAME_TAKEN);
  }
}

export async function remove(ctx: Ctx, hotelId: string, id: string): Promise<void> {
  // Room.roomType is ON DELETE SET NULL: the database would silently detach the rooms, so the
  // guard has to be explicit.
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
    const before = await tx.roomType.findFirst({ where: { id, hotelId }, select: SELECT });
    if (!before) throw new DomainError("NOT_FOUND", "Oda tipi bulunamadı");
    if (before._count.rooms > 0) throw new DomainError("CONFLICT", HAS_ROOMS);
    await tx.roomType.delete({ where: { id } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "ROOMTYPE_DELETE",
      entity: "RoomType",
      entityId: id,
      before: toRow(before),
    });
    await publishDefinition(tx, { hotelId, entity: "roomType", id, op: "delete" });
  });
}

export { remove as delete };

export type CopyResult = { copied: number; skipped: number };

/**
 * Copies the room types of `fromHotelId` into `toHotelId`, skipping names the target already has
 * (its existing type is left untouched). Needs create rights on the target and view rights on the
 * source.
 */
export async function copyFromHotel(
  ctx: Ctx,
  toHotelId: string,
  fromHotelId: string,
): Promise<CopyResult> {
  if (toHotelId === fromHotelId) {
    throw new DomainError("VALIDATION", "Kaynak ve hedef otel aynı olamaz");
  }
  await assertCan(ctx, SCREEN, "V", fromHotelId);
  return withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId: toHotelId }, async (tx) => {
    const [source, existing] = await Promise.all([
      tx.roomType.findMany({ where: { hotelId: fromHotelId }, orderBy: { name: "asc" } }),
      tx.roomType.findMany({ where: { hotelId: toHotelId }, select: { name: true } }),
    ]);
    const taken = new Set(existing.map((t) => t.name));
    const fresh = source.filter((t) => !taken.has(t.name));
    if (fresh.length > 0) {
      await tx.roomType.createMany({
        data: fresh.map((t) => ({
          hotelId: toHotelId,
          name: t.name,
          cabinetCount: t.cabinetCount,
          isActive: t.isActive,
        })),
      });
    }
    const result: CopyResult = { copied: fresh.length, skipped: source.length - fresh.length };
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: toHotelId,
      action: "ROOMTYPE_COPY",
      entity: "RoomType",
      after: { fromHotelId, names: fresh.map((t) => t.name), ...result },
    });
    await publishDefinition(tx, {
      hotelId: toHotelId,
      entity: "roomType",
      id: toHotelId,
      op: "create",
    });
    return result;
  });
}
