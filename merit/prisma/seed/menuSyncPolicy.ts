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
