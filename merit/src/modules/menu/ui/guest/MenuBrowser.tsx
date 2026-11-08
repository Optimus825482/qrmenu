"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n/locales";
import type { GuestItem, GuestMenu } from "../../server/guestMenu";
import { MenuView, type GuestMenuMode } from "./MenuView";
import { useGuestEvents } from "./useGuestEvents";

const NO_ORDERS: readonly string[] = [];

function withAvailability(menu: GuestMenu, availability: Record<string, boolean>): GuestMenu {
  const mapItem = (item: GuestItem): GuestItem =>
    availability[item.id] === undefined ? item : { ...item, isAvailable: availability[item.id] };
  return {
    ...menu,
    categories: menu.categories.map((category) => ({
      ...category,
      items: category.items.map(mapItem),
      subcategories: category.subcategories.map((sub) => ({
        ...sub,
        items: sub.items.map(mapItem),
        groups: sub.groups.map((group) => ({ ...group, items: group.items.map(mapItem) })),
      })),
    })),
  };
}

/**
 * The guest menu. `menu.availability` flips a card in place from the SSE stream; every other change
 * arrives as new server props (the hook refreshes the route).
 */
export function MenuBrowser({ token, locale, menu, mode = "table" }: {
  token: string;
  locale: Locale;
  menu: GuestMenu;
  mode?: GuestMenuMode;
}) {
  const t = useTranslations("guest");
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
      const payload = event.payload as { nodeId?: unknown; available?: unknown } | undefined;
      if (typeof payload?.nodeId === "string" && typeof payload.available === "boolean") {
        const { nodeId, available } = payload as { nodeId: string; available: boolean };
        setAvailability((prev) => ({ ...prev, [nodeId]: available }));
      }
    }, []),
  );

  const live = useMemo(() => withAvailability(menu, availability), [menu, availability]);

  return (
    <>
      {!connected ? (
        <p className="g-banner g-banner-warn" role="status">
          {t("common.offline")}
        </p>
      ) : null}
      <MenuView menu={live} locale={locale} token={token} mode={mode} />
    </>
  );
}
