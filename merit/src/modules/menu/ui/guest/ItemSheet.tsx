"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { AllergenKey } from "../../allergens";
import type { GuestItem } from "../../server/guestMenu";

export const ALLERGEN_ICON: Record<AllergenKey, string> = {
  gluten: "🌾",
  sut: "🥛",
  yumurta: "🥚",
  kuruyemis: "🥜",
  deniz_urunu: "🦐",
  alkol: "🍷",
  soya: "🫘",
  susam: "🌱",
};

export const MAX_QUANTITY = 20;
export const NOTE_MAX = 500;

export function AllergenIcons({ allergens }: { allergens: readonly string[] }) {
  const t = useTranslations("guest.allergen");
  if (allergens.length === 0) return null;
  return (
    <ul className="g-allergens">
      {allergens.map((key) => (
        <li key={key} title={t(key)} aria-label={t(key)}>
          <span aria-hidden="true">{ALLERGEN_ICON[key as AllergenKey] ?? "•"}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Bottom sheet of one item: large picture, detail, allergen list and, only while ordering is open,
 * the quantity picker (1-20), a note and the add-to-selections button. `onAdd` is wired by the
 * ordering flow; a sold-out item can be read but not added.
 */
export function ItemSheet({
  item,
  price,
  orderingOpen,
  onClose,
  onAdd,
}: {
  item: GuestItem;
  /** Already formatted; undefined when prices are hidden. */
  price?: string;
  orderingOpen: boolean;
  onClose: () => void;
  onAdd?: (item: GuestItem, quantity: number, note: string) => void;
}) {
  const t = useTranslations("guest");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const soldOut = !item.isAvailable;
  return (
    <div className="g-sheet-backdrop" onClick={onClose}>
      <div
        className="g-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        onClick={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="g-sheet-close" onClick={onClose} aria-label={t("common.close")}>
          <span aria-hidden="true">×</span>
        </button>
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="g-sheet-image" src={item.imageUrl} alt={item.name} />
        ) : (
          <div className="g-sheet-image g-placeholder" aria-hidden="true" />
        )}
        <div className="g-sheet-body">
          <h2>{item.name}</h2>
          {price ? <p className="g-price">{price}</p> : null}
          {soldOut ? <p className="g-badge">{t("menu.soldOut")}</p> : null}
          {item.detail ? <p className="g-detail">{item.detail}</p> : null}
          {item.allergens.length > 0 ? (
            <section aria-label={t("menu.allergens")}>
              <h3>{t("menu.allergens")}</h3>
              <ul className="g-allergen-list">
                {item.allergens.map((key) => (
                  <li key={key}>
                    <span aria-hidden="true">{ALLERGEN_ICON[key as AllergenKey] ?? "•"}</span>{" "}
                    {t(`allergen.${key as AllergenKey}`)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {orderingOpen ? (
            <div className="g-order-box">
              <div className="g-qty" role="group" aria-label={t("cart.quantity")}>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  aria-label="−"
                >
                  −
                </button>
                <output aria-live="polite">{quantity}</output>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                  disabled={quantity >= MAX_QUANTITY}
                  aria-label="+"
                >
                  +
                </button>
              </div>
              <label className="g-note">
                <span>{t("cart.note")}</span>
                <textarea
                  value={note}
                  maxLength={NOTE_MAX}
                  rows={2}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="g-button"
                disabled={soldOut}
                onClick={() => {
                  onAdd?.(item, quantity, note.trim());
                  onClose();
                }}
              >
                {t("cart.add")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
