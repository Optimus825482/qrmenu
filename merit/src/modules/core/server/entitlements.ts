import type { ModuleKey, OutletType, Prisma, RoleKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The shared entitlement model (spec §4.1–4.2): which hotels a user works in, which role they act
 * with at an outlet, and whether a module is open to a role in a hotel. Login targets
 * (targets.ts), session re-validation (auth.ts) and role-addressed notifications (notifications.ts)
 * all resolve entitlements through these helpers so they cannot drift apart.
 */

type Db = Prisma.TransactionClient;

export type ScopeUser = { id: string; hotelId: string | null; role: { kind: RoleKind } };

const HOTEL_ORDER = [
  { isSystemDefault: "desc" },
  { createdAt: "asc" },
  { code: "asc" },
] satisfies Prisma.HotelOrderByWithRelationInput[];

/**
 * Active hotels a user may work in with their base role: `User.hotelId` ∪ `UserHotel`, system
 * default hotels first. SISTEM roles see every active hotel.
 */
export async function hotelScope(user: ScopeUser, db: Db = prisma) {
  if (user.role.kind === "SISTEM") {
    return db.hotel.findMany({ where: { isActive: true }, orderBy: HOTEL_ORDER });
  }
  const links = await db.userHotel.findMany({
    where: { userId: user.id },
    select: { hotelId: true },
  });
  const ids = new Set(links.map((l) => l.hotelId));
  if (user.hotelId) ids.add(user.hotelId);
  return db.hotel.findMany({
    where: { isActive: true, id: { in: [...ids] } },
    orderBy: HOTEL_ORDER,
  });
}

/** The role a user acts with at an outlet: the membership's override, else their base role. */
export function outletRoleId(member: { roleId: string | null }, user: { roleId: string }): string {
  return member.roleId ?? user.roleId;
}

/** The staff modules an outlet exposes: room service, or QR menu / QR ordering by its flags. */
export function outletModules(outlet: {
  type: OutletType;
  hasMenu: boolean;
  hasOrdering: boolean;
}): ModuleKey[] {
  if (outlet.type === "ODA_SERVISI") return ["ROOM_SERVICE"];
  const modules: ModuleKey[] = [];
  if (outlet.hasMenu) modules.push("QR_MENU");
  if (outlet.hasOrdering) modules.push("QR_ORDER");
  return modules;
}

/** Module gates for a set of roles × hotels, loaded in two queries. */
export type ModuleGates = {
  /** `HotelModule(hotel, module).enabled` and `RoleModuleAccess(role, hotel ?? null, module).enabled`. */
  isOpen(roleId: string, hotelId: string, moduleKey: ModuleKey): boolean;
};

export async function loadModuleGates(
  roleIds: string[],
  hotelIds: string[],
  db: Db = prisma,
): Promise<ModuleGates> {
  const [hotelRows, accessRows] = await Promise.all([
    db.hotelModule.findMany({ where: { hotelId: { in: hotelIds } } }),
    db.roleModuleAccess.findMany({
      where: { roleId: { in: roleIds }, OR: [{ hotelId: null }, { hotelId: { in: hotelIds } }] },
    }),
  ]);
  const hotelOn = new Map(hotelRows.map((r) => [`${r.hotelId}|${r.moduleKey}`, r.enabled]));
  const access = new Map(
    accessRows.map((r) => [`${r.roleId}|${r.hotelId ?? ""}|${r.moduleKey}`, r.enabled]),
  );
  return {
    isOpen(roleId, hotelId, moduleKey) {
      // CORE is implicit: no HotelModule row, always on.
      if (moduleKey === "CORE") return true;
      if (hotelOn.get(`${hotelId}|${moduleKey}`) !== true) return false;
      // Hotel row first, system-wide row second (same rule as rbac.ts).
      const enabled =
        access.get(`${roleId}|${hotelId}|${moduleKey}`) ?? access.get(`${roleId}||${moduleKey}`);
      return enabled === true;
    },
  };
}

/**
 * Active users whose EFFECTIVE role for `hotelId` is one of `roleCodes`:
 * - their base role, when the hotel is in their base scope (`User.hotelId` ∪ `UserHotel`; every
 *   hotel for SISTEM roles, as in hotelScope) and no active membership in the hotel overrides it, or
 * - `OutletMember.roleId ?? base role`, for an active membership in an active outlet of the hotel.
 * Ids are unique and sorted.
 */
export async function usersEntitledTo(
  hotelId: string,
  roleCodes: string[],
  db: Db = prisma,
): Promise<string[]> {
  if (roleCodes.length === 0) return [];
  const inRoles = { code: { in: roleCodes } };
  // An active membership in an active outlet of this hotel.
  const hotelMembership = { isActive: true, outlet: { hotelId, isActive: true } };
  const users = await db.user.findMany({
    where: {
      isActive: true,
      OR: [
        {
          role: inRoles,
          OR: [{ hotelId }, { userHotels: { some: { hotelId } } }, { role: { kind: "SISTEM" } }],
          // A membership override REPLACES the base role in this hotel: the base role counts
          // only when no active membership here overrides it (a mix is resolved by the second
          // branch, per membership).
          NOT: { outletMemberships: { some: { ...hotelMembership, roleId: { not: null } } } },
        },
        {
          outletMemberships: {
            some: {
              ...hotelMembership,
              OR: [{ role: inRoles }, { roleId: null, user: { role: inRoles } }],
            },
          },
        },
      ],
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return users.map((u) => u.id);
}
