import { prisma } from "@/lib/prisma";
import {
  hotelScope,
  loadModuleGates,
  outletModules,
  outletRoleId,
} from "@/modules/core/server/entitlements";

export type Target = {
  kind: "OUTLET" | "MINIBAR" | "ADMIN";
  hotelId: string;
  hotelName: string;
  hotelCode: string;
  outletId?: string;
  label: string;
  roleId: string;
};

/**
 * The places a user can start a session in: their active outlet memberships, one Minibar target
 * per hotel for MINIBAR roles, and a single admin-panel target for SISTEM/YONETIM roles.
 * Module gates apply: a MINIBAR target needs the MINIBAR module on for the hotel and open to the
 * role; an OUTLET target needs at least one module the outlet exposes (outletModules) on for the
 * hotel and open to the effective role. Order is deterministic (ADMIN, OUTLET by hotel then
 * outlet name, MINIBAR) because selectTargetAction picks by index.
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
        hotelCode: hotel.code,
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
  const minibarScope = user.role.kind === "MINIBAR" ? await hotelScope(user) : [];

  const gates = await loadModuleGates(
    [...new Set([user.roleId, ...memberships.map((m) => outletRoleId(m, user))])],
    [...new Set([...memberships.map((m) => m.outlet.hotelId), ...minibarScope.map((h) => h.id)])],
  );

  for (const m of memberships) {
    const roleId = outletRoleId(m, user);
    const open = outletModules(m.outlet).some((mod) => gates.isOpen(roleId, m.outlet.hotelId, mod));
    if (!open) continue;
    targets.push({
      kind: "OUTLET",
      hotelId: m.outlet.hotelId,
      hotelName: m.outlet.hotel.name,
      hotelCode: m.outlet.hotel.code,
      outletId: m.outletId,
      label: `${m.outlet.name} · ${m.outlet.hotel.name}`,
      roleId,
    });
  }

  for (const hotel of minibarScope) {
    if (!gates.isOpen(user.roleId, hotel.id, "MINIBAR")) continue;
    targets.push({
      kind: "MINIBAR",
      hotelId: hotel.id,
      hotelName: hotel.name,
      hotelCode: hotel.code,
      label: `Minibar · ${hotel.name}`,
      roleId: user.roleId,
    });
  }

  return targets;
}
