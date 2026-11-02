import { SCREENS, type ScreenDef } from "./screens";

/** Route part of a catalogue path: `#...` (desktop window hint) and `?...` (filter) are dropped. */
export function routeOf(screen: { path: string }): string {
  const cut = screen.path.search(/[?#]/);
  return cut === -1 ? screen.path : screen.path.slice(0, cut);
}

/**
 * Sub-routes that belong to a screen whose catalogue path is a shorter route: the room check
 * (`/kat/oda-kontrol/[roomId]`) needs a room id, so MB-TUK is listed under `/kat` and reached from there.
 */
const ROUTE_OWNERS: ReadonlyArray<readonly [string, string]> = [["/kat/oda-kontrol", "MB-TUK"]];

/**
 * The catalogue screen that owns `pathname`: the longest route prefix wins on a segment boundary
 * (`/kat/oda-kontrol/x` belongs to `/kat`, `/kat/qr` to `MB-KF`). When several screens share a
 * route (the `/admin` windows, the `/kat` filters) the first one in catalogue order is returned.
 */
export function screenForPath(pathname: string): ScreenDef | undefined {
  const clean = pathname.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  let best: ScreenDef | undefined;
  let bestLength = -1;
  for (const [route, code] of ROUTE_OWNERS) {
    if (clean === route || clean.startsWith(`${route}/`)) {
      best = SCREENS.find((s) => s.code === code);
      bestLength = route.length;
    }
  }
  for (const screen of SCREENS) {
    const route = routeOf(screen);
    const matches = clean === route || clean.startsWith(`${route}/`);
    if (matches && route.length > bestLength) {
      best = screen;
      bestLength = route.length;
    }
  }
  return best;
}

/**
 * The screen a page actually checks on entry, when it differs from the catalogue screen that
 * lists the route (single source of truth for the guard of every route under `src/app`):
 * `/kat` is guarded by MB-KAT (MB-TUK, MB-PERS and MB-DND are filters inside it), `/admin` by
 * CR-KOM (every desktop window opens inside it) and the room-service sub-pages redirect into
 * `/oda-servisi` (RO-TAL). Routes not listed are guarded by their own catalogue screen.
 */
const ROUTE_GUARDS: Readonly<Record<string, string>> = {
  "/kat": "MB-KAT",
  "/admin": "CR-KOM",
  "/oda-servisi/teyit": "RO-TAL",
  "/oda-servisi/teslim": "RO-TAL",
};

/** Code of the screen whose "view" permission the page behind `screen`'s route requires. */
export function guardScreenOf(screen: { code: string; path: string }): string {
  return ROUTE_GUARDS[routeOf(screen)] ?? screen.code;
}
