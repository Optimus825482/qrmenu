"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import type { Locale } from "@/lib/i18n/locales";
import type { GuestItem, GuestMenu } from "../../server/guestMenu";
import { AllergenIcons, ItemSheet } from "./ItemSheet";
import { useGuestEvents } from "./useGuestEvents";

const NO_ORDERS: readonly string[] = [];

function priceFormatter(locale: Locale, currency: string): (amount: string) => string {
  try {
    const fmt = new Intl.NumberFormat(locale, { style: "currency", currency });
    return (amount) => fmt.format(Number(amount));
  } catch {
    return (amount) => `${amount} ${currency}`;
  }
}

function findItem(categories: GuestMenu["categories"], id: string): GuestItem | undefined {
  for (const cat of categories)
    for (const sub of cat.subcategories)
      for (const group of sub.groups) {
        const found = group.items.find((i) => i.id === id);
        if (found) return found;
      }
  return undefined;
}

/**
 * The guest menu: category tabs (horizontal scroll) -> subcategory headings -> groups -> item cards.
 * `menu.availability` flips a card in place from the SSE stream; every other change arrives as new
 * server props (the hook refreshes the route).
 */
export function MenuBrowser({ token, locale, menu }: { token: string; locale: Locale; menu: GuestMenu }) {
  const t = useTranslations("guest");
  const { state, categories } = menu;

  // Availability pushed over SSE, dropped whenever the server sends a fresh menu.
  const [seen, setSeen] = useState(menu);
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  if (seen !== menu) {
    setSeen(menu);
    setAvailability({});
  }

  const { connected } = useGuestEvents(
    token,
    NO_ORDERS,
    useCallback((event) => {
      if (event.type !== "menu.availability") return;
      const p = event.payload as { nodeId?: unknown; available?: unknown } | undefined;
      if (typeof p?.nodeId === "string" && typeof p.available === "boolean") {
        const { nodeId, available } = p as { nodeId: string; available: boolean };
        setAvailability((prev) => ({ ...prev, [nodeId]: available }));
      }
    }, []),
  );

  const [picked, setPicked] = useState<string | null>(null);
  const activeId = categories.some((c) => c.id === picked) ? picked : (categories[0]?.id ?? null);
  const active = categories.find((c) => c.id === activeId);
  const [openId, setOpenId] = useState<string | null>(null);

  const format = priceFormatter(locale, state.currency);
  const withLive = (item: GuestItem): GuestItem => ({
    ...item,
    isAvailable: availability[item.id] ?? item.isAvailable,
  });
  const openItem = openId ? findItem(categories, openId) : undefined;
  const openLive = openItem ? withLive(openItem) : null;

  return (
    <main className="g-menu">
      {!connected ? (
        <p className="g-banner g-banner-warn" role="status">
          {t("common.offline")}
        </p>
      ) : null}
      {!state.orderingOpen ? (
        <p className="g-banner" role="status">
          {t("menu.orderingClosed")}
        </p>
      ) : null}

      {categories.length === 0 ? (
        <p className="g-empty">{t("menu.empty")}</p>
      ) : (
        <>
          <div className="g-tabs" role="tablist" aria-label={t("menu.title")}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                id={`g-tab-${cat.id}`}
                aria-selected={cat.id === activeId}
                aria-controls="g-panel"
                onClick={() => setPicked(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>
          <div id="g-panel" role="tabpanel" aria-labelledby={activeId ? `g-tab-${activeId}` : undefined}>
            {active?.subcategories.map((sub) => (
              <section key={sub.id} className="g-sub">
                <h2>{sub.name}</h2>
                {sub.groups.map((group) => (
                  <div key={group.id} className="g-group">
                    <h3>{group.name}</h3>
                    {group.detail ? <p className="g-detail">{group.detail}</p> : null}
                    <ul className="g-cards">
                      {group.items.map((raw) => {
                        const item = withLive(raw);
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              className="g-card"
                              data-available={item.isAvailable ? "true" : "false"}
                              onClick={() => setOpenId(item.id)}
                            >
                              {item.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img className="g-thumb" src={item.imageUrl} alt="" loading="lazy" />
                              ) : (
                                <span className="g-thumb g-placeholder" aria-hidden="true" />
                              )}
                              <span className="g-card-text">
                                <span className="g-name">{item.name}</span>
                                {item.detail ? <span className="g-detail g-clamp">{item.detail}</span> : null}
                                <AllergenIcons allergens={item.allergens} />
                              </span>
                              <span className="g-card-side">
                                {item.price ? <span className="g-price">{format(item.price)}</span> : null}
                                {!item.isAvailable ? <span className="g-badge">{t("menu.soldOut")}</span> : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      )}

      {openLive ? (
        <ItemSheet
          item={openLive}
          price={openLive.price ? format(openLive.price) : undefined}
          orderingOpen={state.orderingOpen}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </main>
  );
}
