import type { IconName } from "@/components/icons/paths";
import { screenForPath } from "@/modules/core/screenPaths";

export type NavItem = {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  /** Catalogue screen whose "view" permission the page behind `href` checks on entry. */
  screen: string;
  emphasis?: "qr";
};

export type NavModel = {
  /** Bottom bar / rail targets: 2-5 entries, the last one is "Daha" when the model is not empty. */
  primary: NavItem[];
  /** Remaining visible screens, listed in the "Daha" sheet. */
  more: NavItem[];
  fab?: { label: string; icon: IconName; href: string; screen: string };
};

export type NavOptions = {
  /** The user may open orders at the outlet (QS-KUY "create"): only then the waiter gets the FAB. */
  canCreate?: boolean;
  /** Current path: decides the nav of roles without a fixed family (F&B manager visiting /oda-servisi). */
  pathname?: string;
};

type Family = "kat" | "garson" | "ods" | "depo";

/** `screen` may list alternatives: the first visible one is reported. */
type Def = { id: string; label: string; icon: IconName; href: string; screen: string | readonly string[]; emphasis?: "qr" };

const KAT_PRIMARY: Def[] = [
  { id: "today", label: "Bugün", icon: "clipboard", href: "/kat/tavsiye-is-plani", screen: "MB-KAT" },
  { id: "floors", label: "Katlar", icon: "building", href: "/kat", screen: "MB-KAT" },
  { id: "qr", label: "QR Okut", icon: "qr", href: "/kat/qr", screen: "MB-KF", emphasis: "qr" },
  { id: "mine", label: "İşlemlerim", icon: "list", href: "/kat/islemlerim", screen: "MB-TUK" },
];
const KAT_MORE: Def[] = [
  { id: "requests", label: "Düzeltme ve ek talepler", icon: "inbox", href: "/kat/duzeltme-onay", screen: "MB-TAL" },
  { id: "stock", label: "Zimmet stoğu", icon: "box", href: "/kat/stok", screen: "MB-ZIM" },
  { id: "mybar", label: "MyBar talepleri", icon: "bell", href: "/kat/mybar", screen: "MB-PERS" },
];

const GARSON_PRIMARY: Def[] = [
  { id: "queue", label: "Kuyruk", icon: "clipboard", href: "/garson", screen: "QS-KUY" },
  { id: "tables", label: "Masalarım", icon: "table", href: "/garson?sekme=masalar", screen: "QS-KUY" },
  { id: "calls", label: "Çağrılar", icon: "bell", href: "/garson/cagrilar", screen: "QM-CAG" },
];
const GARSON_MORE: Def[] = [
  { id: "cashier", label: "Kasa", icon: "receipt", href: "/kasa", screen: "QS-KAS" },
  { id: "kitchen", label: "Mutfak ekranı", icon: "flame", href: "/kds", screen: "QS-KDS" },
  { id: "room-service", label: "Oda servisi", icon: "concierge", href: "/oda-servisi", screen: "RO-TAL" },
];

const ODS_PRIMARY: Def[] = [
  { id: "requests", label: "Talepler", icon: "concierge", href: "/oda-servisi", screen: "RO-TAL" },
  { id: "confirm", label: "Teyit", icon: "call", href: "/oda-servisi?sekme=teyit", screen: "RO-TEL" },
  { id: "delivery", label: "Teslim", icon: "walk", href: "/oda-servisi?sekme=teslim", screen: "RO-TES" },
];
const ODS_MORE: Def[] = [
  { id: "history", label: "Geçmiş", icon: "clock", href: "/oda-servisi?sekme=gecmis", screen: "RO-TAL" },
];

const DEPO_PRIMARY: Def[] = [
  { id: "pool", label: "Havuz", icon: "box", href: "/depo/stok", screen: "MB-ZIM" },
  { id: "requests", label: "Talepler", icon: "inbox", href: "/kat/duzeltme-onay", screen: "MB-TAL" },
  { id: "reports", label: "Raporlar", icon: "chart", href: "/depo/raporlar", screen: "MB-RAP" },
];
const DEPO_MORE: Def[] = [
  { id: "home", label: "Depo panosu", icon: "home", href: "/depo", screen: ["MB-ZIM", "MB-RAP"] },
  { id: "occupancy", label: "Doluluk yükleme", icon: "trending", href: "/depo/doluluk-yukle", screen: "MB-DOL" },
  { id: "definitions", label: "Tanımlar", icon: "settings", href: "/depo/tanimlar", screen: "MB-TAN" },
  { id: "floors", label: "Kat planı", icon: "building", href: "/kat", screen: "MB-KAT" },
];

