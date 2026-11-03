"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { AllergenKey } from "../../allergens";
import type { GuestItem } from "../../server/guestMenu";
import { Icon, isIconName, type IconName } from "@/components/icons/Icon";
import { useModalFocusTrap } from "./useModalFocusTrap";

/** Her alerjen anahtarının SVG ikonu (`allergen-<anahtar>`); metin etiketi her zaman yanında gösterilir. */
export function allergenIconName(key: string): IconName {
  const name = `allergen-${key}`;
  return isIconName(name) ? name : "info";
}

export const MAX_QUANTITY = 20;
export const NOTE_MAX = 500;

export function AllergenIcons({ allergens }: { allergens: readonly string[] }) {
  const t = useTranslations("guest.allergen");
  if (allergens.length === 0) return null;
  return (
    <ul className="g-allergens">
      {allergens.map((key) => (
        <li key={key} title={t(key)} aria-label={t(key)}>
          <Icon name={allergenIconName(key)} size={20} />
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
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 40) {
      setActiveImageIdx((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    } else if (diff < -40) {
      setActiveImageIdx((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    }
    touchStartX.current = null;
  };

  const images: string[] = [];
  if (item.imageUrl) images.push(item.imageUrl);
  for (const url of item.imageUrls ?? []) {
    if (!images.includes(url)) images.push(url);
  }
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useModalFocusTrap({
    active: true,
    onClose,
    initialFocusRef: closeRef,
    containerRef: sheetRef,
  });

  const soldOut = !item.isAvailable;
  return (
    <div className="g-sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="g-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        onClick={(event) => event.stopPropagation()}
      >
        <button ref={closeRef} type="button" className="g-sheet-close" onClick={onClose} aria-label={t("common.close")}>
          <span aria-hidden="true">×</span>
        </button>
        {images.length > 1 ? (
          <>
            <div
              className="g-sheet-gallery"
              role="region"
              aria-label={t("common.gallery")}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="g-sheet-image"
                src={images[activeImageIdx]}
                alt={`${item.name} (${activeImageIdx + 1}/${images.length})`}
              />
              <button
                type="button"
                className="g-gallery-nav g-gallery-prev"
                onClick={() => setActiveImageIdx((prev) => (prev > 0 ? prev - 1 : images.length - 1))}
                aria-label={t("common.prevPhoto")}
              >
                ‹
              </button>
              <button
                type="button"
                className="g-gallery-nav g-gallery-next"
                onClick={() => setActiveImageIdx((prev) => (prev < images.length - 1 ? prev + 1 : 0))}
                aria-label={t("common.nextPhoto")}
              >
                ›
              </button>
              <div className="g-gallery-dots">
                {images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`g-gallery-dot ${i === activeImageIdx ? "is-active" : ""}`}
                    onClick={() => setActiveImageIdx(i)}
                    aria-label={t("common.photoIndex", { index: i + 1 })}
                  />
                ))}
              </div>
              <span className="g-gallery-counter">
                {activeImageIdx + 1} / {images.length}
              </span>
            </div>

            {/* Thumbnail mini strip */}
            <div className="g-gallery-strip" role="tablist" aria-label={t("common.gallery")}>
              {images.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  role="tab"
                  aria-selected={i === activeImageIdx}
                  className={`g-gallery-thumb ${i === activeImageIdx ? "is-active" : ""}`}
                  onClick={() => setActiveImageIdx(i)}
                  aria-label={t("common.selectPhoto", { index: i + 1 })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" />
                </button>
              ))}
            </div>
          </>
        ) : images.length === 1 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="g-sheet-image" src={images[0]} alt={item.name} />
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
                    <Icon name={allergenIconName(key)} size={20} />{" "}
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
