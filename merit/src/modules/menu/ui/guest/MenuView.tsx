"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { COVER_IMAGE_PATTERN, effectiveCategoryTabStyle, ITEM_TAG_IDS, type ItemTagId, resolveHeroFont } from "../../design";
import type { GuestCategory, GuestItem, GuestMenu } from "../../server/guestMenu";
import { AllergenIcons, ItemSheet } from "./ItemSheet";
import { CallWaiterButton } from "./CallWaiterButton";
import { categoryItems, curatedPhotoIds, isPriceList } from "./menuPresentation";
import { priceFormatter } from "./priceFormat";
import { resetMobileZoomAndOpen } from "./zoomReset";
import { useSelectionStore } from "./selectionStore";
import { Icon } from "@/components/icons/Icon";

const FEATURED_TAGS = new Set<ItemTagId>(["SEFIN_SECIMI", "POPULER"]);

export type GuestMenuMode = "table" | "room";

/** First dish photo of a category; the cover of its tile in the photo-tile navigation. */
/** Lower-cases for search and drops the dotted/dotless i difference (also the combining dot of "i\u0307"). */
function foldSearch(text: string, locale: string): string {
  return text.toLocaleLowerCase(locale).replaceAll("\u0131", "i").replaceAll("i\u0307", "i");
}

