import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, type Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { can, visibleScreens } from "@/lib/rbac";
import { listTargets } from "@/modules/core/server/targets";
import { buildNav } from "./navModel";
import type { StaffShellProps } from "./StaffShell";

export type StaffShellData = Omit<StaffShellProps, "children">;

/** Minutes before the session end at which the persistent strip appears. */
export const SESSION_WARN_MINUTES = 60;

/** Roles whose navigation is a rail even on a phone-width screen (depot: tables of numbers). */
const RAIL_ROLES = new Set(["R-DEP", "R-HKS"]);

/**
 * Everything the staff shell needs, computed from the session's CURRENT hotel and outlet (so a
 * user who switched hotels, or whose permissions changed, gets the navigation of the new context):
 * names, the role-specific bottom navigation filtered by `visibleScreens`, switchable targets and the session end.
 * Shared by the kat, depo and (ops) layouts (and later Erişimim).
 */
export async function loadStaffShellProps(
  ctx: Ctx,
  pathname: string,
  options: { outletId?: string } = {},
): Promise<StaffShellData> {
  const hotelId = ctx.session.hotelId;
  const outletId = options.outletId ?? ctx.session.outletId;
  const [hotel, outlet, role, session, visible, targets, ordering] = await Promise.all([
    prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true } }),
    outletId ? prisma.outlet.findUnique({ where: { id: outletId }, select: { name: true, hasOrdering: true } }) : null,
    prisma.role.findUnique({ where: { id: ctx.user.roleId }, select: { name: true } }),
    prisma.userSession.findUnique({ where: { id: ctx.session.id }, select: { expiresAt: true } }),
    visibleScreens(ctx, hotelId),
    listTargets(ctx.user.id),
    can(ctx, "QS-KUY", "O", hotelId),
  ]);

  const switchable = targets
    .map((target, index) => ({ target, index }))
    .filter(({ target }) => target.kind === "OUTLET" || target.kind === "MINIBAR");
  const current = switchable.find(({ target }) =>
    target.kind === "OUTLET"
      ? target.outletId === ctx.session.outletId && target.hotelId === hotelId
      : !ctx.session.outletId && target.hotelId === hotelId,
  );

  const nav = buildNav(ctx.user.roleCode, new Set(visible), {
    pathname,
    canCreate: Boolean(outlet?.hasOrdering) && ordering,
  });

  return {
    user: { fullName: ctx.user.fullName, roleCode: ctx.user.roleCode, roleName: role?.name ?? ctx.user.roleCode },
    hotelName: hotel?.name ?? "",
    outletName: outlet?.name,
    nav,
    targets: switchable.map(({ target, index }) => ({ index, label: target.label })),
    currentTargetIndex: current?.index,
    sessionEndsAt: session?.expiresAt.toISOString() ?? null,
    warnMinutes: SESSION_WARN_MINUTES,
    layout: RAIL_ROLES.has(ctx.user.roleCode) ? "rail" : "bottom",
  };
}

/**
 * Session gate of a staff layout: no valid session -> /giris (back to the page afterwards). Also reports
 * whether the page is shown inside an XP window iframe (the shell appends `?font=&theme=`): those render
 * without the staff chrome.
 */
export async function requireStaffLayout(fallbackPath: string): Promise<{ ctx: Ctx; path: string; embedded: boolean }> {
  const path = (await headers()).get("x-merit-current-path") ?? fallbackPath;
  try {
    const ctx = await requireUser();
    const params = new URLSearchParams(path.includes("?") ? path.slice(path.indexOf("?") + 1) : "");
    return { ctx, path, embedded: params.has("font") && params.has("theme") };
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAUTHORIZED") {
      redirect(`/giris?next=${encodeURIComponent(path)}`);
    }
    throw error;
  }
}
