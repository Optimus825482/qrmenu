"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Locale } from "@/lib/i18n/locales";
import type { GuestCallOption } from "../../callOptions";
import { CallWaiterButton } from "./CallWaiterButton";
import { SelectionsDrawer } from "./SelectionsDrawer";
import { RECENT_ORDERS, totalQuantity, useSelectionStore } from "./selectionStore";

/** Bottom bar: the guest's recent orders, the call-waiter button and the selections button with its badge. */
export function GuestFooter({
  token,
  locale,
  orderingOpen,
  pricesShown,
  currency,
  callOptions = [],
}: {
  token: string;
  locale: Locale;
  orderingOpen: boolean;
  pricesShown: boolean;
  currency: string;
  callOptions?: GuestCallOption[];
}) {
  const t = useTranslations("guest");
  const store = useSelectionStore(token);
  const items = store((s) => s.items);
  const orderIds = store((s) => s.orderIds);
  const orderNos = store((s) => s.orderNos);
  const [open, setOpen] = useState(false);
  const count = totalQuantity(items);
  const recent = orderIds.slice(-RECENT_ORDERS).reverse();
  // A closed shop still shows pending selections so the guest can read the closed notice and keep them.
  const showSelections = orderingOpen || count > 0;

  return (
    <>
      {recent.length > 0 ? (
        <nav className="g-orders" aria-label={t("selections.mine")}>
          <span>{t("selections.mine")}</span>
          <ul>
            {recent.map((id) => (
              <li key={id}>
                <Link href={`/q/${encodeURIComponent(token)}/siparis/${encodeURIComponent(id)}`}>
                  {orderNos[id] === undefined ? "#" : `#${orderNos[id]}`}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <div className="g-footer-actions">
        <CallWaiterButton token={token} locale={locale} options={callOptions} />
        {showSelections ? (
          <button type="button" className="g-button" onClick={() => setOpen(true)}>
            {t("cart.title")}
            {count > 0 ? (
              <span className="g-count" data-testid="selection-count">
                {count}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
      {open ? (
        <SelectionsDrawer
          token={token}
          locale={locale}
          pricesShown={pricesShown}
          currency={currency}
          orderingOpen={orderingOpen}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
