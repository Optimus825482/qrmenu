import { z } from "zod";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";
import { assertCan, can } from "@/lib/rbac";
import { DomainError, fromZod } from "@/lib/result";
import { audit } from "@/modules/core/server/audit";

export type OutletSwitches = {
  id: string;
  hotelId: string;
  orderingEnabled: boolean;
  priceDisplay: "INHERIT" | "SHOW" | "HIDE";
};

const priceSchema = z.enum(["INHERIT", "SHOW", "HIDE"], "Geçersiz fiyat gösterimi");

async function hotelOf(outletId: string): Promise<string> {
  const found = await prisma.outlet.findUnique({ where: { id: outletId }, select: { hotelId: true } });
  if (!found) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  return found.hotelId;
}

/** QM-MEN D, CR-TAN D or QS-KAS D is enough; when none holds, the QM-MEN denial is raised (and audited). */
async function authorize(ctx: Ctx, hotelId: string): Promise<void> {
  if (await can(ctx, "QM-MEN", "D", hotelId)) return;
  if (await can(ctx, "CR-TAN", "D", hotelId)) return;
  if (await can(ctx, "QS-KAS", "D", hotelId)) return;
  await assertCan(ctx, "QM-MEN", "D", hotelId);
}

const SELECT = { id: true, hotelId: true, orderingEnabled: true, priceDisplay: true } as const;

/** Opens / closes ordering of an outlet; publishes `ordering.changed` so guest pages follow at once. */
export async function setOrderingEnabled(
  ctx: Ctx,
  outletId: string,
  enabled: boolean,
): Promise<OutletSwitches> {
  const hotelId = await hotelOf(outletId);
  await authorize(ctx, hotelId);
  return prisma.$transaction(async (tx) => {
    const before = await tx.outlet.findFirst({
      where: { id: outletId, hotelId },
      select: { ...SELECT, hasOrdering: true },
    });
    if (!before) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
    if (!before.hasOrdering) throw new DomainError("CONFLICT", "Bu outlette sipariş modülü yok");
    if (before.orderingEnabled === enabled) return before;
    const after = await tx.outlet.update({ where: { id: outletId }, data: { orderingEnabled: enabled }, select: SELECT });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: enabled ? "OUTLET_ORDERING_ON" : "OUTLET_ORDERING_OFF",
      entity: "Outlet",
      entityId: outletId,
      before: { orderingEnabled: before.orderingEnabled },
      after: { orderingEnabled: enabled },
    });
    await publish({ type: "ordering.changed", hotelId, outletId, payload: { enabled } }, tx);
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
  const hotelId = await hotelOf(outletId);
  await authorize(ctx, hotelId);
  return prisma.$transaction(async (tx) => {
    const before = await tx.outlet.findFirst({ where: { id: outletId, hotelId }, select: SELECT });
    if (!before) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
    if (before.priceDisplay === parsed.data) return before;
    const after = await tx.outlet.update({ where: { id: outletId }, data: { priceDisplay: parsed.data }, select: SELECT });
    await audit(tx, {
      userId: ctx.user.id,
      hotelId,
      action: "OUTLET_PRICE_DISPLAY",
      entity: "Outlet",
      entityId: outletId,
      before: { priceDisplay: before.priceDisplay },
      after: { priceDisplay: parsed.data },
    });
    await publish({ type: "price.display", hotelId, outletId }, tx);
    return after;
  });
}
