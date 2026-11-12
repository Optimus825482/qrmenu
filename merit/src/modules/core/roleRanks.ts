import type { RoleKind } from "@/generated/prisma/client";

/*
 * Who manages whom (12 Kas 2026). Screen rights say WHAT a role may do (`CR-KUL` = user management); this file
 * says ON WHOM. The chain is F&B Müdürü > F&B Müdür Yardımcısı > Oda Servisi Sorumlusu > field roles.
 *
 * Rules, for an actor that is not a SISTEM role (SISTEM is unrestricted):
 *   - a SISTEM role or user is never reachable;
 *   - a YONETIM role or user is reachable only when the actor's row in MANAGED_MANAGERS names it, so nobody
 *     manages their own rank or the rank above (a role never lists itself);
 *   - a department head (TEAM_ROLES) reaches only the roles of its own team, whatever their kind;
 *   - every other role (OUTLET, MUTFAK, MINIBAR kinds) is reachable by any holder of the screen right, as before.
 *
 * A custom role created by the system administrator has no row here: a YONETIM-kind one stays SISTEM-only.
 */

/** Management roles a manager may assign and whose users it may edit, reset or deactivate. */
export const MANAGED_MANAGERS: Readonly<Record<string, readonly string[]>> = {
  "R-FBM": ["R-FBY", "R-OSS", "R-MTY", "R-QMY"],
  "R-FBY": ["R-OSS", "R-MTY", "R-QMY"],
};

/** Department heads: the complete list of roles they manage. Nothing outside it, including other field roles. */
export const TEAM_ROLES: Readonly<Record<string, readonly string[]>> = {
  // Minibar takip garsonu, depo, izleme and oda servisi personeli.
  "R-OSS": ["R-KAT", "R-DEP", "R-HKS", "R-ODS"],
};

export type RankActor = { roleKind: RoleKind; roleCode: string };
export type RankRole = { kind: RoleKind; code: string };

/** May `actor` assign `role`, or manage a user who holds it? See the rules above. */
export function mayManageRole(actor: RankActor, role: RankRole): boolean {
  if (actor.roleKind === "SISTEM") return true;
  if (role.kind === "SISTEM") return false;
  const team = TEAM_ROLES[actor.roleCode];
  if (team) return team.includes(role.code);
  if (role.kind === "YONETIM") return (MANAGED_MANAGERS[actor.roleCode] ?? []).includes(role.code);
  return true;
}
