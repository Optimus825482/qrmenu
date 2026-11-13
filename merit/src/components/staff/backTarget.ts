import { buildNav, navFamilies } from "./navModel";
import { screenTitle } from "./screenTitle";

/**
 * Staff (minibar) routes and the screen whose "view" permission each one checks on entry: the same codes the
 * route's layout passes to `requireScreen` (tests/unit/back-target.test.ts reads the layouts and pins the two
 * together). Several codes = any one of them opens the page. The longest route prefix wins.
 */
const PAGE_GUARDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["/kat", ["MB-KAT"]],
  ["/kat/dnd", ["MB-DND"]],
  ["/kat/doluluk", ["MB-KAT"]],
  ["/kat/duzeltme-onay", ["MB-TAL"]],
  ["/kat/gorevler", ["MB-KAT"]],
  ["/kat/islemlerim", ["MB-TUK"]],
  ["/kat/kritik", ["MB-ZIM"]],
  ["/kat/manuel-kayit", ["MB-TUK"]],
  ["/kat/mybar", ["MB-PERS"]],
  ["/kat/oda-kontrol", ["MB-TUK"]],
  ["/kat/qr", ["MB-KF"]],
  ["/kat/stok", ["MB-ZIM"]],
  ["/kat/talep", ["MB-TAL"]],
  ["/kat/tavsiye-is-plani", ["MB-KAT"]],
  ["/kat/urun", ["MB-ZIM"]],
  ["/kat/urun-siralamasi", ["MB-TUK"]],
  // The depot board has no guard of its own; the nav lists it for these two (navModel DEPO_MORE "home").
  ["/depo", ["MB-ZIM", "MB-RAP"]],
  ["/depo/doluluk", ["MB-DOL"]],
  ["/depo/doluluk-yukle", ["MB-DOL"]],
  ["/depo/gorevler", ["MB-KAT"]],
  ["/depo/havuz", ["MB-ZIM"]],
  ["/depo/mybar", ["MB-PERS"]],
  ["/depo/raporlar", ["MB-RAP"]],
  ["/depo/stok", ["MB-ZIM"]],
  ["/depo/talepler", ["MB-TAL"]],
  ["/depo/tanimlar", ["MB-TAN"]],
  // No layout guard; the catalogue owner (screenPaths ROUTE_OWNERS) and its API check MB-ZIM.
  ["/depo/tedarik", ["MB-ZIM"]],
];

/** Path of an href without query, hash and trailing slash. */
export function pathOfHref(href: string): string {
  return href.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
}

/** Screens that open the staff page behind `href`; undefined for a route this table does not know. */
export function guardsOfPath(href: string): readonly string[] | undefined {
  const path = pathOfHref(href);
  let best: readonly string[] | undefined;
  let length = -1;
  for (const [route, codes] of PAGE_GUARDS) {
    if ((path === route || path.startsWith(`${route}/`)) && route.length > length) {
      best = codes;
      length = route.length;
    }
  }
  return best;
}

/**
 * Whether a link to `href` may be shown: the page behind it opens for this user (never a way to /yetkisiz).
 * Routes outside the minibar table (Başlat, Erişimim, API downloads) are not judged here.
 */
export function canViewPath(visible: ReadonlySet<string>, href: string): boolean {
  const guards = guardsOfPath(href);
  return !guards || guards.some((code) => visible.has(code));
}

/** Names used in "Geri: <name>" (the page a back control leads to); catalogue screens by their catalogue name. */
const PAGE_NAMES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/kat$/, screenTitle("MB-KAT")],
  [/^\/kat\/doluluk\/[^/]+$/, "Kat"],
  [/^\/kat\/oda-kontrol\/[^/]+$/, screenTitle("MB-TUK")],
  [/^\/kat\/islemlerim$/, "İşlemlerim"],
  [/^\/kat\/duzeltme-onay$/, screenTitle("MB-TAL")],
  [/^\/kat\/stok$/, screenTitle("MB-ZIM")],
  [/^\/kat\/qr$/, screenTitle("MB-KF")],
  [/^\/kat\/tavsiye-is-plani$/, "Bugün"],
  [/^\/depo$/, "Depo panosu"],
  [/^\/depo\/stok$/, screenTitle("MB-ZIM")],
  [/^\/depo\/raporlar$/, screenTitle("MB-RAP")],
  [/^\/baslat$/, "Ana ekran"],
];

export function pageName(href: string): string {
  const path = pathOfHref(href);
  return PAGE_NAMES.find(([re]) => re.test(path))?.[1] ?? "Önceki ekran";
}

