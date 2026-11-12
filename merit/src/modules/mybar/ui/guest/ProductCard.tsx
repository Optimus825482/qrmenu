"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons/Icon";

/**
 * One product with a `− n +` stepper. `max` is the most the guest may pick of this product, `canIncrease`
 * lets the caller switch the + button off earlier (the swap balance); nothing explains why, the button just rests.
 * Prices are never shown.
 */
export function ProductCard({
  name,
  hint,
  qty,
  max,
  canIncrease = true,
  onChange,
}: {
  name: string;
  hint?: string;
  qty: number;
  max: number;
  canIncrease?: boolean;
  onChange: (qty: number) => void;
}) {
  const t = useTranslations("mybar");
  return (
    <li className={`mb-product${qty > 0 ? " is-selected" : ""}`}>
      <span className="mb-product-text">
        <span className="mb-product-name">{name}</span>
        {hint ? <span className="mb-product-hint">{hint}</span> : null}
      </span>
      <span className="mb-stepper" role="group" aria-label={name}>
        <button
          type="button"
          className="mb-step"
          aria-label={t("decrease", { name })}
          disabled={qty <= 0}
          onClick={() => onChange(qty - 1)}
        >
          <Icon name="minus" size={20} />
        </button>
        <output className="mb-qty" aria-live="polite">
          {qty}
        </output>
        <button
          type="button"
          className="mb-step mb-step-plus"
          aria-label={t("increase", { name })}
          disabled={!canIncrease || qty >= max}
          onClick={() => onChange(qty + 1)}
        >
          <Icon name="plus" size={20} />
        </button>
      </span>
    </li>
  );
}
