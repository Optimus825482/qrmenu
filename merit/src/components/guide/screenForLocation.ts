import { routeOf, screenForPath } from "@/modules/core/screenPaths";
import { SCREENS } from "@/modules/core/screens";

/** Pages that are the real route of a filter screen (the catalogue lists the filter URL). */
const PAGE_OWNERS: ReadonlyArray<readonly [string, string]> = [["/kat/dnd", "MB-DND"]];

/**
 * The catalogue screen shown at `pathname` + `search`. Screens that are filters inside a shared route
 * (`/kat?filtre=dnd` is MB-DND) win when their query matches; otherwise the route's owner is used.
 */
export function screenCodeForLocation(pathname: string, search: string): string | undefined {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const owner = PAGE_OWNERS.find(([route]) => clean === route || clean.startsWith(`${route}/`));
  if (owner) return owner[1];
  const params = new URLSearchParams(search);
  for (const screen of SCREENS) {
    const cut = screen.path.indexOf("?");
    if (cut === -1) continue;
    if (routeOf(screen) !== pathname.replace(/\/+$/, "")) continue;
    const wanted = new URLSearchParams(screen.path.slice(cut + 1).replace(/#.*$/, ""));
    let match = true;
    wanted.forEach((value, key) => {
      if (params.get(key) !== value) match = false;
    });
    if (match) return screen.code;
  }
  return screenForPath(pathname)?.code;
}
