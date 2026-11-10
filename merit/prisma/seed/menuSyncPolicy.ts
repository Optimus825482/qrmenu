export type MenuSyncDecision = "rebuild" | "refresh-images" | "skip-keep" | "refuse-has-orders";

export interface MenuSyncFacts {
  /** Outlet'in toplam menü düğümü sayısı (her tür). */
  menuNodeCount: number;
  /** Outlet'e bağlı sipariş sayısı. */
  orderCount: number;
  /** MERIT_MENUS_FORCE_RESET=true. */
  forceReset: boolean;
  /** Mevcut menü seed ile uyumlu v2 yapıda (görsel yükseltmesi güvenli). */
  isCurrentV2Menu: boolean;
}

/**
 * Menü senkronunun tek karar noktası. Silme yalnız menü BOŞKEN ya da açık ve bilinçli
 * bayrakla (ve siparişsizken) yapılır; sipariş verisi hiçbir koşulda silinmez.
 */
export function decideMenuSync(f: MenuSyncFacts): MenuSyncDecision {
  if (f.menuNodeCount === 0) return "rebuild";
  if (f.forceReset) return f.orderCount > 0 ? "refuse-has-orders" : "rebuild";
  return f.isCurrentV2Menu ? "refresh-images" : "skip-keep";
}
