import type { MenuNodeKind } from "@/generated/prisma/client";
import type { Locale } from "@/lib/i18n/locales";
import { prisma } from "@/lib/prisma";
import { type GuestState, guestState } from "./guestState";

export type GuestItem = {
  id: string;
  name: string;
  detail?: string;
  imageUrl: string | null;
  allergens: string[];
  tags: string[];
  isAvailable: boolean;
  /** Only present when the outlet shows prices. */
  price?: string;
};
export type GuestGroup = { id: string; name: string; detail?: string; items: GuestItem[] };
export type GuestSubcategory = { id: string; name: string; items: GuestItem[]; groups: GuestGroup[] };
export type GuestCategory = { id: string; name: string; items: GuestItem[]; subcategories: GuestSubcategory[] };
export type GuestMenu = { state: GuestState; categories: GuestCategory[] };

/**
 * The guest-visible menu of an outlet: active nodes only (an inactive node hides its whole subtree),
 * translated name/detail with the Turkish base record as fallback, empty groups/subcategories/categories
 * dropped, `price` only when prices are shown. Sold-out items stay, flagged. Not cached: the page is
 * dynamic and follows SSE events.
 */
export async function getMenu(outletId: string, locale: Locale, areaId?: string): Promise<GuestMenu> {
  const [state, rows] = await Promise.all([
    guestState(outletId, areaId),
    prisma.menuNode.findMany({
      where: { outletId, isActive: true },
      include: { translations: { where: { lang: locale, isVerified: true } } }, // Unreviewed machine drafts never reach guests.
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);

  type Row = (typeof rows)[number];
  const children = new Map<string | null, Row[]>();
  for (const row of rows) {
    const list = children.get(row.parentId) ?? [];
    list.push(row);
    children.set(row.parentId, list);
  }
  const of = (parent: Row | null, kind: MenuNodeKind) =>
    (children.get(parent?.id ?? null) ?? []).filter((r) => r.kind === kind);

  const text = (row: Row) => {
    const t = row.translations[0];
    const detail = t?.detail || row.detail;
    return { name: t?.name || row.name, ...(detail ? { detail } : {}) };
  };
  const showPrice = state.pricesShown && state.design.options.showPrices;
  const toItem = (row: Row): GuestItem => ({
    id: row.id,
    ...text(row),
    imageUrl: row.imageUrl,
    allergens: row.allergens,
    tags: row.tags,
    isAvailable: row.isAvailable,
    ...(showPrice && row.price !== null ? { price: row.price.toFixed(2) } : {}),
  });

  const categories: GuestCategory[] = [];
  for (const cat of of(null, "KATEGORI")) {
    const directItems: GuestItem[] = of(cat, "OGE").map(toItem);
    const subcategories: GuestSubcategory[] = [];
    for (const sub of of(cat, "ALT_KATEGORI")) {
      const directItems: GuestItem[] = of(sub, "OGE").map(toItem);
      const groups: GuestGroup[] = [];
      for (const group of of(sub, "GRUP")) {
        const items: GuestItem[] = of(group, "OGE").map(toItem);
        if (items.length > 0) groups.push({ id: group.id, ...text(group), items });
      }
      if (directItems.length > 0 || groups.length > 0) {
        subcategories.push({ id: sub.id, name: text(sub).name, items: directItems, groups });
      }
    }
    if (directItems.length > 0 || subcategories.length > 0) {
      categories.push({ id: cat.id, name: text(cat).name, items: directItems, subcategories });
    }
  }
  return { state, categories };
}
