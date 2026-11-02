import type { MenuNodeKind, OutletType } from "@/generated/prisma/client";
import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";

export type NodeScope = {
  id: string;
  outletId: string;
  hotelId: string;
  outletType: OutletType;
  parentId: string | null;
  kind: MenuNodeKind;
  imageUrl: string | null;
};

/** Outlet-scoped sessions (waiters, cashiers...) only touch the menu of their session outlet. */
export function assertOutletScope(ctx: Ctx, outletId: string): void {
  if (ctx.user.roleKind === "OUTLET" && ctx.session.outletId !== outletId) {
    throw new DomainError("FORBIDDEN", "Bu outletin menüsüne erişiminiz yok");
  }
  if (ctx.session.outletId && ctx.session.outletId !== outletId) {
    throw new DomainError("FORBIDDEN", "Bu outletin menüsüne erişiminiz yok");
  }
}

export async function outletScope(outletId: string): Promise<{ id: string; hotelId: string; type: OutletType }> {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { id: true, hotelId: true, type: true },
  });
  if (!outlet) throw new DomainError("NOT_FOUND", "Outlet bulunamadı");
  return outlet;
}

export async function outletHotel(outletId: string): Promise<string> {
  const outlet = await outletScope(outletId);
  return outlet.hotelId;
}

export async function loadNodeScope(nodeId: string): Promise<NodeScope> {
  const node = await prisma.menuNode.findUnique({
    where: { id: nodeId },
    select: {
      id: true,
      outletId: true,
      parentId: true,
      kind: true,
      imageUrl: true,
      outlet: { select: { hotelId: true, type: true } },
    },
  });
  if (!node) throw new DomainError("NOT_FOUND", "Menü öğesi bulunamadı");
  const { outlet, ...rest } = node;
  return { ...rest, hotelId: outlet.hotelId, outletType: outlet.type };
}
