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
