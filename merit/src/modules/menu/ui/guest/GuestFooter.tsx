"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EnvLabel } from "@/components/EnvLabel";
import type { Locale } from "@/lib/i18n/locales";
import type { GuestCallOption } from "../../callOptions";
import type { CallWaiterPosition } from "../../design";
import { CallWaiterButton } from "./CallWaiterButton";
import type { GuestMenuMode } from "./MenuView";
import { SelectionsDrawer } from "./SelectionsDrawer";
import { RECENT_ORDERS, totalQuantity, useSelectionStore } from "./selectionStore";

/** Bottom bar: the guest's recent orders, the call-waiter button and the selections button with its badge. */
export function GuestFooter({
  token,
  locale,
  orderingOpen,
  pricesShown,
  currency,
  mode = "table",
  callOptions = [],
  callWaiterText,
  callWaiterPosition = "STICKY_FOOTER",
}: {
  token: string;
  locale: Locale;
  orderingOpen: boolean;
  pricesShown: boolean;
  currency: string;
  mode?: GuestMenuMode;
  callOptions?: GuestCallOption[];
  callWaiterText?: string;
  callWaiterPosition?: CallWaiterPosition;
}) {
  const t = useTranslations("guest");
  const store = useSelectionStore(token);
  const items = store((s) => s.items);
  const orderIds = store((s) => s.orderIds);
  const orderNos = store((s) => s.orderNos);
  const [open, setOpen] = useState(false);
  const count = totalQuantity(items);
  const recent = orderIds.slice(-RECENT_ORDERS).reverse();
  // Table guests can still open pending selections and read the closed notice.
  const showSelections = orderingOpen || (mode === "table" && count > 0);
  const showCallWaiter = mode === "table" && callWaiterPosition === "STICKY_FOOTER";

  if (!showCallWaiter && !showSelections && recent.length === 0) {
    return null;
  }

  return (
    <>
      <EnvLabel />
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
        {showCallWaiter ? (
          <CallWaiterButton token={token} locale={locale} options={callOptions} customText={callWaiterText} />
        ) : null}
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
          mode={mode}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
