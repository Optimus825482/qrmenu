import { STATUS_RANK, type StockStatus } from "./stockStatus";

/*
 * What the stock list shows: one definition for the screen and for its Excel file, so the file holds exactly the
 * rows the viewer filtered and sorted (all pages of them), never a different selection.
 */

export const STOCK_SORT_KEYS = ["name", "groupName", "total", "used", "remaining", "status"] as const;
export type StockSortKey = (typeof STOCK_SORT_KEYS)[number];
export const STOCK_STATUSES = ["STOKOUT", "KRITIK", "DIKKAT", "NORMAL"] as const;

export type StockView = {
  search?: string;
  group?: string;
  status?: StockStatus | "ALL";
  /** true: products taken out of the catalogue are listed too. */
  passive?: boolean;
  sort?: { key: StockSortKey; dir: 1 | -1 } | null;
};

type Viewable = {
  name: string;
  groupName: string;
  total: number;
  used: number;
  remaining: number;
  status: StockStatus;
  active: boolean;
};

const fold = (text: string) => text.toLocaleLowerCase("tr");

export function applyStockView<T extends Viewable>(rows: readonly T[], view: StockView): T[] {
  const needle = fold((view.search ?? "").trim());
  const status = view.status ?? "ALL";
  const group = view.group ?? "";
  const filtered = rows.filter(
    (r) =>
      (view.passive || r.active) &&
      (status === "ALL" || r.status === status) &&
      (group === "" || r.groupName === group) &&
      (needle === "" || fold(r.name).includes(needle) || fold(r.groupName).includes(needle)),
  );
  if (!view.sort) return filtered;
  const { key, dir } = view.sort;
  return [...filtered].sort((a, b) => {
    const diff =
      key === "status"
        ? STATUS_RANK[a.status] - STATUS_RANK[b.status]
        : key === "name" || key === "groupName"
          ? a[key].localeCompare(b[key], "tr")
          : a[key] - b[key];
    return (diff || a.name.localeCompare(b.name, "tr")) * dir;
  });
}

/** The view as query parameters of the Excel link, and back. Unknown values fall back to "everything". */
export function stockViewToQuery(view: StockView): string {
  const q = new URLSearchParams();
  if (view.search?.trim()) q.set("ara", view.search.trim());
  if (view.group) q.set("grup", view.group);
  if (view.status && view.status !== "ALL") q.set("durum", view.status);
  if (view.passive) q.set("pasif", "1");
  if (view.sort) q.set("sirala", `${view.sort.key}:${view.sort.dir === 1 ? "asc" : "desc"}`);
  return q.toString();
}

export function stockViewFromQuery(q: URLSearchParams): StockView {
  const status = q.get("durum");
  const [key, dir] = (q.get("sirala") ?? "").split(":");
  return {
    search: (q.get("ara") ?? "").slice(0, 100),
    group: (q.get("grup") ?? "").slice(0, 200),
    status: (STOCK_STATUSES as readonly string[]).includes(status ?? "") ? (status as StockStatus) : "ALL",
    passive: q.get("pasif") === "1",
    sort: (STOCK_SORT_KEYS as readonly string[]).includes(key ?? "")
      ? { key: key as StockSortKey, dir: dir === "desc" ? -1 : 1 }
      : null,
  };
}
