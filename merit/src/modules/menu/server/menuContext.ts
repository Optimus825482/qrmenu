import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCan, can } from "@/lib/rbac";
import { DomainError } from "@/lib/result";

export type MenuOutletInfo = {
  id: string;
  name: string;
  hasOrdering: boolean;
  orderingEnabled: boolean;
  priceDisplay: "INHERIT" | "SHOW" | "HIDE";
  tableCount?: number;
  areaCount?: number;
};

export type MenuContext = {
  hotelName: string;
  /** May edit the tree (QM-MEN D). */
  canEdit: boolean;
  /** May flip the ordering / price switches (QM-MEN D or CR-TAN D). */
  canSwitch: boolean;
  /** Outlet sessions are bound to their own outlet: the picker is hidden. */
  fixedOutlet: boolean;
  outlets: MenuOutletInfo[];
};

/** Menu outlets of a hotel for the Menü Yönetimi window and what the user may do there. */
export async function menuContext(ctx: Ctx, hotelId: string): Promise<MenuContext> {
  await assertCan(ctx, "QM-MEN", "V", hotelId);
  if (!ctx.hotelIds.includes(hotelId)) throw new DomainError("FORBIDDEN", "Bu otele erişiminiz yok");
  const canEdit = await can(ctx, "QM-MEN", "D", hotelId);
  const canSwitch = canEdit || (await can(ctx, "CR-TAN", "D", hotelId));
  const [hotel, outlets] = await Promise.all([
    prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true } }),
    prisma.outlet.findMany({
      where: {
        hotelId,
        hasMenu: true,
        isActive: true,
        ...(ctx.session.outletId ? { id: ctx.session.outletId } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        hasOrdering: true,
        orderingEnabled: true,
        priceDisplay: true,
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
      hasOrdering: o.hasOrdering,
      orderingEnabled: o.orderingEnabled,
      priceDisplay: o.priceDisplay,
      tableCount: o._count?.tables ?? 0,
      areaCount: o._count?.areas ?? 0,
    })),
  };
}
