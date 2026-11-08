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
import { Icon } from "@/components/icons/Icon";

const FEATURED_TAGS = new Set<ItemTagId>(["SEFIN_SECIMI", "POPULER"]);

export type GuestMenuMode = "table" | "room";

function categoryItemCount(category: GuestCategory): number {
  let count = category.items.length;
  for (const sub of category.subcategories) {
    count += sub.items.length;
    for (const group of sub.groups) {
      count += group.items.length;
    }
  }
  return count;
}

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
  photoCountLabel,
  showPrice,
  photoIds,
}: {
  items: GuestItem[];
  onOpen(id: string): void;
  format(price: string): string;
  soldOutLabel: string;
  photoCountLabel: (count: number) => string;
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
              <span className="g-thumb-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="g-thumb"
                  src={item.imageUrl}
                  alt={item.name}
                  loading="lazy"
                  decoding="async"
                  width={144}
                  height={144}
                />
                {item.imageUrls && item.imageUrls.length > 1 ? (
                  <span className="g-thumb-count" aria-label={photoCountLabel(item.imageUrls.length)}>
                    <Icon name="camera" size={16} /> {item.imageUrls.length}
                  </span>
                ) : null}
              </span>
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
 * Ordering controls appear only when the outlet is taking orders and a guest token is present.
 */
export function MenuView({ menu, locale, token, mode = "table" }: {
  menu: GuestMenu;
  locale: Locale;
  token?: string;
  mode?: GuestMenuMode;
}) {
  const t = useTranslations("guest");
  const { state, categories } = menu;
  const [query, setQuery] = useState("");
  const [tagFilters, setTagFilters] = useState<ItemTagId[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const store = useSelectionStore(token ?? "studio-onizleme");
  const addSelection = store((s) => s.add);

  const needle = query.trim().toLocaleLowerCase(locale);
  const visible = useMemo(() => {
    const matches = (item: GuestItem) => {
      if (!item.isAvailable) return false;
      if (tagFilters.length > 0 && !item.tags.some((tag) => tagFilters.includes(tag as ItemTagId))) return false;
      if (!needle) return true;
      return `${item.name} ${item.detail ?? ""}`.toLocaleLowerCase(locale).includes(needle);
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
  }, [categories, needle, tagFilters, locale]);

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

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (visible.length === 0) return;
    const currentIndex = visible.findIndex((cat) => cat.id === activeId);
    let nextIndex = currentIndex;

    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % visible.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + visible.length) % visible.length;
    } else if (e.key === "ArrowDown") {
      nextIndex = currentIndex + 2 < visible.length ? currentIndex + 2 : currentIndex;
    } else if (e.key === "ArrowUp") {
      nextIndex = currentIndex - 2 >= 0 ? currentIndex - 2 : currentIndex;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = visible.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextCategory = visible[nextIndex];
    if (nextCategory) {
      setPicked(nextCategory.id);
      const tabEl = document.getElementById(`g-tab-${nextCategory.id}`);
      tabEl?.focus();
    }
  };

  const blocks: Record<string, ReactNode> = {
    hero:
      options.hero === "NONE" ? null : (
        <section className="g-design-hero" key="hero" data-photo={heroPhoto ? "true" : undefined}>
          {heroPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="g-hero-img"
              src={heroPhoto}
              alt={`${state.outletName} · ${state.hotelName}`}
              loading="eager"
              fetchPriority="high"
            />
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
          <div
            data-guide="kategori-gezin"
            className="g-tabs"
            role="tablist"
            aria-label={t(mode === "room" ? "rs.menu.title" : "menu.title")}
            onKeyDown={handleTabKeyDown}
          >
            {visible.map((category) => (
              <button
                key={category.id}
                type="button"
                role="tab"
                id={`g-tab-${category.id}`}
                aria-selected={category.id === activeId}
                tabIndex={category.id === activeId ? 0 : -1}
                aria-controls="g-panel"
                onClick={(e) => {
                  setPicked(category.id);
                  e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
                }}
              >
                <span className="g-tab-label">{category.name}</span>
                <span className="g-tab-count" aria-label={t("menu.itemsFound", { count: categoryItemCount(category) })}>
                  {categoryItemCount(category)}
                </span>
              </button>
            ))}
          </div>
        )}
        {showTools ? (
        <div className="g-tools">
          {options.showSearch ? (
            <div className="g-search-wrap">
              <Icon name="search" size={20} className="g-search-icon" />
              <input
                className="g-search"
                type="search"
                value={query}
                placeholder={t("menu.search")}
                aria-label={t("menu.search")}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <button
                  type="button"
                  className="g-search-clear"
                  onClick={() => setQuery("")}
                  aria-label={t("menu.clearSearch")}
                  title={t("menu.clear")}
                >
                  ×
                </button>
              ) : null}
            </div>
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
          {needle || tagFilters.length > 0 ? (
            <div className="g-filter-banner" role="status">
              <span>
                {needle ? `"${needle}" ` : ""}
                {tagFilters.length > 0 ? `[${tagFilters.map((tag) => t(`tag.${tag}`)).join(", ")}] ` : ""}
                • {t("menu.itemsFound", { count: visible.reduce((acc, cat) => acc + categoryItemCount(cat), 0) })}
              </span>
              <button
                type="button"
                className="g-filter-clear-all"
                onClick={() => {
                  setQuery("");
                  setTagFilters([]);
                }}
              >
                {t("menu.clear")} ×
              </button>
            </div>
          ) : null}
          {active && active.subcategories.length > 1 ? (
            <div className="g-sub-nav" role="navigation" aria-label={t("menu.subcategories")}>
              {directItems.length > 0 ? (
                <button
                  type="button"
                  className="g-sub-chip"
                  onClick={() => {
                    const el = document.getElementById("g-direct-items");
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {t("menu.all")} ({directItems.length})
                </button>
              ) : null}
              {active.subcategories.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  className="g-sub-chip"
                  onClick={() => {
                    const el = document.getElementById(`g-sub-${sub.id}`);
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {sub.name} ({sub.items.length + sub.groups.reduce((a, g) => a + g.items.length, 0)})
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
          <section id="g-direct-items" className="g-sub">
            <ItemCards
              items={directItems}
              onOpen={setOpenId}
              format={format}
              soldOutLabel={t("menu.soldOut")}
              photoCountLabel={(cnt) => t("menu.photoCount", { count: cnt })}
              showPrice={showPrice}
              photoIds={photoIds}
            />
          </section>
        ) : null}
        {active?.subcategories.map((sub) => (
          <section key={sub.id} id={`g-sub-${sub.id}`} className="g-sub">
            <h2>{sub.name}</h2>
            {sub.items.length > 0 ? (
              <ItemCards
                items={sub.items}
                onOpen={setOpenId}
                format={format}
                soldOutLabel={t("menu.soldOut")}
                photoCountLabel={(cnt) => t("menu.photoCount", { count: cnt })}
                showPrice={showPrice}
                photoIds={photoIds}
              />
            ) : null}
            {sub.groups.map((group) => (
              <div key={group.id} className="g-group">
                <h3>{group.name}</h3>
                {group.detail ? <p className="g-detail">{group.detail}</p> : null}
                <ItemCards
                  items={group.items}
                  onOpen={setOpenId}
                  format={format}
                  soldOutLabel={t("menu.soldOut")}
                  photoCountLabel={(cnt) => t("menu.photoCount", { count: cnt })}
                  showPrice={showPrice}
                  photoIds={photoIds}
                />
              </div>
            ))}
          </section>
        ))}
        {active && (directItems.length > 4 || active.subcategories.length > 1) ? (
          <div className="g-back-top-wrap">
            <button
              type="button"
              className="g-back-top"
              onClick={() => {
                const tabsEl = document.querySelector(".g-tabs");
                tabsEl?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              ↑ {t("menu.backToTop")}
            </button>
          </div>
        ) : null}
        <p className="g-legal">{t("menu.allergenNote")}</p>
      </div>
    ),
  };

  const Container = mode === "room" ? "div" : "main";
  return (
    <Container className="g-menu">
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
    </Container>
  );
}
