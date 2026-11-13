import { appsOfFolder } from "./appFolders";
import type { AppDefinition } from "./registry";

/**
 * The apps the desktop, the Start menu and the mobile shell offer one user (`screensByHotel` =
 * visibleScreens per hotel in scope, so per-user exceptions and hotel module switches are already folded in).
 * A program needs its screen in at least one hotel (and its role-code limits, where it has any). An operation
 * folder has no permission of its own: it appears when the user may open at least one program inside it.
 */
export function visibleApps(
  all: readonly AppDefinition[],
  screensByHotel: Record<string, string[]>,
  roleCode: string,
): AppDefinition[] {
  const screens = new Set(Object.values(screensByHotel).flat());
  const isFolder = (a: AppDefinition) => a.id.startsWith("folder.");
  const programs = all.filter(
    (a) =>
      !isFolder(a) &&
      (screens.has(a.screenCode) || a.alwaysForRoleCodes?.includes(roleCode) === true) &&
      (!a.roleCodes || a.roleCodes.includes(roleCode)) &&
      !a.hiddenForRoleCodes?.includes(roleCode),
  );
  const open = new Set(programs.map((a) => a.id));
  // "Genel" programs (Komuta Merkezi, Erişimim) are listed under Sistem but are not a reason to offer that folder.
  const keysFolder = (p: AppDefinition) => open.has(p.id) && p.category !== "GENEL";
  return all.filter((a) =>
    isFolder(a)
      ? !a.hiddenForRoleCodes?.includes(roleCode) && appsOfFolder(a.id, all).some(keysFolder)
      : open.has(a.id),
  );
}
