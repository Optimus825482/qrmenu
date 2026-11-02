import type { Ctx } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibleScreens } from "@/lib/rbac";
import { guardScreenOf, routeOf } from "../screenPaths";
import { SCREENS, type ScreenDef } from "../screens";

export type Landing = { screenCode: string; path: string; fallback: boolean };
export type LandingShell = "xp" | "personel" | "pos";

/** Screens that can never be a landing page (the guest menu preview needs a table token). */
export const LANDING_EXCLUDED: readonly string[] = ["QM-MIS"];

const POS_ROUTES = ["/kasa", "/kds"];

/** The shell a screen naturally belongs to: desktop for the admin windows, POS for cashier and kitchen. */
function shellOf(screen: ScreenDef): LandingShell {
  const route = routeOf(screen);
  if (route === "/admin" || route.startsWith("/admin/")) return "xp";
  if (POS_ROUTES.some((r) => route === r || route.startsWith(`${r}/`))) return "pos";
  return "personel";
}

/** Path to redirect to: query kept (kat filters), `#...` dropped (never reaches the server). */
function landingPath(screen: ScreenDef): string {
  const hash = screen.path.indexOf("#");
  return hash === -1 ? screen.path : screen.path.slice(0, hash);
}

/**
 * Where a signed-in user starts: the role's default screen when they may view it, else the first
 * visible catalogue screen whose route guard also passes (landing-excluded ones skipped), else the target picker. With
 * `opts.shell` a default whose natural shell differs falls to the first visible screen of that
 * shell (the default stays when the shell has none).
 */
export async function resolveLanding(
  ctx: Ctx,
  opts?: { shell?: LandingShell },
): Promise<Landing> {
  const [visible, role] = await Promise.all([
    visibleScreens(ctx),
    prisma.role.findUnique({ where: { id: ctx.user.roleId }, select: { defaultScreen: true } }),
  ]);
  return pickLanding(visible, role?.defaultScreen, opts);
}

/** Pure part of resolveLanding: `visible` are the viewable screen codes, `defaultScreen` the role's default. */
export function pickLanding(
  visible: readonly string[],
  defaultScreen: string | null | undefined,
  opts?: { shell?: LandingShell },
): Landing {
  const allowed = new Set(visible);
  // A screen is only a candidate when the page behind its route (its guard screen) is viewable too.
  const candidates = SCREENS.filter(
    (s) => allowed.has(s.code) && allowed.has(guardScreenOf(s)) && !LANDING_EXCLUDED.includes(s.code),
  );
  const preferred = candidates.find((s) => s.code === defaultScreen);
  let chosen = preferred ?? candidates[0];
  if (opts?.shell && chosen && shellOf(chosen) !== opts.shell) {
    chosen = candidates.find((s) => shellOf(s) === opts.shell) ?? chosen;
  }
  if (!chosen) return { screenCode: "", path: "/secim", fallback: true };
  return { screenCode: chosen.code, path: landingPath(chosen), fallback: chosen !== preferred };
}
