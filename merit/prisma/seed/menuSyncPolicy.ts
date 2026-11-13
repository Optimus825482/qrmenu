import { createHash } from "node:crypto";

export type MenuSyncDecision = "rebuild" | "refresh-images" | "skip-keep";

export interface MenuSyncFacts {
  /** Outlet'in toplam menü düğümü sayısı (her tür). */
  menuNodeCount: number;
  /** MERIT_MENUS_FORCE_RESET=true. */
  forceReset: boolean;
  /** Mevcut menü seed ile uyumlu v2 yapıda (görsel yükseltmesi güvenli). */
  isCurrentV2Menu: boolean;
  /**
   * Veri dosyasında bu outlet'in menüsü, veritabanına en son kurulandan farklı (damga yok ya da eşleşmiyor).
   * Verilmezse "değişmedi" sayılır.
   */
  datasetChanged?: boolean;
}

/**
 * Menü senkronunun tek karar noktası. Menü; boşken, veri dosyasındaki hali değiştiğinde ya da açık bayrakla
 * yeniden kurulur. Outlet'in siparişi olması buna engel değildir: yeniden kurulum sipariş verisine dokunmaz,
 * eski siparişlerde geçen ürünler silinmek yerine pasif arşiv kategorisine alınır (bkz. MENU_ARCHIVE_CATEGORY).
 * Veri dosyası değişmediği sürece panelden elle yapılan menü düzenlemeleri yerinde kalır.
 */
export function decideMenuSync(f: MenuSyncFacts): MenuSyncDecision {
  if (f.menuNodeCount === 0) return "rebuild";
  if (f.forceReset || f.datasetChanged) return "rebuild";
  return f.isCurrentV2Menu ? "refresh-images" : "skip-keep";
}

/**
 * Inactive category that holds the items of a replaced menu which past orders still point to. An order line keeps
 * its own name and price snapshot, so the item only has to keep existing; guests never see inactive nodes.
 */
export const MENU_ARCHIVE_CATEGORY = "Arşiv: eski siparişlerdeki ürünler";

/** `settings.key` of the stamp that records which data-set menu an outlet currently carries. */
export const menuStampKey = (outletId: string) => `meritMenu:${outletId}`;

/** Fingerprint of one outlet's menu in the data set; any change to its items, prices or currency changes it. */
export function menuStamp(version: number, currency: string, spec: unknown): string {
  return createHash("sha256").update(JSON.stringify([version, currency, spec])).digest("hex").slice(0, 24);
}

/** An item of the menu on screen, read before a rebuild: what the panel may have changed on it. */
export type PanelItem = {
  /** Name of the item's top category. */
  categoryName: string;
  name: string;
  detail: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  allergens: string[];
  tags: string[];
  isAvailable: boolean;
  translations: { lang: string; name: string; detail: string | null; isVerified: boolean }[];
};

/** Images of the data file live here; any other address was put on the item in the panel. */
const DATASET_IMAGE_PREFIX = "/merit-menus/";

/**
 * Finds the old item a new one replaces: the same name in the same top category, else the same name when the old
 * menu has it only once (an item the new document moved to another category).
 */
export function panelItemLookup(old: readonly PanelItem[]): (categoryName: string, name: string) => PanelItem | undefined {
  const exact = new Map<string, PanelItem>();
  const byName = new Map<string, PanelItem[]>();
  for (const item of old) {
    exact.set(`${item.categoryName}\u0000${item.name}`, item);
    byName.set(item.name, [...(byName.get(item.name) ?? []), item]);
  }
  return (categoryName, name) => {
    const same = exact.get(`${categoryName}\u0000${name}`);
    if (same) return same;
    const named = byName.get(name);
    return named?.length === 1 ? named[0] : undefined;
  };
}

/**
 * What a rebuilt item keeps from the one it replaces. A menu is rebuilt when its document changes (a price, a new
 * item); the work done in the panel must not be lost with it:
 * - allergens and tags entered in the panel stay (the document's are used while the panel has none),
 * - a photo put on the item in the panel stays (a photo of the data file follows the file),
 * - "Tükendi" stays,
 * - translations other than the document's English stay while the item's Turkish text is unchanged; an item whose
 *   description changed is translated again.
 * Name, description and price always follow the document.
 */
export function carryPanelEdits(
  item: { detail?: string | null; imageUrl?: string | null; allergens: string[]; tags: string[] },
  old: PanelItem | undefined,
): {
  allergens: string[];
  tags: string[];
  imageUrl: string | null;
  imageUrls: string[];
  isAvailable: boolean;
  translations: PanelItem["translations"];
} {
  const datasetImage = item.imageUrl ?? null;
  const fromFile = {
    allergens: item.allergens,
    tags: item.tags,
    imageUrl: datasetImage,
    imageUrls: datasetImage ? [datasetImage] : [],
    isAvailable: true,
    translations: [],
  };
  if (!old) return fromFile;
  const panelImage = old.imageUrl !== null && !old.imageUrl.startsWith(DATASET_IMAGE_PREFIX);
  const sameText = (old.detail ?? "") === (item.detail ?? "");
  return {
    allergens: old.allergens.length > 0 ? old.allergens : item.allergens,
    tags: old.tags.length > 0 ? old.tags : item.tags,
    imageUrl: panelImage ? old.imageUrl : datasetImage,
    imageUrls: panelImage ? (old.imageUrls.length > 0 ? old.imageUrls : [old.imageUrl as string]) : fromFile.imageUrls,
    isAvailable: old.isAvailable,
    translations: sameText ? old.translations.filter((t) => t.lang !== "en") : [],
  };
}
