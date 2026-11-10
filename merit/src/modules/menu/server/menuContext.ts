import type { OutletType } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";

export type MenuOutletInfo = {
  id: string;
  name: string;
  type: OutletType;
  hasOrdering: boolean;
  orderingEnabled: boolean;
  priceDisplay: "INHERIT" | "SHOW" | "HIDE";
  /** The outlet's own currency (K3: set on the outlet, no global setting). */
  currency: string;
  tableCount?: number;
  areaCount?: number;
};

export type MenuContext = {
  hotelName: string;
  /** May edit the tree (QM-MEN D or RO-TAL D). */
  canEdit: boolean;
  /** May flip the ordering / price switches (QM-MEN D, CR-TAN D or RO-TAL A). */
  canSwitch: boolean;
  /** Outlet sessions are bound to their own outlet: the picker is hidden. */
  fixedOutlet: boolean;
  outlets: MenuOutletInfo[];
};

/** Menu outlets of a hotel for the Menü Yönetimi window and what the user may do there. */
export async function menuContext(ctx: Ctx, hotelId: string): Promise<MenuContext> {
  const canMenV = await can(ctx, "QM-MEN", "V", hotelId);
  const canRsV = await can(ctx, "RO-TAL", "V", hotelId);
  if (!canMenV && !canRsV) {
    await assertCan(ctx, "QM-MEN", "V", hotelId);
  }
  if (!ctx.hotelIds.includes(hotelId)) throw new DomainError("FORBIDDEN", "Bu otele erişiminiz yok");

  const canEdit =
    (await can(ctx, "QM-MEN", "D", hotelId)) ||
    (canRsV && (await can(ctx, "RO-TAL", "D", hotelId)));
  const canSwitch =
    canEdit ||
    (await can(ctx, "CR-TAN", "D", hotelId)) ||
    (canRsV && (await can(ctx, "RO-TAL", "A", hotelId)));

  const [hotel, outlets] = await Promise.all([
    prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true } }),
    prisma.outlet.findMany({
      where: {
        hotelId,
        hasMenu: true,
        isActive: true,
        ...(ctx.session.outletId ? { id: ctx.session.outletId } : {}),
        ...(!canMenV && canRsV ? { type: "ODA_SERVISI" as const } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        hasOrdering: true,
        orderingEnabled: true,
        priceDisplay: true,
        currency: true,
        _count: {
          select: {
            tables: true,
            areas: true,
          },
        },
      },
    }),
  ]);
  return {
    hotelName: hotel?.name ?? "Otel",
    canEdit,
    canSwitch,
    fixedOutlet: Boolean(ctx.session.outletId),
    outlets: outlets.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      hasOrdering: o.hasOrdering,
      orderingEnabled: o.orderingEnabled,
      priceDisplay: o.priceDisplay,
      currency: o.currency,
      tableCount: o._count?.tables ?? 0,
      areaCount: o._count?.areas ?? 0,
    })),
  };
}
