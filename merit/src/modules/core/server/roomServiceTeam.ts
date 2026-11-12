import type { Prisma } from "@/generated/prisma/client";
import { publishDefinition } from "@/modules/core/server/admin/crud";
import { audit } from "@/modules/core/server/audit";
import { hotelScope, loadModuleGates } from "@/modules/core/server/entitlements";

/** Staff screens of the room-service outlet; viewing any of them means the role works there. */
const ROOM_SERVICE_SCREENS = ["RO-TAL", "RO-TEL", "RO-TES"];

/**
 * A hotel has one room-service outlet, so a user whose role opens a room-service screen does not
 * need a separate team assignment: they join that outlet's team here. Narrow on purpose:
 * - only OUTLET roles (SISTEM/YONETIM reach the screens through the admin target, MUTFAK works on a kitchen),
 * - only in a hotel where the user has no outlet membership at all, active or not: someone already
 *   placed in a team (or removed from one on purpose) keeps exactly what an administrator gave them,
 * - only when the ROOM_SERVICE module is on for the hotel and open to the role.
 * Returns the ids of the outlets the user was added to. `actorId` is who caused it (audit).
 */
export async function ensureRoomServiceMembership(
  tx: Prisma.TransactionClient,
  userId: string,
  actorId: string = userId,
): Promise<string[]> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true, hotelId: true, roleId: true, role: { select: { kind: true } } },
  });
  if (!user || !user.isActive || user.role.kind !== "OUTLET") return [];

  const hotels = await hotelScope(user, tx);
  if (hotels.length === 0) return [];
  const hotelIds = hotels.map((h) => h.id);

  // One at a time: the queries share the transaction's single connection.
  const outlets = await tx.outlet.findMany({
    where: { hotelId: { in: hotelIds }, type: "ODA_SERVISI", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, hotelId: true },
  });
  const screens = await tx.appScreen.findMany({
    where: { code: { in: ROOM_SERVICE_SCREENS }, isActive: true },
    select: { id: true },
  });
  if (screens.length === 0 || outlets.length === 0) return [];
  const permissions = await tx.roleScreenPermission.findMany({
    where: { roleId: user.roleId, screenId: { in: screens.map((s) => s.id) }, OR: [{ hotelId: null }, { hotelId: { in: hotelIds } }] },
    select: { screenId: true, hotelId: true, canView: true },
  });
  /** Hotel row first, system-wide row second (same rule as rbac.ts). */
  const canView = (hotelId: string): boolean =>
    screens.some((screen) => {
      const rows = permissions.filter((p) => p.screenId === screen.id);
      const row = rows.find((p) => p.hotelId === hotelId) ?? rows.find((p) => p.hotelId === null);
      return row?.canView === true;
    });
  const gates = await loadModuleGates([user.roleId], hotelIds, tx);
  const existing = await tx.outletMember.findMany({
    where: { userId, outlet: { hotelId: { in: hotelIds } } },
    select: { outlet: { select: { hotelId: true } } },
  });
  const placed = new Set(existing.map((m) => m.outlet.hotelId));

  const added: string[] = [];
  for (const hotelId of hotelIds) {
    if (placed.has(hotelId)) continue;
    const outlet = outlets.find((o) => o.hotelId === hotelId);
    if (!outlet || !gates.isOpen(user.roleId, hotelId, "ROOM_SERVICE") || !canView(hotelId)) continue;
    const member = await tx.outletMember.create({
      data: { userId, outletId: outlet.id },
      select: { id: true, userId: true, outletId: true, isActive: true },
    });
    await audit(tx, {
      userId: actorId,
      hotelId,
      action: "MEMBER_ASSIGN",
      entity: "OutletMember",
      entityId: member.id,
      after: { ...member, auto: "ROOM_SERVICE" },
    });
    await publishDefinition(tx, { hotelId, entity: "member", id: member.id, op: "create" });
    added.push(outlet.id);
  }
  return added;
}