const FAMILIES: Record<Family, { primary: Def[]; more: Def[] }> = {
  kat: { primary: KAT_PRIMARY, more: KAT_MORE },
  garson: { primary: GARSON_PRIMARY, more: GARSON_MORE },
  ods: { primary: ODS_PRIMARY, more: ODS_MORE },
  depo: { primary: DEPO_PRIMARY, more: DEPO_MORE },
};

const GARSON_ROLES = new Set(["R-GAR", "R-SGF", "R-BAR", "R-BUT"]);

const MORE_ITEM: NavItem = { id: "more", label: "Daha", icon: "menu", href: "", screen: "" };

function pathFamily(pathname: string | undefined): Family | undefined {
  if (!pathname) return undefined;
  const clean = pathname.replace(/[?#].*$/, "");
  const first = clean.split("/")[1];
  if (first === "kat") return "kat";
  if (first === "depo") return "depo";
  if (first === "garson") return "garson";
  if (first === "oda-servisi") return "ods";
  return undefined;
}

/** Role family: fixed for the minibar / room-service roles, path-driven for waiters visiting room service and for management. */
export function navFamily(roleCode: string, pathname?: string): Family | undefined {
  if (roleCode === "R-KAT") return "kat";
  if (roleCode === "R-DEP" || roleCode === "R-HKS") return "depo";
  if (roleCode === "R-ODS") return "ods";
  const byPath = pathFamily(pathname);
  if (GARSON_ROLES.has(roleCode)) return byPath === "ods" ? "ods" : "garson";
  return byPath;
}

/** Resolves a definition against the visible set: the page guard screen AND the catalogue owner of the route must be visible. */
function resolve(def: Def, visible: ReadonlySet<string>): NavItem | undefined {
  const screen = (Array.isArray(def.screen) ? def.screen : [def.screen]).find((code) => visible.has(code));
  if (!screen) return undefined;
  const owner = screenForPath(def.href);
  if (owner && !visible.has(owner.code)) return undefined;
  return { id: def.id, label: def.label, icon: def.icon, href: def.href, screen, ...(def.emphasis ? { emphasis: def.emphasis } : {}) };
}

/**
 * Bottom navigation of a role (spec 2.2), filtered by the screens the session may view:
 * kat Bugün · Katlar · QR Okut · İşlemlerim · Daha; waiter Kuyruk · Masalarım · Çağrılar · Daha;
 * room service Talepler · Teyit · Teslim · Daha; depot Havuz · Talepler · Raporlar · Daha.
 * Never links to a screen outside `visible`; 2-5 primary entries (Daha included), empty when nothing is visible.
 */
export function buildNav(roleCode: string, visible: ReadonlySet<string>, options: NavOptions = {}): NavModel {
  const family = navFamily(roleCode, options.pathname);
  if (!family) return { primary: [], more: [] };
  const def = FAMILIES[family];
  const primary = def.primary.map((d) => resolve(d, visible)).filter((i): i is NavItem => Boolean(i));
  const primaryHrefs = new Set(primary.map((i) => i.href));
  const more = def.more
    .map((d) => resolve(d, visible))
    .filter((i): i is NavItem => Boolean(i) && !primaryHrefs.has((i as NavItem).href));

  if (primary.length === 0 && more.length > 0) primary.push(more.shift() as NavItem);
  if (primary.length === 0) return { primary: [], more: [] };

  const model: NavModel = { primary: [...primary, MORE_ITEM], more };
  if (family === "garson" && options.canCreate) {
    const create = resolve(GARSON_PRIMARY[1], visible);
    if (create) model.fab = { label: "Yeni adisyon", icon: "plus", href: "/garson?sekme=masalar&yeni=1", screen: create.screen };
  }
  return model;
}

/** Path and `sekme` filter of a nav href. */
function splitHref(href: string): { path: string; sekme: string | null } {
  const [path, query] = href.split("?");
  return { path, sekme: query ? new URLSearchParams(query).get("sekme") : null };
}

/** Whether `item` is the current place: same path and `sekme` (the floor list also owns the room-check sub pages). */
export function isNavActive(item: Pick<NavItem, "href">, pathname: string, sekme: string | null): boolean {
  if (!item.href) return false;
  const target = splitHref(item.href);
  if (target.path === "/kat" && /^\/kat\/(oda-kontrol|doluluk)(\/|$)/.test(pathname)) return true;
  return target.path === pathname && target.sekme === (sekme || null);
}
