import type { GuestCategory, GuestItem } from "../../server/guestMenu";

/** Every dish of a category: direct items, then each subcategory's items and groups. */
export function categoryItems(category: GuestCategory): GuestItem[] {
  return [
    ...category.items,
    ...category.subcategories.flatMap((sub) => [...sub.items, ...sub.groups.flatMap((group) => group.items)]),
  ];
}

const CURATED_TAG = "SEFIN_SECIMI";
export const MAX_CURATED_PHOTOS = 3;

/**
 * Curated-photo mode: only the first `max` chef's picks that have an image (in menu order) get a large photo;
 * every other dish is a text row.
 */
export function curatedPhotoIds(categories: GuestCategory[], max: number = MAX_CURATED_PHOTOS): Set<string> {
  const ids: string[] = [];
  for (const category of categories) {
    for (const item of categoryItems(category)) {
      if (ids.length >= max) return new Set(ids);
      if (item.imageUrl && item.tags.includes(CURATED_TAG)) ids.push(item.id);
    }
  }
  return new Set(ids);
}

/** A list shorter than this stays as cards: a handful of rows gains nothing from the dense form. */
export const PRICE_LIST_FROM_ITEMS = 5;

/**
 * Whether a list of dishes reads better as a text price list than as photo cards: it is long enough and either
 * none of its dishes has a photo (cards would be rows of empty squares) or none has a description (bottles and
 * soft drinks, where the name is the whole choice and look-alike thumbnails only lengthen the page).
 */
export function isPriceList(items: readonly GuestItem[]): boolean {
  if (items.length < PRICE_LIST_FROM_ITEMS) return false;
  return items.every((item) => !item.imageUrl) || items.every((item) => !item.detail);
}
