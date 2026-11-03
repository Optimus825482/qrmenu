"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons/Icon";
import type { CatalogProduct } from "../../server/catalog";

/** One product: `− n +` stepper (quantity mode) or a tick box (tick mode). Prices are never shown. */
export function ProductCard({
  product,
  qty,
  mode,
  onChange,
}: {
  product: CatalogProduct;
  qty: number;
  mode: "QTY" | "TICK";
  onChange: (qty: number) => void;
}) {
  const t = useTranslations("mybar");
  const name = product.nameLocal;
  const selected = qty > 0;

  if (mode === "TICK") {
    return (
      <li className={`mb-product${selected ? " is-selected" : ""}`}>
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={t("tickLabel", { name })}
          className="mb-tick"
          onClick={() => onChange(selected ? 0 : 1)}
        >
          <span className="mb-tick-name">{name}</span>
          <span className="mb-tick-box" aria-hidden="true">
            {selected ? <Icon name="check" size={20} /> : null}
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className={`mb-product${selected ? " is-selected" : ""}`}>
      <span className="mb-product-name">{name}</span>
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
          disabled={qty >= product.maxQty}
          onClick={() => onChange(qty + 1)}
        >
          <Icon name="plus" size={20} />
        </button>
      </span>
    </li>
  );
}
