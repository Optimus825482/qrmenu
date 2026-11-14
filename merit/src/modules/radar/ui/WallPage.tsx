/** Paging of long lists on the wall: a TV cannot scroll, so a list shows one page at a time and turns by the clock. */
export type WallPaging = {
  /** How long a page stays up (ms). */
  periodMs: number;
};

export type Paged<T> = { items: readonly T[]; page: number; pages: number };

/**
 * The page of `items` to show at `now` (pure). Without `paging` (a window, which scrolls) the whole list is one
 * page. The page follows the clock rather than a counter, so it needs no state and every list on the screen
 * turns at the same instant.
 */
export function pageOf<T>(items: readonly T[], perPage: number, paging: WallPaging | undefined, now: number): Paged<T> {
  const size = Math.max(1, Math.floor(perPage));
  if (!paging || items.length <= size) return { items, page: 0, pages: 1 };
  const pages = Math.ceil(items.length / size);
  const page = Math.floor(Math.max(0, now) / Math.max(1000, paging.periodMs)) % pages;
  return { items: items.slice(page * size, page * size + size), page, pages };
}

/** "Sayfa 2/3" under a paged list; nothing while the list fits on one page. */
export function PageMark({
  paged,
  total,
  unit,
  as: Tag = "p",
}: {
  paged: Paged<unknown>;
  total: number;
  unit: string;
  /** "li" when the mark closes a list. */
  as?: "p" | "li";
}) {
  if (paged.pages < 2) return null;
  return (
    <Tag className="rd-muted rd-small">
      Sayfa {paged.page + 1}/{paged.pages} · {total} {unit}
    </Tag>
  );
}
