import type { RoleKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type Target = {
  kind: "OUTLET" | "MINIBAR" | "ADMIN";
  hotelId: string;
  hotelName: string;
  outletId?: string;
  label: string;
  roleId: string;
};

type ScopeUser = { id: string; hotelId: string | null; role: { kind: RoleKind } };

/** Active hotels a user may work in, system default hotels first. SISTEM roles see every hotel. */
export async function hotelScope(user: ScopeUser) {
  if (user.role.kind === "SISTEM") {
    return prisma.hotel.findMany({
      where: { isActive: true },
      orderBy: [{ isSystemDefault: "desc" }, { createdAt: "asc" }, { code: "asc" }],
    });
  }
  const links = await prisma.userHotel.findMany({
    where: { userId: user.id },
    select: { hotelId: true },
  });
  const ids = new Set(links.map((l) => l.hotelId));
  if (user.hotelId) ids.add(user.hotelId);
  return prisma.hotel.findMany({
    where: { isActive: true, id: { in: [...ids] } },
    orderBy: [{ isSystemDefault: "desc" }, { createdAt: "asc" }, { code: "asc" }],
  });
}

/**
 * The places a user can start a session in: their active outlet memberships, one Minibar target
 * per hotel for MINIBAR roles, and a single admin-panel target for SISTEM/YONETIM roles.
 * Order is deterministic (ADMIN, OUTLET by hotel then outlet name, MINIBAR) because
 * selectTargetAction picks by index.
 */
export async function listTargets(userId: string): Promise<Target[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!user || !user.isActive) return [];

  const targets: Target[] = [];

  if (user.role.kind === "SISTEM" || user.role.kind === "YONETIM") {
    const scope = await hotelScope(user);
    const hotel = scope.find((h) => h.id === user.hotelId) ?? scope[0];
    if (hotel) {
      targets.push({
        kind: "ADMIN",
        hotelId: hotel.id,
        hotelName: hotel.name,
        label: `Yönetim · ${hotel.name}`,
        roleId: user.roleId,
      });
    }
  }

  const memberships = await prisma.outletMember.findMany({
    where: { userId, isActive: true, outlet: { isActive: true, hotel: { isActive: true } } },
    include: { outlet: { include: { hotel: true } } },
    orderBy: [{ outlet: { hotel: { name: "asc" } } }, { outlet: { name: "asc" } }],
  });
  for (const m of memberships) {
    targets.push({
      kind: "OUTLET",
      hotelId: m.outlet.hotelId,
      hotelName: m.outlet.hotel.name,
      outletId: m.outletId,
      label: `${m.outlet.name} · ${m.outlet.hotel.name}`,
      roleId: m.roleId ?? user.roleId,
    });
  }

  if (user.role.kind === "MINIBAR") {
    const scope = await hotelScope(user);
    for (const hotel of scope) {
      targets.push({
        kind: "MINIBAR",
        hotelId: hotel.id,
        hotelName: hotel.name,
        label: `Minibar · ${hotel.name}`,
        roleId: user.roleId,
      });
    }
  }

  return targets;
}
