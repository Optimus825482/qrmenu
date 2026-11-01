"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { ITEM_TAG_IDS, type ItemTagId } from "../../design";
import type { GuestCategory, GuestItem, GuestMenu } from "../../server/guestMenu";
import { AllergenIcons, ItemSheet } from "./ItemSheet";
import { categoryItems, curatedPhotoIds } from "./menuPresentation";
import { priceFormatter } from "./priceFormat";
import { useSelectionStore } from "./selectionStore";

const FEATURED_TAGS = new Set<ItemTagId>(["SEFIN_SECIMI", "POPULER"]);

function findItem(categories: GuestCategory[], id: string): GuestItem | undefined {
  for (const category of categories) {
    const direct = category.items.find((item) => item.id === id);
    if (direct) return direct;
    for (const sub of category.subcategories) {
      const nested = sub.items.find((item) => item.id === id);
      if (nested) return nested;
      for (const group of sub.groups) {
        const found = group.items.find((item) => item.id === id);
        if (found) return found;
      }
    }
  }
  return undefined;
}

function ItemCards({
  items,
  onOpen,
  format,
  soldOutLabel,
  showPrice,
  photoIds,
}: {
  items: GuestItem[];
  onOpen(id: string): void;
  format(price: string): string;
  soldOutLabel: string;
  showPrice: boolean;
  /** Curated-photo mode: only these dishes show a photo (large); null shows photos as usual. */
  photoIds: Set<string> | null;
}) {
  return (
    <ul className="g-cards">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="g-card"
            data-available={item.isAvailable ? "true" : "false"}
            data-photo={photoIds ? (photoIds.has(item.id) ? "big" : "off") : undefined}
            onClick={() => onOpen(item.id)}
          >
            {photoIds && !photoIds.has(item.id) ? null : item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="g-thumb" src={item.imageUrl} alt="" loading="lazy" />
            ) : (
              <span className="g-thumb g-placeholder" aria-hidden="true" />
            )}
            <span className="g-card-text">
              <TagList tags={item.tags} />
              <span className="g-name">{item.name}</span>
              {item.detail ? <span className="g-detail g-clamp">{item.detail}</span> : null}
              <AllergenIcons allergens={item.allergens} />
            </span>
            <span className="g-card-side">
              {showPrice && item.price ? <span className="g-price">{format(item.price)}</span> : null}
              {!item.isAvailable ? <span className="g-badge">{soldOutLabel}</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function TagList({ tags }: { tags: readonly string[] }) {
  const t = useTranslations("guest.tag");
  const known = tags.filter((tag): tag is ItemTagId => (ITEM_TAG_IDS as readonly string[]).includes(tag));
  if (known.length === 0) return null;
  return (
    <span className="g-tags">
      {known.map((tag) => (
        <span key={tag} className="g-tag" data-tag={tag}>
          {t(tag)}
        </span>
      ))}
    </span>
  );
}

/**
 * The guest menu surface shared by the public QR page and the design studio.
 * Ordering controls appear only when the outlet is taking orders and a table token is present.
 */
export function MenuView({ menu, locale, token }: { menu: GuestMenu; locale: Locale; token?: string }) {
  const t = useTranslations("guest");
  const { state, categories } = menu;
  const [query, setQuery] = useState("");
  const [tagFilters, setTagFilters] = useState<ItemTagId[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const store = useSelectionStore(token ?? "studio-onizleme");
  const addSelection = store((s) => s.add);

  const needle = query.trim().toLocaleLowerCase("tr");
  const visible = useMemo(() => {
    const matches = (item: GuestItem) => {
      if (!item.isAvailable) return false;
      if (tagFilters.length > 0 && !item.tags.some((tag) => tagFilters.includes(tag as ItemTagId))) return false;
      if (!needle) return true;
      return `${item.name} ${item.detail ?? ""}`.toLocaleLowerCase("tr").includes(needle);
    };
    return categories
      .map((category) => ({
        ...category,
        items: category.items.filter(matches),
        subcategories: category.subcategories
          .map((sub) => ({
            ...sub,
            items: sub.items.filter(matches),
            groups: sub.groups
              .map((group) => ({ ...group, items: group.items.filter(matches) }))
              .filter((group) => group.items.length > 0),
          }))
          .filter((sub) => sub.items.length > 0 || sub.groups.length > 0),
      }))
      .filter((category) => category.items.length > 0 || category.subcategories.length > 0);
  }, [categories, needle, tagFilters]);

  const activeId = visible.some((category) => category.id === picked) ? picked : (visible[0]?.id ?? null);
  const active = visible.find((category) => category.id === activeId);
  const presentTags = new Set(categories.flatMap((category) => categoryItems(category).flatMap((item) => item.tags)));
  const featured = (active ? categoryItems(active) : []).filter((item) =>
    item.tags.some((tag) => FEATURED_TAGS.has(tag as ItemTagId)),
  );
  const directItems = active?.items ?? [];
  const showPrice = state.pricesShown;
  const format = priceFormatter(locale, state.currency);
  const featuredTitle = state.design.options.featuredTitle.trim() || t("menu.featured");
  const openItem = openId ? findItem(categories, openId) : undefined;
  const visibleOpenItem = openItem?.isAvailable ? openItem : undefined;
  const orderingOpen = Boolean(token) && state.orderingOpen;
  const options = state.design.options;
  const photoIds = useMemo(() => (options.curatedPhotos ? curatedPhotoIds(categories) : null), [categories, options.curatedPhotos]);
  // A photo hero without a picked image reads as the plain title block.
  const heroPhoto = options.hero === "PHOTO" && options.heroImageUrl !== "" ? options.heroImageUrl : null;
  const showTools = options.showSearch || options.showFilters;

  const blocks: Record<string, ReactNode> = {
    hero:
      options.hero === "NONE" ? null : (
        <section className="g-design-hero" key="hero" data-photo={heroPhoto ? "true" : undefined}>
          {heroPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="g-hero-img" src={heroPhoto} alt="" loading="eager" />
          ) : null}
          <span>{state.hotelName}</span>
          <h2>{state.outletName}</h2>
        </section>
      ),
    categories: (
      <div key="categories">
        {categories.length === 0 ? (
          <p className="g-empty">{t("menu.empty")}</p>
        ) : (
          <div className="g-tabs" role="tablist" aria-label={t("menu.title")}>
            {visible.map((category) => (
              <button
                key={category.id}
                type="button"
                role="tab"
                id={`g-tab-${category.id}`}
                aria-selected={category.id === activeId}
                aria-controls="g-panel"
                onClick={() => setPicked(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}
        {showTools ? (
        <div className="g-tools">
          {options.showSearch ? (
            <input
              className="g-search"
              type="search"
              value={query}
              placeholder={t("menu.search")}
              aria-label={t("menu.search")}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}
          {options.showFilters && ITEM_TAG_IDS.some((tag) => presentTags.has(tag)) ? (
            <div className="g-filters" role="group" aria-label={t("menu.filters")}>
              {ITEM_TAG_IDS.filter((tag) => presentTags.has(tag)).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={tagFilters.includes(tag)}
                  onClick={() =>
                    setTagFilters((current) =>
                      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
                    )
                  }
                >
                  {t(`tag.${tag}`)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        ) : null}
      </div>
    ),
    items: (
      <div id="g-panel" role="tabpanel" aria-labelledby={activeId ? `g-tab-${activeId}` : undefined} key="items">
        {visible.length === 0 && categories.length > 0 ? <p className="g-empty">{t("menu.noResults")}</p> : null}
        {featured.length > 0 ? (
          <section className="g-sub" aria-label={featuredTitle}>
            <h2>{featuredTitle}</h2>
            <ul className="g-featured">
              {featured.map((item) => (
                <li key={item.id}>
                  <button type="button" className="g-featured-card" onClick={() => setOpenId(item.id)}>
                    {options.showImages && item.imageUrl && (photoIds === null || photoIds.has(item.id)) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" />
                    ) : null}
                    <span>{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {directItems.length > 0 ? (
          <section className="g-sub">
            <ItemCards items={directItems} onOpen={setOpenId} format={format} soldOutLabel={t("menu.soldOut")} showPrice={showPrice} photoIds={photoIds} />
          </section>
        ) : null}
        {active?.subcategories.map((sub) => (
          <section key={sub.id} className="g-sub">
            <h2>{sub.name}</h2>
            {sub.items.length > 0 ? (
              <ItemCards items={sub.items} onOpen={setOpenId} format={format} soldOutLabel={t("menu.soldOut")} showPrice={showPrice} photoIds={photoIds} />
            ) : null}
            {sub.groups.map((group) => (
              <div key={group.id} className="g-group">
                <h3>{group.name}</h3>
                {group.detail ? <p className="g-detail">{group.detail}</p> : null}
                <ItemCards items={group.items} onOpen={setOpenId} format={format} soldOutLabel={t("menu.soldOut")} showPrice={showPrice} photoIds={photoIds} />
              </div>
            ))}
          </section>
        ))}
        <p className="g-legal">{t("menu.allergenNote")}</p>
      </div>
    ),
  };

  return (
    <main className="g-menu">
      {state.design.layout.map((block) => blocks[block])}
      {visibleOpenItem ? (
        <ItemSheet
          item={visibleOpenItem}
          price={showPrice && visibleOpenItem.price ? format(visibleOpenItem.price) : undefined}
          orderingOpen={orderingOpen}
          onClose={() => setOpenId(null)}
          onAdd={(item, quantity, note) =>
            addSelection({
              menuNodeId: item.id,
              name: item.name,
              qty: quantity,
              ...(note ? { note } : {}),
              ...(item.price ? { unitPrice: item.price } : {}),
            })
          }
        />
      ) : null}
    </main>
  );
}
