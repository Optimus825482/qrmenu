import { z } from "zod";
import { OutletArea, PriceDisplay, type Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { assertCan } from "@/lib/rbac";
import { audit } from "@/modules/core/server/audit";
import { conflictFromPrisma, isConflictError, parseInput, publishDefinition, withAdminTx } from "./crud";

const SCREEN = "CR-TAN";

export type OutletAreaRow = {
  id: string;
  outletId: string;
  type: OutletArea;
  name: string | null;
  orderingEnabled: boolean | null;
  priceDisplay: PriceDisplay | null;
  tableCount: number;
};

const SELECT = {
  id: true,
  outletId: true,
  type: true,
  name: true,
  orderingEnabled: true,
  priceDisplay: true,
  _count: { select: { tables: true } },
} satisfies Prisma.OutletAreaDefinitionSelect;

type AreaRecord = Prisma.OutletAreaDefinitionGetPayload<{ select: typeof SELECT }>;

const toRow = ({ _count, ...area }: AreaRecord): OutletAreaRow => ({
  ...area,
  tableCount: _count.tables,
});

const areaSchema = z.object({
  type: z.enum(OutletArea, "Alan türünü seçin"),
  name: z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().trim().max(60, "Alan adı en fazla 60 karakter olabilir").nullable().optional(),
  ),
});
const areaSettingsSchema = z.object({
  orderingEnabled: z.boolean().nullable(),
  priceDisplay: z.enum(PriceDisplay).nullable(),
});
export type OutletAreaInput = z.input<typeof areaSchema>;
export type OutletAreaSettingsInput = z.input<typeof areaSettingsSchema>;

async function hotelForOutlet(outletId: string): Promise<string> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  return outlet.hotelId;
}

export async function list(ctx: Ctx, outletId: string): Promise<OutletAreaRow[]> {
  const hotelId = await hotelForOutlet(outletId);
  await assertCan(ctx, SCREEN, "V", hotelId);
  const areas = await prisma.outletAreaDefinition.findMany({
    where: { outletId },
    select: SELECT,
    orderBy: [{ type: "asc" }, { createdAt: "asc" }, { name: "asc" }],
  });
  return areas.map(toRow);
}

export async function create(ctx: Ctx, outletId: string, raw: OutletAreaInput): Promise<OutletAreaRow> {
  const input = parseInput(areaSchema, raw);
  const hotelId = await hotelForOutlet(outletId);
  const name = input.name?.trim() || null;
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O", hotelId }, async (tx) => {
      if (name) {
        const duplicate = await tx.outletAreaDefinition.findFirst({
          where: { outletId, type: input.type, name: { equals: name, mode: "insensitive" } },
          select: { id: true },
        });
        if (duplicate) {
          throw new DomainError("CONFLICT", "Bu adda aynı türde bir alan zaten var", {
            fieldErrors: { name: ["Bu adda aynı türde bir alan zaten var"] },
          });
        }
      }
      const created = await tx.outletAreaDefinition.create({
        data: { outletId, type: input.type, name },
        select: SELECT,
      });
      const row = toRow(created);
      await audit(tx, {
        userId: ctx.user.id,
        hotelId,
        action: "OUTLET_AREA_CREATE",
        entity: "OutletAreaDefinition",
        entityId: row.id,
        after: row,
      });
      await publishDefinition(tx, { hotelId, entity: "outletArea", id: row.id, op: "create" });
      return row;
    });
  } catch (error) {
    if (!isConflictError(error)) throw error;
    conflictFromPrisma(error, "Bu adda aynı türde bir alan zaten var");
  }
}

export async function updateSettings(
  ctx: Ctx,
  outletId: string,
  id: string,
  raw: OutletAreaSettingsInput,
): Promise<OutletAreaRow> {
  const input = parseInput(areaSettingsSchema, raw);
  const hotelId = await hotelForOutlet(outletId);
  return withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
    const before = await tx.outletAreaDefinition.findFirst({ where: { id, outletId }, select: SELECT });
    if (!before) throw new DomainError("NOT_FOUND", "Alan bulunamadı");
    const after = await tx.outletAreaDefinition.update({
      where: { id },
      data: input,
      select: SELECT,
    });
    const row = toRow(after);
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "OUTLET_AREA_UPDATE",
      entity: "OutletAreaDefinition",
      entityId: id,
      before: toRow(before),
      after: row,
    });
    await publishDefinition(tx, { hotelId, entity: "outletArea", id, op: "update" });
    return row;
  });
}

export async function remove(ctx: Ctx, outletId: string, id: string): Promise<void> {
  const hotelId = await hotelForOutlet(outletId);
  await withAdminTx(ctx, { screen: SCREEN, action: "D", hotelId }, async (tx) => {
    await tx.$queryRaw<{ id: string }[]>`SELECT id FROM outlets WHERE id = ${outletId} FOR UPDATE`;
    const before = await tx.outletAreaDefinition.findFirst({
      where: { id, outletId },
      select: { ...SELECT, createdAt: true },
    });
    if (!before) throw new DomainError("NOT_FOUND", "Alan bulunamadı");
    if (before._count.tables > 0) {
      throw new DomainError("CONFLICT", "Bu alana bağlı masalar var; önce masaları başka bir alana taşıyın");
    }
    await tx.outletAreaDefinition.delete({ where: { id } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "OUTLET_AREA_DELETE",
      entity: "OutletAreaDefinition",
      entityId: id,
      before: toRow(before),
    });
    await publishDefinition(tx, { hotelId, entity: "outletArea", id, op: "delete" });
  });
}
