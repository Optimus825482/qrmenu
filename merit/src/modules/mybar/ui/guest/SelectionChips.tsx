"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons/Icon";

export type Chip = { id: string; name: string; qty: number };

/** "Selected items" summary: one chip per chosen product with a remove button; empty text when none. */
export function SelectionChips({
  chips,
  showQty,
  onRemove,
}: {
  chips: Chip[];
  showQty: boolean;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("mybar");
  return (
    <section className="mb-selected" aria-labelledby="mb-selected-title">
      <h2 id="mb-selected-title" className="mb-label">
        {t("selectedSummary")} ({chips.length})
      </h2>
      {chips.length === 0 ? (
        <p className="mb-muted">{t("noProductSelected")}</p>
      ) : (
        <ul className="mb-chips">
          {chips.map((c) => (
            <li key={c.id} className="mb-chip">
              <span>
                {c.name}
                {showQty ? <bdi className="mb-chip-qty"> ×{c.qty}</bdi> : null}
              </span>
              <button type="button" className="mb-chip-x" aria-label={t("removeItem", { name: c.name })} onClick={() => onRemove(c.id)}>
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
