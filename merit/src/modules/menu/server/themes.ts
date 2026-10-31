import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan, can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";
import {
  parseInput,
  publishDefinition,
  uniqueConflictFromPrisma,
  withAdminTx,
} from "@/modules/core/server/admin/crud";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope } from "./menuNodeAccess";

const SCREEN = "QM-TEM";
const NAME_TAKEN = "Bu adda bir tema zaten var";

export type ThemeRow = {
  id: string;
  name: string;
  bg: string;
  accent: string;
  soft: string;
  textOnAccent: string;
  isDefault: boolean;
  outletCount: number;
};

const SELECT = {
  id: true,
  name: true,
  bg: true,
  accent: true,
  soft: true,
  textOnAccent: true,
  isDefault: true,
  _count: { select: { outlets: true } },
} satisfies Prisma.MenuThemeSelect;

const toRow = ({ _count, ...theme }: Prisma.MenuThemeGetPayload<{ select: typeof SELECT }>): ThemeRow => ({
  ...theme,
  outletCount: _count.outlets,
});

const color = (label: string) =>
  z
    .string(`${label} gerekli`)
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, `${label} #rrggbb biçiminde olmalı`)
    .transform((v) => v.toLowerCase());

const themeSchema = z.object({
  name: z.string("Ad gerekli").trim().min(1, "Ad gerekli").max(60, "Ad en fazla 60 karakter olabilir"),
  bg: color("Arka plan rengi"),
  accent: color("Vurgu rengi"),
  soft: color("Yumuşak renk"),
  textOnAccent: color("Vurgu üstü yazı rengi"),
});
export type ThemeInput = z.input<typeof themeSchema>;

export async function list(ctx: Ctx): Promise<ThemeRow[]> {
  await assertCan(ctx, SCREEN, "V");
  const rows = await prisma.menuTheme.findMany({
    select: SELECT,
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}

/** Tells guest pages of the matching outlets to reload (theme colors changed). */
async function notifyOutlets(tx: Prisma.TransactionClient, where: Prisma.OutletWhereInput): Promise<void> {
  const outlets = await tx.outlet.findMany({ where, select: { id: true, hotelId: true } });
  for (const o of outlets) {
    await publish({ type: "menu.changed", hotelId: o.hotelId, outletId: o.id, payload: { op: "theme" } }, tx);
  }
}

export async function create(ctx: Ctx, raw: ThemeInput): Promise<ThemeRow> {
  const input = parseInput(themeSchema, raw);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "O" }, async (tx) => {
      const row = toRow(await tx.menuTheme.create({ data: input, select: SELECT }));
      await audit(tx, {
        userId: ctx.user.id,
        action: "THEME_CREATE",
        entity: "MenuTheme",
        entityId: row.id,
        after: input,
      });
      await publishDefinition(tx, { entity: "menuTheme", id: row.id, op: "create" });
      return row;
    });
  } catch (error) {
    uniqueConflictFromPrisma(error, NAME_TAKEN);
  }
}

export async function update(ctx: Ctx, id: string, raw: ThemeInput): Promise<ThemeRow> {
  const input = parseInput(themeSchema, raw);
  try {
    return await withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
      const before = await tx.menuTheme.findUnique({ where: { id }, select: SELECT });
      if (!before) throw new DomainError("NOT_FOUND", "Tema bulunamadı");
      const row = toRow(await tx.menuTheme.update({ where: { id }, data: input, select: SELECT }));
      await audit(tx, {
        userId: ctx.user.id,
        action: "THEME_UPDATE",
        entity: "MenuTheme",
        entityId: id,
        before: toRow(before),
        after: row,
      });
      await publishDefinition(tx, { entity: "menuTheme", id, op: "update" });
      await notifyOutlets(tx, row.isDefault ? { OR: [{ themeId: id }, { themeId: null }] } : { themeId: id });
      return row;
    });
  } catch (error) {
    uniqueConflictFromPrisma(error, NAME_TAKEN);
  }
}

