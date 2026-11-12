"use client";

import { useId, useState } from "react";
import type { RoomCatalog } from "../../server/catalog";
import { GroupPills } from "./GroupPills";
import { ProductCard } from "./ProductCard";

type CatalogGroup = RoomCatalog["groups"][number];

/** Grouped product cards: group tabs on top, the active group's cards below. Used by both swap steps. */
export function SwapPanel({
  groups,
  qty,
  maxFor,
  canIncrease,
  hintFor,
  onChange,
}: {
  groups: CatalogGroup[];
  qty: Record<string, number>;
  maxFor: (productId: string, setupQty: number) => number;
  canIncrease: boolean;
  hintFor?: (setupQty: number) => string;
  onChange: (productId: string, qty: number) => void;
}) {
  const idPrefix = useId();
  const [activeId, setActiveId] = useState(groups[0]?.id ?? "");
  const active = groups.find((g) => g.id === activeId) ?? groups[0];
  if (!active) return null;
  return (
    <>
      <GroupPills
        groups={groups.map((g) => ({ id: g.id, label: g.nameLocal }))}
        active={active.id}
        idPrefix={idPrefix}
        onSelect={setActiveId}
      />
      <div role="tabpanel" id={`${idPrefix}-panel-${active.id}`} aria-labelledby={`${idPrefix}-tab-${active.id}`}>
        <ul className="mb-products">
          {active.products.map((p) => (
            <ProductCard
              key={p.id}
              name={p.nameLocal}
              hint={hintFor?.(p.setupQty)}
              qty={qty[p.id] ?? 0}
              max={maxFor(p.id, p.setupQty)}
              canIncrease={canIncrease}
              onChange={(value) => onChange(p.id, value)}
            />
          ))}
        </ul>
      </div>
    </>
  );
}
