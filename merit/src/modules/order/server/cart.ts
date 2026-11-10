import { Prisma } from "@/generated/prisma/client";
import { DomainError } from "@/lib/result";

export type SelectionItemInput = {
  menuNodeId: string;
  qty: number;
  note?: string;
};

export type NodeRow = {
  id: string;
  name: string;
  price: Prisma.Decimal | string | number | null;
  kind: string;
  is_active: boolean;
  is_available: boolean;
  outlet_id: string;
};

export type ValidatedItem = {
  item: SelectionItemInput;
  row: NodeRow;
  unitPrice: Prisma.Decimal | null;
};

const UNKNOWN_ITEM = "Bilinmeyen öğe";

/**
 * Validates selected items for an outlet under FOR SHARE lock:
 * checks node existence, outlet match, is_active, is_available and kind === 'OGE'.
 * Throws VALIDATION with fieldErrors.items containing unavailable item names.
 */
export async function validateCartItems(
  tx: Prisma.TransactionClient,
  outletId: string,
  items: SelectionItemInput[],
  // Kept for caller compatibility: the price snapshot no longer depends on the display setting
  // (display to the guest is gated separately by Order.pricesShown).
  _pricesShown?: boolean,
): Promise<ValidatedItem[]> {
  void _pricesShown;
  const ids = [...new Set(items.map((i) => i.menuNodeId))];
  const rows = await tx.$queryRaw<NodeRow[]>`
    SELECT id, name, price, kind::text AS kind, is_active, is_available, outlet_id
    FROM menu_nodes WHERE id IN (${Prisma.join(ids)}) FOR SHARE`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  // An item under an inactive category (at any depth) is not orderable either.
  const blocked = await tx.$queryRaw<{ leaf: string }[]>`
    WITH RECURSIVE chain AS (
      SELECT id, parent_id, is_active, id AS leaf FROM menu_nodes WHERE id IN (${Prisma.join(ids)})
      UNION ALL
      SELECT p.id, p.parent_id, p.is_active, c.leaf FROM menu_nodes p JOIN chain c ON p.id = c.parent_id
    )
    SELECT DISTINCT leaf FROM chain WHERE is_active = false`;
  const blockedIds = new Set(blocked.map((b) => b.leaf));

  const bad: string[] = [];
  const badIds: string[] = [];
  for (const item of items) {
    const row = byId.get(item.menuNodeId);
    const foreign = !row || row.outlet_id !== outletId;
    if (!foreign && row.is_active && row.is_available && row.kind === "OGE" && !blockedIds.has(row.id)) continue;
    const name = foreign ? UNKNOWN_ITEM : row.name;
    if (!bad.includes(name)) bad.push(name);
    if (!badIds.includes(item.menuNodeId)) badIds.push(item.menuNodeId);
  }
  if (bad.length > 0) {
    // `items` keeps the names (existing contract); `itemIds` lets the client reconcile its selections by id.
    throw new DomainError("VALIDATION", "Bazı öğeler şu an sipariş edilemiyor", {
      fieldErrors: { items: bad, itemIds: badIds },
    });
  }

  return items.map((item) => {
    const row = byId.get(item.menuNodeId) as NodeRow;
    const unitPrice = row.price != null ? new Prisma.Decimal(String(row.price)).toDecimalPlaces(2) : null;
    return { item, row, unitPrice };
  });
}

/** Alias to ensure codebase terminology stays aligned with Seçimler (Selections). */
export const validateSelectionItems = validateCartItems;