type Family = ReturnType<typeof navFamilies>[number];

const FAMILY_HOME: Partial<Record<Family, string>> = { kat: "/kat", depo: "/depo" };

/**
 * The user's home: the home page of the leading family when it opens, else the family's first bar entry
 * that does, else the sign-in landing.
 */
export function homeFor(visible: ReadonlySet<string>, pathname: string): string {
  const [lead] = navFamilies(visible, pathname);
  const home = lead ? FAMILY_HOME[lead] : undefined;
  if (home && canViewPath(visible, home)) return home;
  const first = buildNav(visible, { pathname }).primary.find((item) => item.href && canViewPath(visible, item.href));
  return first ? pathOfHref(first.href) : "/baslat";
}

/**
 * Whether `pathname` is a navigation root for this user: an entry of the bottom bar / rail of the leading
 * family, or that family's home page. Those are reached from the navigation itself and show no "Geri".
 */
export function isNavRoot(visible: ReadonlySet<string>, pathname: string): boolean {
  const path = pathOfHref(pathname);
  const [lead] = navFamilies(visible, path);
  if (!lead) return false;
  if (FAMILY_HOME[lead] === path) return true;
  return buildNav(visible, { pathname: path }).primary.some((item) => item.href && pathOfHref(item.href) === path);
}

/**
 * The logical parent of a sub-page, before the permission check. `search` carries the context a page was
 * opened with (`?oda=` / `?kat=` of a manual entry request).
 */
function logicalParent(path: string, search: URLSearchParams, lead: Family | undefined): string | undefined {
  if (/^\/kat\/doluluk\/[^/]+$/.test(path)) return "/kat";
  if (path === "/kat/kritik" || /^\/kat\/urun\/[^/]+$/.test(path)) return "/kat/stok";
  // A new stock request is opened from the requests list of the same screen (MB-TAL).
  if (path === "/kat/talep") return "/kat/duzeltme-onay";
  if (/^\/kat\/(dnd|gorevler|tavsiye-is-plani|stok|mybar)$/.test(path)) return lead === "depo" ? "/depo" : "/kat";
  if (/^\/kat\/oda-kontrol\/[^/]+$/.test(path)) return "/kat";
  if (path === "/kat/manuel-kayit") {
    const floor = search.get("kat");
    if (floor) return `/kat/doluluk/${encodeURIComponent(floor)}`;
    const room = search.get("oda");
    if (room) return `/kat/oda-kontrol/${encodeURIComponent(room)}`;
    return lead === "depo" ? "/kat/duzeltme-onay" : "/kat/islemlerim";
  }
  if (path === "/kat/duzeltme-onay") return lead === "kat" ? "/kat/islemlerim" : undefined;
  if (path === "/depo/tedarik" || path === "/depo/talepler") return "/depo/stok";
  if (path.startsWith("/depo/")) return "/depo";
  return undefined; // the user's home
}

/** Query keys a parent page needs from the current address (the hotel the window shows). */
const CARRIED_PARAMS = ["hotelId"] as const;

export type BackTarget = { kind: "root" } | { kind: "back"; href: string; label: string };

/**
 * Where a page's "Geri" leads (decisions D2/D3): nothing on a navigation root; otherwise the logical parent
 * when the user may view it, else the user's home. `parent` overrides the logical parent (a room's floor, known
 * only from the page's data, or a page's hotel selection). The parent keeps the hotel the current address names.
 */
export function backTarget(input: {
  pathname: string;
  search?: string | URLSearchParams;
  visible: ReadonlySet<string>;
  parent?: string;
}): BackTarget {
  const path = pathOfHref(input.pathname);
  const search = new URLSearchParams(input.search ?? "");
  if (isNavRoot(input.visible, path)) return { kind: "root" };
  const [lead] = navFamilies(input.visible, path);
  const wanted = input.parent ?? logicalParent(path, search, lead);
  let href = wanted && canViewPath(input.visible, wanted) ? wanted : homeFor(input.visible, path);
  if (pathOfHref(href) === path) href = "/baslat";
  return { kind: "back", href: withContext(href, search), label: pageName(href) };
}

/** `href` with the context params of the current address that it does not name itself. */
export function withContext(href: string, current: URLSearchParams): string {
  if (pathOfHref(href) === "/baslat") return href;
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  for (const key of CARRIED_PARAMS) {
    const value = current.get(key);
    if (value && !params.has(key)) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** `path` with the query of a page's `searchParams` (a redirect that keeps the hotel and the window's marks). */
export function withQuery(path: string, query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, one);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
