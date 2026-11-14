import type { MenuTreeNode } from "@/modules/menu/server/menuTree";

/** A branch of the staff menu tree: a category, subcategory or group with what it holds. */
export type MenuBranch = {
  id: string;
  name: string;
  items: MenuTreeNode[];
  branches: MenuBranch[];
  /** Items in this branch and below. */
  itemCount: number;
  /** Sold-out items in this branch and below. */
  soldOutCount: number;
};

export type MenuFilter = { query: string; soldOutOnly: boolean };

/** Case- and dotted-i-insensitive search key ("IZGARA" matches "ızgara" and "izgara"). */
export function foldTr(text: string): string {
  return text.toLocaleLowerCase("tr-TR").replaceAll("ı", "i").replaceAll("i̇", "i");
}

/**
 * The tree the room-service team sees: active nodes only (an inactive node hides its whole subtree, exactly
 * as on the guest menu), filtered by name and by "sold out only"; branches left empty by the filter are dropped.
 */
export function buildBranches(nodes: readonly MenuTreeNode[], filter: MenuFilter): MenuBranch[] {
  const needle = foldTr(filter.query.trim());
  const keep = (item: MenuTreeNode) =>
    (!filter.soldOutOnly || !item.isAvailable) && (!needle || foldTr(item.name).includes(needle));
  const walk = (level: readonly MenuTreeNode[]): MenuBranch[] =>
    level
      .filter((node) => node.kind !== "OGE" && node.isActive)
      .map((node): MenuBranch => {
        const items = node.children.filter((child) => child.kind === "OGE" && child.isActive && keep(child));
        const branches = walk(node.children);
        return {
          id: node.id,
          name: node.name,
          items,
          branches,
          itemCount: items.length + branches.reduce((sum, b) => sum + b.itemCount, 0),
          soldOutCount: items.filter((i) => !i.isAvailable).length + branches.reduce((sum, b) => sum + b.soldOutCount, 0),
        };
      })
      .filter((branch) => branch.itemCount > 0);
  return walk(nodes);
}

/** Ids of every branch, for "open all" (a filtered tree is shown fully open). */
export function branchIds(branches: readonly MenuBranch[]): string[] {
  return branches.flatMap((branch) => [branch.id, ...branchIds(branch.branches)]);
}

/** The active item with `id`, wherever it hangs. */
export function findItem(nodes: readonly MenuTreeNode[], id: string): MenuTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node.kind === "OGE" ? node : undefined;
    const below = findItem(node.children, id);
    if (below) return below;
  }
  return undefined;
}

/** Names of the branches above the item with `id` ("Yiyecekler › Sıcaklar"). */
export function pathOf(nodes: readonly MenuTreeNode[], id: string, parents: string[] = []): string | undefined {
  for (const node of nodes) {
    if (node.id === id) return parents.join(" › ");
    const below = pathOf(node.children, id, [...parents, node.name]);
    if (below !== undefined) return below;
  }
  return undefined;
}