/** Single transaction: the chosen theme becomes the only default. */
export async function setDefault(ctx: Ctx, id: string): Promise<ThemeRow> {
  return withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
    const found = await tx.menuTheme.findUnique({ where: { id }, select: { id: true, isDefault: true } });
    if (!found) throw new DomainError("NOT_FOUND", "Tema bulunamadı");
    if (!found.isDefault) {
      await tx.menuTheme.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      await tx.menuTheme.update({ where: { id }, data: { isDefault: true } });
      await audit(tx, {
        userId: ctx.user.id,
        action: "THEME_SET_DEFAULT",
        entity: "MenuTheme",
        entityId: id,
      });
      await publishDefinition(tx, { entity: "menuTheme", id, op: "update" });
      await notifyOutlets(tx, { themeId: null });
    }
    return toRow(await tx.menuTheme.findUniqueOrThrow({ where: { id }, select: SELECT }));
  });
}

export async function remove(ctx: Ctx, id: string): Promise<void> {
  await withAdminTx(ctx, { screen: SCREEN, action: "D" }, async (tx) => {
    const before = await tx.menuTheme.findUnique({ where: { id }, select: SELECT });
    if (!before) throw new DomainError("NOT_FOUND", "Tema bulunamadı");
    if (before.isDefault) throw new DomainError("FORBIDDEN", "Varsayılan tema silinemez");
    if (before._count.outlets > 0) {
      throw new DomainError("CONFLICT", "Tema bir veya daha fazla outlet tarafından kullanılıyor");
    }
    await tx.menuTheme.delete({ where: { id } });
    await audit(tx, {
      userId: ctx.user.id,
      action: "THEME_DELETE",
      entity: "MenuTheme",
      entityId: id,
      before: toRow(before),
    });
    await publishDefinition(tx, { entity: "menuTheme", id, op: "delete" });
  });
}

/** Sets (or clears, `null` = system default) the guest theme of one outlet. QM-TEM D or QM-MEN D. */
export async function assign(ctx: Ctx, outletId: string, themeId: string | null): Promise<void> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  const { hotelId } = outlet;
  assertOutletScope(ctx, outletId);
  const screen = (await can(ctx, SCREEN, "D", hotelId)) ? SCREEN : "QM-MEN";
  await withAdminTx(ctx, { screen, action: "D", hotelId }, async (tx) => {
    if (themeId !== null && !(await tx.menuTheme.findUnique({ where: { id: themeId }, select: { id: true } }))) {
      throw new DomainError("NOT_FOUND", "Tema bulunamadı");
    }
    const before = await tx.outlet.findFirst({ where: { id: outletId, hotelId }, select: { themeId: true } });
    if (!before) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
    await tx.outlet.update({ where: { id: outletId }, data: { themeId } });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "OUTLET_THEME_ASSIGN",
      entity: "Outlet",
      entityId: outletId,
      before: { themeId: before.themeId },
      after: { themeId },
    });
    await publish({ type: "menu.changed", hotelId, outletId, payload: { op: "theme" } }, tx);
    await publishDefinition(tx, { hotelId, entity: "outlet", id: outletId, op: "update" });
  });
}

export type AssignTarget = {
  hotelId: string;
  hotelName: string;
  outlets: { id: string; name: string; themeId: string | null }[];
};

/** Hotels (with their menu outlets) whose outlet theme the user may set; outlet sessions see their own outlet only. */
export async function assignTargets(ctx: Ctx): Promise<AssignTarget[]> {
  await assertCan(ctx, SCREEN, "V");
  const result: AssignTarget[] = [];
  const hotels = await prisma.hotel.findMany({
    where: { id: { in: ctx.hotelIds }, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  for (const hotel of hotels) {
    if (!(await can(ctx, SCREEN, "D", hotel.id)) && !(await can(ctx, "QM-MEN", "D", hotel.id))) continue;
    const outlets = await prisma.outlet.findMany({
      where: {
        hotelId: hotel.id,
        hasMenu: true,
        isActive: true,
        ...(ctx.session.outletId ? { id: ctx.session.outletId } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, themeId: true },
    });
    if (outlets.length > 0) result.push({ hotelId: hotel.id, hotelName: hotel.name, outlets });
  }
  return result;
}
