import { z } from "zod";
import type { OutletType } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";
import { assertOutletScope } from "./menuNodeAccess";

export type OutletSwitches = {
  id: string;
  hotelId: string;
  orderingEnabled: boolean;
  priceDisplay: "INHERIT" | "SHOW" | "HIDE";
  tableOccupancyMinutes?: number | null;
};

const priceSchema = z.enum(["INHERIT", "SHOW", "HIDE"], "Geçersiz fiyat gösterimi");
const occupancySchema = z.union([z.number().int().min(10).max(60), z.literal(0), z.null()]);

async function outletInfo(outletId: string): Promise<{ id: string; hotelId: string; type: OutletType }> {
  const found = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, hotelId: true, type: true },
  });
  if (!found) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  return found;
}

/** QM-MEN D, CR-TAN D or QS-KAS D is enough; for ODA_SERVISI, RO-TAL A is also allowed; when none holds, the QM-MEN denial is raised (and audited). */
async function authorize(ctx: Ctx, hotelId: string, outletType?: OutletType): Promise<void> {
  if (await can(ctx, "QM-MEN", "D", hotelId)) return;
  if (await can(ctx, "CR-TAN", "D", hotelId)) return;
  if (await can(ctx, "QS-KAS", "D", hotelId)) return;
  if (outletType === "ODA_SERVISI" && (await can(ctx, "RO-TAL", "A", hotelId))) return;
  await assertCan(ctx, "QM-MEN", "D", hotelId);
}

const SELECT = { id: true, hotelId: true, orderingEnabled: true, priceDisplay: true } as const;

/** Opens / closes ordering of an outlet; publishes `ordering.changed` so guest pages follow at once. */
export async function setOrderingEnabled(
  ctx: Ctx,
  outletId: string,
  enabled: boolean,
): Promise<OutletSwitches> {
  const outlet = await outletInfo(outletId);
  await authorize(ctx, outlet.hotelId, outlet.type);
  assertOutletScope(ctx, outletId);
  return prisma.$transaction(async (tx) => {
    const before = await tx.outlet.findFirst({
      where: { id: outletId, hotelId: outlet.hotelId },
      select: { ...SELECT, hasOrdering: true },
    });
    if (!before) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
    if (!before.hasOrdering) throw new DomainError("CONFLICT", "Bu outlette sipariş modülü yok");
    if (before.orderingEnabled === enabled) return before;
    const after = await tx.outlet.update({ where: { id: outletId }, data: { orderingEnabled: enabled }, select: SELECT });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: outlet.hotelId,
      action: enabled ? "OUTLET_ORDERING_ON" : "OUTLET_ORDERING_OFF",
      entity: "Outlet",
      entityId: outletId,
      before: { orderingEnabled: before.orderingEnabled },
      after: { orderingEnabled: enabled },
    });
    await publish({ type: "ordering.changed", hotelId: outlet.hotelId, outletId, payload: { enabled } }, tx);
    return after;
  });
}

export async function setPriceDisplay(
  ctx: Ctx,
  outletId: string,
  value: "INHERIT" | "SHOW" | "HIDE",
): Promise<OutletSwitches> {
  const parsed = priceSchema.safeParse(value);
  if (!parsed.success) throw fromZod(parsed.error);
  const outlet = await outletInfo(outletId);
  await authorize(ctx, outlet.hotelId, outlet.type);
  assertOutletScope(ctx, outletId);
  return prisma.$transaction(async (tx) => {
    const before = await tx.outlet.findFirst({ where: { id: outletId, hotelId: outlet.hotelId }, select: SELECT });
    if (!before) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
    if (before.priceDisplay === parsed.data) return before;
    const after = await tx.outlet.update({ where: { id: outletId }, data: { priceDisplay: parsed.data }, select: SELECT });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: outlet.hotelId,
      action: "OUTLET_PRICE_DISPLAY",
      entity: "Outlet",
      entityId: outletId,
      before: { priceDisplay: before.priceDisplay },
      after: { priceDisplay: parsed.data },
    });
    await publish({ type: "price.display", hotelId: outlet.hotelId, outletId }, tx);
    return after;
  });
}

/** Configures table inactivity / auto-occupancy timeout in minutes (10..60), or null/0 to disable. */
export async function setTableOccupancyMinutes(
  ctx: Ctx,
  outletId: string,
  value: number | null,
): Promise<{ id: string; hotelId: string; tableOccupancyMinutes: number | null }> {
  const parsed = occupancySchema.safeParse(value);
  if (!parsed.success) throw fromZod(parsed.error);
  const normalized = parsed.data === 0 ? null : parsed.data;
  const outlet = await outletInfo(outletId);
  await authorize(ctx, outlet.hotelId, outlet.type);
  assertOutletScope(ctx, outletId);
  return prisma.$transaction(async (tx) => {
    const before = await tx.outlet.findFirst({
      where: { id: outletId, hotelId: outlet.hotelId },
      select: { id: true, hotelId: true, tableOccupancyMinutes: true },
    });
    if (!before) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
    if (before.tableOccupancyMinutes === normalized) return before;
    const after = await tx.outlet.update({
      where: { id: outletId },
      data: { tableOccupancyMinutes: normalized },
      select: { id: true, hotelId: true, tableOccupancyMinutes: true },
    });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId: outlet.hotelId,
      action: "OUTLET_TABLE_OCCUPANCY",
      entity: "Outlet",
      entityId: outletId,
      before: { tableOccupancyMinutes: before.tableOccupancyMinutes },
      after: { tableOccupancyMinutes: normalized },
    });
    await publish(
      { type: "table.occupancy", hotelId: outlet.hotelId, outletId, payload: { minutes: normalized } },
      tx,
    );
    return after;
  });
}
