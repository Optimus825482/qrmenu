"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons/Icon";

export type Chip = { id: string; name: string; qty: number };

/** Summary of one step's picks: a heading, one chip per chosen product with a remove button; empty text when none. */
export function SelectionChips({
  title,
  chips,
  onRemove,
}: {
  title: string;
  chips: Chip[];
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("mybar");
  const titleId = useId();
  return (
    <section className="mb-selected" aria-labelledby={titleId}>
      <h3 id={titleId} className="mb-label">
        {title}
      </h3>
      {chips.length === 0 ? (
        <p className="mb-muted">{t("noProductSelected")}</p>
      ) : (
        <ul className="mb-chips">
          {chips.map((c) => (
            <li key={c.id} className="mb-chip">
              <span>
                {c.name}
                <bdi className="mb-chip-qty"> ×{c.qty}</bdi>
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
