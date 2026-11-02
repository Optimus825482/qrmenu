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
  pricesShown = true,
): Promise<ValidatedItem[]> {
  const ids = [...new Set(items.map((i) => i.menuNodeId))];
  const rows = await tx.$queryRaw<NodeRow[]>`
    SELECT id, name, price, kind::text AS kind, is_active, is_available, outlet_id
    FROM menu_nodes WHERE id IN (${Prisma.join(ids)}) FOR SHARE`;
  const byId = new Map(rows.map((r) => [r.id, r]));

  const bad: string[] = [];
  for (const item of items) {
    const row = byId.get(item.menuNodeId);
    const foreign = !row || row.outlet_id !== outletId;
    if (!foreign && row.is_active && row.is_available && row.kind === "OGE") continue;
    const name = foreign ? UNKNOWN_ITEM : row.name;
    if (!bad.includes(name)) bad.push(name);
  }
  if (bad.length > 0) {
    throw new DomainError("VALIDATION", "Bazı öğeler şu an sipariş edilemiyor", {
      fieldErrors: { items: bad },
    });
  }

  return items.map((item) => {
    const row = byId.get(item.menuNodeId) as NodeRow;
    const unitPrice =
      pricesShown && row.price != null ? new Prisma.Decimal(String(row.price)).toDecimalPlaces(2) : null;
    return { item, row, unitPrice };
  });
}

/** Alias to ensure codebase terminology stays aligned with Seçimler (Selections). */
export const validateSelectionItems = validateCartItems;