function categoryPhoto(category: GuestCategory): string | undefined {
  return categoryItems(category).find((item) => item.isAvailable && item.imageUrl)?.imageUrl ?? undefined;
}

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
  photoCountLabel,
  showPrice,
  photoIds,
  priceLists,
}: {
  items: GuestItem[];
  onOpen(id: string): void;
  format(price: string): string;
  photoCountLabel: (count: number) => string;
  showPrice: boolean;
  /** Curated-photo mode: only these dishes show a photo (large); null shows photos as usual. */
  photoIds: Set<string> | null;
  /** Design option: lists without descriptions or without photos are drawn as a text price list. */
  priceLists: boolean;
}) {
  if (priceLists && isPriceList(items)) {
    return (
      <ul className="g-plist">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="g-prow"
              data-available={item.isAvailable ? "true" : "false"}
              onClick={() => onOpen(item.id)}
            >
              <span className="g-prow-text">
                <TagList tags={item.tags} />
                <span className="g-name">{item.name}</span>
                {item.detail ? <span className="g-detail g-clamp">{item.detail}</span> : null}
                <AllergenIcons allergens={item.allergens} />
              </span>
              {showPrice && item.price ? <span className="g-price">{format(item.price)}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    );
  }
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
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Floating "back to top": appears at the bottom right once the guest has scrolled a screen or so down, scrolls
 * the menu back to its start when tapped and hides again there. Works whether the page or a frame scrolls.
 */
function BackToTop({ label }: { label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLElement | Window | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let target: HTMLElement | Window = window;
    for (let el = ref.current?.parentElement ?? null; el && el !== document.body; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      // Only a box that really clips its content scrolls; `overflow: auto` on a full-height frame does not.
      if ((overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight + 1) {
        target = el;
        break;
      }
    }
    scroller.current = target;
    const read = () => setShown((target instanceof Window ? target.scrollY : target.scrollTop) > 480);
    target.addEventListener("scroll", read, { passive: true });
    read();
    return () => target.removeEventListener("scroll", read);
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className="g-top-fab"
      data-shown={shown ? "true" : undefined}
      aria-label={label}
      title={label}
      tabIndex={shown ? 0 : -1}
      aria-hidden={shown ? undefined : true}
      onClick={() => scroller.current?.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <span className="g-acc-chevron" data-up="true" aria-hidden="true" />
    </button>
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
  // A venue keeps its proper name in every language; "Oda Servisi" is a service label and follows the guest's language.
  const outletTitle = state.isRoomService ? t("room.card.roomService") : state.outletName;
  const [query, setQuery] = useState("");
  const [tagFilters, setTagFilters] = useState<ItemTagId[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const handleOpenItem = (id: string) => {
    resetMobileZoomAndOpen(() => setOpenId(id));
  };
  const store = useSelectionStore(token ?? "studio-onizleme");
  const addSelection = store((s) => s.add);

  // Saved selections follow the current menu: a dish that is gone or sold out is dropped (with a notice
  // in the drawer), name and price come from the menu. Only for a real table/room token, after hydration.
  useEffect(() => {
    if (!token) return;
    const available = new Map<string, { name: string; price?: string }>();
    for (const category of categories) {
      for (const item of categoryItems(category)) {
        if (item.isAvailable) available.set(item.id, { name: item.name, ...(item.price ? { price: item.price } : {}) });
      }
    }
    const run = () => store.getState().reconcile(available);
    if (store.persist.hasHydrated()) run();
    return store.persist.onFinishHydration(run);
  }, [store, token, categories]);

  // Search ignores the dotted/dotless i difference: in Turkish "MOJITO" lower-cases to "mojıto", which a guest
  // typing "mojito" would never match (and most drink names are printed in capitals).
  const needle = foldSearch(query.trim(), locale);
  const visible = useMemo(() => {
    const matches = (item: GuestItem) => {
      if (!item.isAvailable) return false;
      if (tagFilters.length > 0 && !item.tags.some((tag) => tagFilters.includes(tag as ItemTagId))) return false;
      if (!needle) return true;
      return foldSearch(`${item.name} ${item.detail ?? ""}`, locale).includes(needle);
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

  const tabStyle = effectiveCategoryTabStyle(state.design.options.categoryTabStyle, categories.length);
  // Showcase: the guest first sees every category as a photo card; a tap opens that category on its own page.
  const isShowcase = tabStyle === "SHOWCASE";
  const filtering = needle !== "" || tagFilters.length > 0;
  // Accordion: every category starts folded and only the tapped one is open; the other styles always show one.
  const isAccordion = tabStyle === "ACCORDION";
  // Single page: every category is printed one under the other; the navigation only jumps to a section.
  const isSinglePage = tabStyle === "SINGLE_PAGE";
  const isDropdown = tabStyle === "DROPDOWN";
  const pickedVisible = visible.some((category) => category.id === picked) ? picked : null;
  const activeId = isAccordion || isShowcase ? pickedVisible : (pickedVisible ?? visible[0]?.id ?? null);
  const active = visible.find((category) => category.id === activeId);
  const presentTags = new Set(
    categories.flatMap((category) => categoryItems(category).filter((item) => item.isAvailable).flatMap((item) => item.tags)),
  );
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
  const heroCover = options.hero === "COVER" && COVER_IMAGE_PATTERN.test(options.heroImageUrl) ? options.heroImageUrl : null;
  // The room frame above already shows the hotel logo, the room and the menu title; the cover would repeat them.
  const coverInRoomFrame = mode === "room" && heroCover !== null;
  const showTools = options.showSearch || options.showFilters;

  // Showcase: keep the open category's chip in view inside the sliding strip.
  useEffect(() => {
    if (!isShowcase || !activeId) return;
    document.getElementById(`g-tab-${activeId}`)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [isShowcase, activeId]);
  const openShowcaseCategory = (id: string | null) => {
    setPicked(id);
    requestAnimationFrame(() => document.getElementById("g-show-top")?.scrollIntoView({ block: "start" }));
  };

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

  const subNav = active && active.subcategories.length > 1 ? (
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
          ) : null;
  const renderBody = (category: (typeof visible)[number]) => (
    <>
        {category.items.length > 0 ? (
          <section id={category.id === activeId ? "g-direct-items" : undefined} className="g-sub">
            <ItemCards
              items={category.items}
              onOpen={handleOpenItem}
              format={format}
              photoCountLabel={(cnt) => t("menu.photoCount", { count: cnt })}
              showPrice={showPrice}
              photoIds={photoIds}
              priceLists={options.priceLists}
            />
          </section>
        ) : null}
        {category.subcategories.map((sub) => (
          <section key={sub.id} id={`g-sub-${sub.id}`} className="g-sub">
            <h2>{sub.name}</h2>
            {sub.items.length > 0 ? (
              <ItemCards
                items={sub.items}
                onOpen={handleOpenItem}
                format={format}
                photoCountLabel={(cnt) => t("menu.photoCount", { count: cnt })}
                showPrice={showPrice}
                photoIds={photoIds}
                priceLists={options.priceLists}
              />
            ) : null}
            {sub.groups.map((group) => (
              <div key={group.id} className="g-group">
                <h3>{group.name}</h3>
                {group.detail ? <p className="g-detail">{group.detail}</p> : null}
                <ItemCards
                  items={group.items}
                  onOpen={handleOpenItem}
                  format={format}
                  photoCountLabel={(cnt) => t("menu.photoCount", { count: cnt })}
                  showPrice={showPrice}
                  photoIds={photoIds}
                  priceLists={options.priceLists}
                />
              </div>
            ))}
          </section>
        ))}
    </>
  );

  const isTable = mode === "table";
  const heroCallButton =
    isTable && options.callWaiterPosition === "HERO_BOTTOM" ? (
      <div className="g-hero-call-wrap" key="hero-call">
        <CallWaiterButton
          token={token ?? "onizleme"}
          locale={locale}
          options={state.callOptions ?? []}
          preview={!token || token === "onizleme"}
          customText={options.callWaiterText}
        />
      </div>
    ) : null;

  // A full-width logo is a banner over the whole menu column, so it never sits inside the padded hero box.
  const logoFull = options.logoSize === "FULL";
  const logo = (alt: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="g-hero-logo"
      src={options.logoUrl}
      alt={alt}
      loading="eager"
      decoding="async"
      data-size={options.logoSize}
      data-align={logoFull ? undefined : options.logoAlign}
    />
  );

  const blocks: Record<string, ReactNode> = {
    hero:
      (options.hero === "NONE" && !heroCallButton && !options.logoUrl) || (coverInRoomFrame && !heroCallButton) ? null : (
        <div key="hero-wrap" className="g-hero-block-wrap">
          {coverInRoomFrame ? null : heroCover ? (
            <section className="g-design-hero" key="hero" data-cover="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="g-hero-cover"
                src={heroCover}
                alt={`${outletTitle} · ${state.hotelName}`}
                loading="eager"
                fetchPriority="high"
                width={600}
                height={600}
              />
            </section>
          ) : options.hero !== "NONE" ? (
            <>
            {options.logoUrl && logoFull ? (
              <div className="g-logo-only" key="logo" data-size="FULL">
                {logo("")}
              </div>
            ) : null}
            <section
              className="g-design-hero"
              key="hero"
              data-photo={heroPhoto ? "true" : undefined}
              style={{
                ...(options.heroAlign ? {
                  textAlign: options.heroAlign,
                  alignItems: options.heroAlign === "center" ? "center" : options.heroAlign === "right" ? "flex-end" : "flex-start",
                } : {}),
                ...(options.heroBgColor ? { background: options.heroBgColor } : {}),
                ...(options.heroTextColor ? { color: options.heroTextColor } : {}),
              }}
            >
              {heroPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="g-hero-img"
                  src={heroPhoto}
                  alt={`${outletTitle} · ${state.hotelName}`}
                  loading="eager"
                  fetchPriority="high"
                />
              ) : null}
              {options.logoUrl && !logoFull ? logo("") : null}
              <span style={{ ...(options.heroTextColor ? { color: options.heroTextColor } : {}) }}>
                {state.hotelName}
              </span>
              <h2
                style={{
                  ...(options.heroFontSize === "small" ? { fontSize: "1.1rem" } :
                      options.heroFontSize === "medium" ? { fontSize: "1.35rem" } :
                      options.heroFontSize === "large" ? { fontSize: "1.65rem" } :
                      options.heroFontSize === "xlarge" ? { fontSize: "2rem" } : {}),
                  ...resolveHeroFont(options.heroFontFamily),
                  ...(options.heroFontFamily === "greatvibes" ? { fontSize: "2.1rem", lineHeight: 1.15 } : {}),
                  ...(options.heroFontFamily === "bebas" ? { fontSize: "1.75rem", letterSpacing: "0.06em" } : {}),
                  ...(options.heroTextColor ? { color: options.heroTextColor } : {}),
                }}
              >
                {outletTitle}
              </h2>
            </section>
            </>
          ) : options.logoUrl ? (
            <div className="g-logo-only" key="logo" data-size={logoFull ? "FULL" : undefined}>
              {logo(outletTitle)}
            </div>
          ) : null}
          {heroCallButton}
        </div>
      ),
    categories: (
      <div key="categories" className={isShowcase ? "g-show-host" : undefined}>
        {categories.length === 0 ? (
          <p className="g-empty">{t("menu.empty")}</p>
        ) : visible.length === 0 || isAccordion ? null : isShowcase ? (
          <>
            <span id="g-show-top" className="g-show-anchor" aria-hidden="true" />
            {active ? (
              <nav className="g-show-bar" data-guide="kategori-gezin" aria-label={t("menu.allCategories")}>
                <button type="button" className="g-show-back" onClick={() => openShowcaseCategory(null)}>
                  <span className="g-show-back-arrow" aria-hidden="true" />
                  <span>{t("menu.allCategories")}</span>
                </button>
                <div className="g-show-strip" role="tablist" onKeyDown={handleTabKeyDown}>
                  {visible.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      role="tab"
                      id={`g-tab-${category.id}`}
                      aria-selected={category.id === activeId}
                      tabIndex={category.id === activeId ? 0 : -1}
                      aria-controls="g-panel"
                      onClick={() => openShowcaseCategory(category.id)}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </nav>
            ) : null}
          </>
        ) : (
          <div className="g-tabs-shell" data-nav-open={isDropdown && navOpen ? "true" : undefined}>
          {isDropdown ? (
            <button
              type="button"
              className="g-drop-head"
              aria-expanded={navOpen}
              aria-controls="g-tabs-list"
              onClick={() => setNavOpen((current) => !current)}
            >
              <span className="g-drop-name">{active?.name}</span>
              <span className="g-acc-chevron" data-up={navOpen ? "true" : undefined} aria-hidden="true" />
            </button>
          ) : null}
          <div
            data-guide="kategori-gezin"
            id="g-tabs-list"
            hidden={isDropdown && !navOpen}
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
                onClick={() => {
                  setPicked(category.id);
                  setNavOpen(false);
                  if (isSinglePage) {
                    document.getElementById(`g-cat-${category.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  } else if (tabStyle === "PHOTO_TILES" || tabStyle === "NUMBERED_INDEX" || tabStyle === "SIDE_RAIL" || isDropdown) {
                    // The dishes replace the previous category's: bring their start into view.
                    requestAnimationFrame(() => document.getElementById("g-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
                  }
                }}
              >
                {tabStyle === "PHOTO_TILES" ? (
                  categoryPhoto(category) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="g-tab-photo" src={categoryPhoto(category)} alt="" loading="lazy" decoding="async" width={320} height={320} />
                  ) : (
                    <span className="g-tab-photo g-placeholder" aria-hidden="true" />
                  )
                ) : null}
                <span className="g-tab-label">{category.name}</span>
                <span className="g-tab-count" aria-label={t("menu.itemsFound", { count: categoryItemCount(category) })}>
                  {categoryItemCount(category)}
                </span>
              </button>
            ))}
          </div>
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
          {isAccordion || isSinglePage ? null : subNav}
        </div>
        ) : null}
        {isShowcase && !active && !filtering && visible.length > 0 ? (
          <ul className="g-show-grid" data-guide="kategori-gezin" aria-label={t("menu.allCategories")}>
            {visible.map((category) => (
              <li key={category.id}>
                <button type="button" className="g-show-card" onClick={() => openShowcaseCategory(category.id)}>
                  {categoryPhoto(category) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="g-show-photo" src={categoryPhoto(category)} alt="" loading="lazy" decoding="async" width={320} height={320} />
                  ) : (
                    <span className="g-show-photo g-show-initial" aria-hidden="true">{category.name.trim().charAt(0)}</span>
                  )}
                  <span className="g-show-name">{category.name}</span>
                  <span className="g-show-count" aria-label={t("menu.itemsFound", { count: categoryItemCount(category) })}>
                    {categoryItemCount(category)}
                  </span>
                  <span className="g-show-go" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {isAccordion && visible.length > 0 ? (
          <div className="g-acc" data-guide="kategori-gezin">
            {visible.map((category) => {
              const open = category.id === activeId;
              return (
                <section key={category.id} className="g-acc-item" data-open={open ? "true" : undefined}>
                  <h2 className="g-acc-title">
                    <button
                      type="button"
                      className="g-acc-head"
                      id={`g-tab-${category.id}`}
                      aria-expanded={open}
                      aria-controls={`g-acc-panel-${category.id}`}
                      onClick={(e) => {
                        const head = e.currentTarget;
                        setPicked(open ? null : category.id);
                        // The panel above may fold away; keep the tapped heading on screen.
                        requestAnimationFrame(() => head.scrollIntoView({ behavior: "smooth", block: open ? "nearest" : "start" }));
                      }}
                    >
                      <span className="g-acc-name">{category.name}</span>
                      <span className="g-acc-count">{categoryItemCount(category)}</span>
                      <span className="g-acc-chevron" aria-hidden="true" />
                    </button>
                  </h2>
                  {open ? (
                    <div className="g-acc-panel" id={`g-acc-panel-${category.id}`} role="region" aria-labelledby={`g-tab-${category.id}`}>
                      {subNav ? <div className="g-acc-subnav">{subNav}</div> : null}
                      {renderBody(category)}
                      <div className="g-acc-foot">
                        <button
                          type="button"
                          className="g-acc-close"
                          onClick={() => {
                            setPicked(null);
                            requestAnimationFrame(() =>
                              document.getElementById(`g-tab-${category.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
                            );
                          }}
                        >
                          {t("menu.collapse")}
                          <span className="g-acc-chevron" data-up="true" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    ),
    items: (
      <div
        id="g-panel"
        role={isAccordion || (isShowcase && !active) ? undefined : "tabpanel"}
        aria-labelledby={!isAccordion && activeId ? `g-tab-${activeId}` : undefined}
        key="items"
      >
        {visible.length === 0 && categories.length > 0 ? (
          // Search/filters active: "no match"; nothing orderable at all (every dish sold out): neutral notice.
          <p className="g-empty">{t(needle || tagFilters.length > 0 ? "menu.noResults" : "menu.nothingAvailable")}</p>
        ) : null}
        {options.showFeatured && featured.length > 0 ? (
          <section className="g-sub" aria-label={featuredTitle}>
            <h2>{featuredTitle}</h2>
            <ul className="g-featured">
              {featured.map((item) => (
                <li key={item.id}>
                  <button type="button" className="g-featured-card" onClick={() => handleOpenItem(item.id)}>
                    {options.showImages && item.imageUrl && (photoIds === null || photoIds.has(item.id)) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" loading="lazy" decoding="async" width={320} height={320} />
                    ) : null}
                    <span>{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {isShowcase && active ? <h2 className="g-show-title">{active.name}</h2> : null}
        {isSinglePage || (isShowcase && !active && filtering)
          ? visible.map((category) => (
              <section key={category.id} id={`g-cat-${category.id}`} className="g-page-section" aria-labelledby={`g-cat-title-${category.id}`}>
                <h2 className="g-page-title" id={`g-cat-title-${category.id}`}>{category.name}</h2>
                {renderBody(category)}
              </section>
            ))
          : !isAccordion && active
            ? renderBody(active)
            : null}
        <p className="g-legal">{t("menu.allergenNote")}</p>
      </div>
    ),
  };

  const Container = mode === "room" ? "div" : "main";
  return (
    <Container className="g-menu">
      {state.design.layout.map((block) => blocks[block])}
      {token ? <BackToTop label={t("menu.backToTop")} /> : null}
      {visibleOpenItem ? (
        <ItemSheet
          item={visibleOpenItem}
          price={showPrice && visibleOpenItem.price ? format(visibleOpenItem.price) : undefined}
          orderingOpen={orderingOpen}
          itemNote={mode !== "room"}
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
