import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, type Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/result";
import { can, visibleScreens } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { listTargets } from "@/modules/core/server/targets";
import { CLOSED_STATUSES } from "@/modules/order/server/transitions";
import { formFromUserAgent } from "@/shell/deviceForm";
import { buildNav, isRailNav, type NavModel } from "./navModel";
import type { StaffShellProps } from "./StaffShell";

export type StaffShellData = Omit<StaffShellProps, "children">;

/** Minutes before the session end at which the persistent strip appears. */
export const SESSION_WARN_MINUTES = 5;

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
  const [hotel, outlet, role, session, visible, targets, ordering, idleMinutes] = await Promise.all([
    prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true } }),
    outletId ? prisma.outlet.findUnique({ where: { id: outletId }, select: { name: true, hasOrdering: true } }) : null,
    prisma.role.findUnique({ where: { id: ctx.user.roleId }, select: { name: true, kind: true } }),
    prisma.userSession.findUnique({ where: { id: ctx.session.id }, select: { expiresAt: true, lastSeenAt: true } }),
    visibleScreens(ctx, hotelId),
    listTargets(ctx.user.id),
    can(ctx, "QS-KUY", "O", hotelId),
    getSetting("session.idleMinutes", hotelId),
  ]);

  const switchable = targets
    .map((target, index) => ({ target, index }))
    .filter(({ target }) => target.kind === "OUTLET" || target.kind === "MINIBAR");
  const current = switchable.find(({ target }) =>
    target.kind === "OUTLET"
      ? target.outletId === ctx.session.outletId && target.hotelId === hotelId
      : !ctx.session.outletId && target.hotelId === hotelId,
  );

  const nav = buildNav(new Set(visible), {
    pathname,
    canCreate: Boolean(outlet?.hasOrdering) && ordering,
  });
  await badgeRoomService(nav, hotelId);

  const idleCloseAt = session ? new Date(session.lastSeenAt.getTime() + idleMinutes * 60_000) : null;
  const effectiveEndsAt = session
    ? (idleCloseAt && idleCloseAt.getTime() < session.expiresAt.getTime() ? idleCloseAt : session.expiresAt)
    : null;

  return {
    user: { fullName: ctx.user.fullName, roleCode: ctx.user.roleCode, roleName: role?.name ?? ctx.user.roleCode },
    hotelName: hotel?.name ?? "",
    outletName: outlet?.name,
    nav,
    targets: switchable.map(({ target, index }) => ({ index, label: target.label })),
    currentTargetIndex: current?.index,
    sessionEndsAt: effectiveEndsAt?.toISOString() ?? null,
    warnMinutes: SESSION_WARN_MINUTES,
    layout: isRailNav(new Set(visible), pathname) ? "rail" : "bottom",
    profileExtras: [
      // A manager's home is the management desktop; a floor screen opened from a notification or the
      // personel app has no other way back to it.
      ...(role?.kind === "SISTEM" || role?.kind === "YONETIM"
        ? [{ id: "ana-ekran", label: "Ana ekran", icon: "home" as const, href: "/admin" }]
        : []),
      // Whoever records room checks may arrange the products of that screen for themselves.
      ...(visible.includes("MB-TUK")
        ? [{ id: "urun-siralamasi", label: "Oda kontrol ürün sıralaması", icon: "list" as const, href: "/kat/urun-siralamasi" }]
        : []),
    ],
    formHint: formFromUserAgent((await headers()).get("user-agent")),
    // Anlık Durum follows the permission matrix (CR-DUR); its rows follow the other screens of the list.
    liveStatusScreens: visible.includes("CR-DUR") ? visible : null,
  };
}

/** Open room-service requests of the hotel as a badge on the "/oda-servisi" entries (only when one is in the nav). */
async function badgeRoomService(nav: NavModel, hotelId: string): Promise<void> {
  const items = [...nav.primary, ...nav.more].filter((item) => item.href === "/oda-servisi");
  if (items.length === 0) return;
  const open = await prisma.order.count({
    where: { hotelId, roomId: { not: null }, status: { notIn: [...CLOSED_STATUSES] } },
  });
  for (const item of items) item.badge = open;
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
